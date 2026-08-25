import { useMemo } from "react"

import { cn } from "@workspace/ui/lib/utils"
import { ChangesRail } from "@/components/changes-rail"
import { ChatFeed } from "@/components/chat-feed"
import { Composer } from "@/components/composer"
import { LeftRail } from "@/components/left-rail"
import { ReviewTable } from "@/components/review-table"
import { Tiles } from "@/components/tiles"
import { ManifestPanel } from "@/components/manifest-panel"
import { TopBar } from "@/components/top-bar"
import { Thinking, useThinking } from "@/components/thinking"
import { LoadToast } from "@/components/toast"
import { Uploader } from "@/components/uploader"
import { parseConvention } from "@/lib/llm"
import { StoreProvider, useStore } from "@/state/store"
import { applyEverything, buildStories } from "@/state/stories"
import type { Chip, State } from "@/state/types"

export function meta() {
  return [{ title: "Repository Review" }]
}

export default function Home() {
  return (
    <StoreProvider>
      <Screen />
    </StoreProvider>
  )
}

/**
 * One screen. The regions are always present; only their contents change with
 * the view.
 */
function Screen() {
  const { state, dispatch } = useStore()
  const stories = useMemo(
    () => (state.result ? buildStories(state.result) : null),
    [state.result]
  )

  const order = useMemo(
    () =>
      stories
        ? [...stories.STORY_C, ...stories.STORY_A, ...stories.STORY_B].map(
            (b) => b.id
          )
        : [],
    [stories]
  )

  const lastBeat = [...state.transcript]
    .reverse()
    .find((e) => e.kind === "beat")
  const currentBeat =
    stories && lastBeat ? stories.all[lastBeat.beatId] : undefined

  // The newest turn is still being thought about. Reading a typed convention
  // is the one case where that is real waiting rather than a scripted pause.
  const thinking = useThinking(
    lastBeat?.kind === "beat" ? lastBeat.at : 0,
    state.conventionPending
  )
  /**
   * `extra` is a chip's own effect, applied on top of the destination beat's.
   */
  function go(next: string, extra?: (s: State) => State) {
    if (!stories || !state.result) return
    // Back to whatever the convention step interrupted, with the convention
    // now settled — one action, so one Undo step, and the beat's own effect
    // still runs.
    if (next === "resume") {
      const target = state.pendingBeat ?? "a1"
      const beat = stories.all[target]
      if (!beat) return
      dispatch({
        type: "beat",
        beatId: target,
        effect: (s) => ({
          ...(beat.effect ? beat.effect(s) : s),
          conventionConfirmed: true,
        }),
      })
      return
    }
    if (next === "dashboard") {
      dispatch({ type: "view", view: "dashboard" })
      return
    }
    if (next === "manifest") {
      dispatch({
        type: "commit",
        effect: applyEverything(state.result),
        view: "manifest",
      })
      return
    }
    // Each story is walked once. Asking for a finished one again lands on a
    // beat that says so, rather than replaying it and recording the same
    // decisions a second time.
    if ((next === "a1" && state.done.A) || (next === "b1" && state.done.B)) {
      dispatch({ type: "beat", beatId: "again" })
      return
    }
    // A hub beat can hand off to the other story's opening beat. That's a
    // fresh transcript for that story, the same as clicking its dashboard
    // tile — not another turn appended to whichever story is running now.
    if (next === "a1" && state.storyId !== "A") {
      dispatch({ type: "story", id: "A", firstBeat: "a1" })
      return
    }
    const beat = stories.all[next]
    if (!beat) return
    const effect =
      beat.effect && extra
        ? (s: State) => extra(beat.effect!(s))
        : (beat.effect ?? extra)
    dispatch({ type: "beat", beatId: beat.id, effect })

    // Some beats hand straight on, with no real turn from the user between
    // them — but a scripted line (thenSay) can still land in the transcript
    // first, so a forced multi-step sequence still reads as a conversation
    // rather than two assistant messages run together.
    let current = beat
    let follow = current.then ? stories.all[current.then] : undefined
    const seen = new Set([beat.id])
    while (follow && !seen.has(follow.id)) {
      seen.add(follow.id)
      if (current.thenSay) dispatch({ type: "say", text: current.thenSay })
      dispatch({ type: "beat", beatId: follow.id, effect: follow.effect })
      current = follow
      follow = current.then ? stories.all[current.then] : undefined
    }
  }

  function onChip(chip: Chip) {
    dispatch({ type: "say", text: chip.sayAs ?? chip.label })
    go(chip.next, chip.effect)
  }

  /**
   * Free text always advances. It follows the beat's primary chip when there is
   * one — that is the path the beat was written for — and otherwise the next
   * beat in sequence. Either way the story moves, so unexpected input can never
   * strand the demo.
   *
   * One beat reads what was typed rather than only counting it: the convention
   * step sends the sentence to Claude when there's a key and to the local
   * reader when there isn't, and the chat shows it thinking while it waits.
   */
  async function onSay(text: string) {
    dispatch({ type: "say", text })
    if (!currentBeat) {
      // Typed from the dashboard: open the review conversation.
      if (stories) dispatch({ type: "story", id: "A", firstBeat: "a1" })
      return
    }
    // A deliberate detour: if what was actually typed matches a chip's
    // trigger words, that beat wins over the default path — this is the
    // only place typed content is read rather than just "did they send
    // anything." Everything else stays content-blind on purpose.
    const said = text.toLowerCase()
    const matched = currentBeat.chips?.find((c) =>
      c.matchText?.some((k) => said.includes(k))
    )
    const primary = currentBeat.chips?.find((c) => c.primary)
    const fallback = currentBeat.chips?.[0]
    const successor = order[order.indexOf(currentBeat.id) + 1]
    const next =
      matched?.next ??
      currentBeat.onFreeText ??
      primary?.next ??
      fallback?.next ??
      successor
    if (!next) return

    if (currentBeat.readsConvention && !matched) {
      dispatch({ type: "convention-pending" })
      go(next)
      const parsed = await parseConvention(text, state.convention)
      dispatch({
        type: "convention",
        convention: parsed.convention,
        via: parsed.via,
        notes: parsed.notes,
      })
      return
    }
    go(next)
  }

  return (
    <div className="flex h-svh flex-col bg-background text-foreground">
      <TopBar />
      <LoadToast at={state.loadedAt} files={state.result?.counts.total ?? 0} />
      <div className="flex min-h-0 flex-1">
        <LeftRail />
        {/* The composer is a fixed bar at the foot of the main region; only
            the panel above it scrolls. Every region is on screen from the
            first frame — just the panel changes with the view. */}
        <main className="flex min-w-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto px-6">
            {/* One grid for every view, so the panel keeps the same width
                whether a repository is loaded or not, and sits a single gap
                away from the rail beside it. */}
            <div
              className={cn(
                "mx-auto grid w-full max-w-[64rem] gap-4 py-4 xl:max-w-[90rem] xl:grid-cols-[1fr_25rem]",
                state.view === "upload" && "items-stretch"
              )}
            >
              <div
                className={cn(
                  "min-w-0",
                  state.view === "upload" ? "flex flex-col gap-4" : "space-y-4"
                )}
              >
                {/* Tiles stay the first child in every view. Wrapping them in
                    a fragment on one view and not another remounts them, and a
                    remounted count starts at its final value instead of
                    counting up to it. */}
                <Tiles
                  compact={
                    state.view !== "upload" && state.view !== "dashboard"
                  }
                />
                {/* The uploader takes whatever height is left, so if the rail
                    runs longer than the tiles the two columns still end on the
                    same line. */}
                {state.view === "upload" && (
                  <div className="flex-1">
                    <Uploader />
                  </div>
                )}
                {state.view === "dashboard" && <ReviewTable />}
                {state.view === "chat" && stories && (
                  <div className="mt-6">
                    <ChatFeed
                      beats={stories.all}
                      onChip={onChip}
                      thinking={thinking}
                    />
                  </div>
                )}
                {state.view === "manifest" && <ManifestPanel />}
              </div>
              <ChangesRail stretch={state.view === "upload"} />
            </div>
          </div>
          <div className="shrink-0 px-6">
            {/* On the opening screen the composer sits under the column of
                cards, not under the whole region: the same grid, so it takes
                the same left edge and the same width as the boxes above it. */}
            <div className="mx-auto grid w-full max-w-[64rem] gap-4 xl:max-w-[90rem] xl:grid-cols-[1fr_25rem]">
              <div className="min-w-0">
                {/* Directly above the composer, where the answer is about to
                  appear — the same place the eye already is. The spinner and
                  the word, nothing else: no avatar, because this isn't a turn
                  in the conversation yet. */}
                {state.view === "chat" && thinking && (
                  <div className="animate-in pt-1 pl-1 duration-200 fade-in">
                    <Thinking
                      label={
                        state.conventionPending
                          ? "Reading your convention\u2026"
                          : undefined
                      }
                    />
                  </div>
                )}
                <Composer
                  onSay={onSay}
                  suggestion={
                    state.view === "chat" && !thinking
                      ? currentBeat?.suggest
                      : undefined
                  }
                  disabled={!state.result}
                />
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
