import { useMemo } from "react"

import { ChangesRail } from "@/components/changes-rail"
import { ChatFeed } from "@/components/chat-feed"
import { Composer } from "@/components/composer"
import { LeftRail } from "@/components/left-rail"
import { ReviewTable } from "@/components/review-table"
import { Tiles } from "@/components/tiles"
import { ManifestPanel } from "@/components/manifest-panel"
import { TopBar } from "@/components/top-bar"
import { Uploader } from "@/components/uploader"
import { StoreProvider, useStore } from "@/state/store"
import { applyEverything, buildStories } from "@/state/stories"
import type { Chip } from "@/state/types"

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
      stories ? [...stories.STORY_A, ...stories.STORY_B].map((b) => b.id) : [],
    [stories]
  )

  const currentBeatId = [...state.transcript]
    .reverse()
    .find((e) => e.kind === "beat")?.beatId
  const currentBeat =
    stories && currentBeatId ? stories.all[currentBeatId] : undefined
  function go(next: string) {
    if (!stories || !state.result) return
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
    // A hub beat can hand off to the other story's opening beat. That's a
    // fresh transcript for that story, the same as clicking its dashboard
    // tile — not another turn appended to whichever story is running now.
    if (next === "a1" && state.storyId !== "A") {
      dispatch({ type: "story", id: "A", firstBeat: "a1" })
      return
    }
    const beat = stories.all[next]
    if (!beat) return
    dispatch({ type: "beat", beatId: beat.id, effect: beat.effect })

    // Some beats hand straight on, with no turn from the user between them.
    let follow = beat.then ? stories.all[beat.then] : undefined
    const seen = new Set([beat.id])
    while (follow && !seen.has(follow.id)) {
      seen.add(follow.id)
      dispatch({ type: "beat", beatId: follow.id, effect: follow.effect })
      follow = follow.then ? stories.all[follow.then] : undefined
    }
  }

  function onChip(chip: Chip) {
    dispatch({ type: "say", text: chip.label })
    go(chip.next)
  }

  /**
   * Free text always advances. It follows the beat's primary chip when there is
   * one — that is the path the beat was written for — and otherwise the next
   * beat in sequence. Either way the story moves, so unexpected input can never
   * strand the demo.
   */
  function onSay(text: string) {
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
    const next = matched?.next ?? primary?.next ?? fallback?.next ?? successor
    if (next) go(next)
  }

  return (
    <div className="flex h-svh flex-col bg-background text-foreground">
      <TopBar />
      <div className="flex min-h-0 flex-1">
        <LeftRail />
        {/* The composer is a fixed bar at the foot of the main region; only
            the panel above it scrolls. Every region is on screen from the
            first frame — just the panel changes with the view. */}
        <main className="flex min-w-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto px-6">
            <div className="mx-auto w-full max-w-[64rem] space-y-4 py-4">
              <Tiles compact={state.view !== "upload" && state.view !== "dashboard"} />
              {state.view === "upload" && <Uploader />}
              {state.view === "dashboard" && <ReviewTable />}
              {state.view === "chat" && stories && (
                <div className="mt-6">
                  <ChatFeed beats={stories.all} onChip={onChip} />
                </div>
              )}
              {state.view === "manifest" && <ManifestPanel />}
            </div>
          </div>
          <div className="shrink-0 px-6">
            <div className="mx-auto w-full max-w-[64rem]">
              <Composer
                onSay={onSay}
                suggestion={
                  state.view === "chat" ? currentBeat?.suggest : undefined
                }
                disabled={!state.result}
              />
            </div>
          </div>
        </main>
        <ChangesRail />
      </div>
    </div>
  )
}
