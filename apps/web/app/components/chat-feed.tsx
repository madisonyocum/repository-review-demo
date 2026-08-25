import { useEffect, useRef } from "react"
import { Check } from "lucide-react"

import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"
import { useAppState } from "@/state/store"
import type { Chip, Entry, Story } from "@/state/types"
import { Sparkle } from "./icons"

const clock = (at: number) =>
  new Date(at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })

/**
 * A beat with choices has two states. Live, it offers real buttons — that's
 * the only place a demo should be clicking. Once the conversation has moved
 * past it, the buttons are gone (they're not a way to rewind the demo) and
 * collapse to a single checkmark line naming whichever one was actually
 * chosen, the way a completed step reads in a changelog. If free text or an
 * edited suggestion was sent instead of a button, there's nothing to name, so
 * the turn just shows no control at all — a plain record of what was said.
 */
function chosenChip(beat: Story[string], next: Entry | undefined): Chip | null {
  if (!next || next.kind !== "user") return null
  return (
    beat.chips?.find((c) => c.style !== "hidden" && c.label === next.text) ??
    null
  )
}

export function ChatFeed({
  beats,
  onChip,
}: {
  beats: Story
  onChip: (chip: Chip) => void
}) {
  const { transcript } = useAppState()
  const end = useRef<HTMLDivElement>(null)

  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth", block: "end" })
  }, [transcript.length])

  const lastBeatIndex = transcript.reduce(
    (found, entry, i) => (entry.kind === "beat" ? i : found),
    -1
  )

  return (
    <div className="space-y-6">
      {transcript.map((entry, i) => {
        if (entry.kind === "user") {
          return (
            <div
              key={i}
              className="animate-in fade-in slide-in-from-bottom-2 flex justify-end gap-3 duration-300 ease-out"
            >
              <p className="max-w-lg rounded-2xl bg-secondary px-4 py-3 text-[0.9375rem] leading-relaxed text-secondary-foreground">
                {entry.text}
              </p>
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-medium text-primary-foreground">
                JS
              </span>
            </div>
          )
        }

        const beat = beats[entry.beatId]
        if (!beat) return null
        const live = i === lastBeatIndex
        const visible = (beat.chips ?? []).filter((c) => c.style !== "hidden")
        const links = visible.filter((c) => c.style === "link")
        const buttons = visible.filter((c) => c.style !== "link")
        const chosen = live ? null : chosenChip(beat, transcript[i + 1])

        return (
          <div
            key={i}
            className="animate-in fade-in slide-in-from-bottom-2 flex gap-3 duration-300 ease-out"
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-[0.6rem] bg-primary/10 text-primary">
              <Sparkle className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="mb-1.5 text-sm">
                <span className="font-medium text-foreground">Assistant</span>{" "}
                <span className="text-muted-foreground">
                  {live ? "now" : clock(entry.at)}
                </span>
              </p>

              <div className="text-[0.9375rem] leading-relaxed">
                {beat.content}
              </div>

              {live && buttons.length > 0 && (
                <div className="animate-in fade-in mt-4 flex flex-wrap gap-2.5 duration-300 [animation-delay:150ms] [animation-fill-mode:backwards]">
                  {buttons.map((chip) => (
                    <Button
                      key={chip.label + chip.next}
                      size="lg"
                      variant={
                        chip.primary
                          ? "default"
                          : chip.tone === "destructive"
                            ? "destructive"
                            : "outline"
                      }
                      className="h-11 text-[0.9375rem]"
                      onClick={() => onChip(chip)}
                    >
                      {chip.label}
                    </Button>
                  ))}
                </div>
              )}

              {live && links.length > 0 && (
                <div className="animate-in fade-in mt-3 flex flex-col items-start gap-2 duration-300 [animation-delay:150ms] [animation-fill-mode:backwards]">
                  {links.map((chip) => (
                    <button
                      key={chip.label + chip.next}
                      type="button"
                      onClick={() => onChip(chip)}
                      className="flex cursor-pointer items-center gap-2 text-[0.9375rem] font-medium text-primary hover:underline"
                    >
                      <Check className="size-4 shrink-0" />
                      {chip.label}
                    </button>
                  ))}
                </div>
              )}

              {chosen && (
                <p
                  className={cn(
                    "animate-in fade-in mt-3 flex items-center gap-2 text-[0.9375rem] font-medium duration-300",
                    chosen.tone === "destructive"
                      ? "text-destructive"
                      : "text-primary"
                  )}
                >
                  <Check className="size-4 shrink-0" />
                  {chosen.label}
                </p>
              )}
            </div>
          </div>
        )
      })}
      <div ref={end} />
    </div>
  )
}
