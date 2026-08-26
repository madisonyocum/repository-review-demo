import { useEffect, useRef } from "react"
import { Check } from "lucide-react"

import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"
import { APPROVER_INITIALS } from "@/lib/people"
import { useAppState } from "@/state/store"
import type { Chip, Story } from "@/state/types"
import { ShownAs, ShownSample } from "./beats"
import { Sparkle } from "./icons"

const clock = (at: number) =>
  new Date(at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })

/**
 * Chips are live controls, not a record. While a beat is the current one it
 * offers real buttons — the only place a demo should be clicking. Once the
 * conversation has moved past it the buttons are simply gone: what was
 * chosen is already in the transcript as the user's own line, and echoing it
 * back under the assistant's turn says the same thing twice.
 */
export function ChatFeed({
  beats,
  onChip,
  thinking,
}: {
  beats: Story
  onChip: (chip: Chip) => void
  /** The newest turn hasn't landed yet — its spinner is above the composer. */
  thinking: boolean
}) {
  const { transcript } = useAppState()
  const end = useRef<HTMLDivElement>(null)

  const lastBeatIndex = transcript.reduce(
    (found, entry, i) => (entry.kind === "beat" ? i : found),
    -1
  )

  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth", block: "end" })
  }, [transcript.length, thinking])

  return (
    <div className="space-y-6">
      {transcript.map((entry, i) => {
        if (entry.kind === "user") {
          return (
            <div
              key={i}
              className="flex animate-in justify-end gap-3 duration-300 ease-out fade-in slide-in-from-bottom-2"
            >
              <p className="max-w-lg rounded-2xl bg-secondary px-4 py-3 text-[0.9375rem] leading-relaxed text-secondary-foreground">
                {entry.text}
              </p>
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-medium text-primary-foreground">
                {APPROVER_INITIALS}
              </span>
            </div>
          )
        }

        const beat = beats[entry.beatId]
        if (!beat) return null
        const live = i === lastBeatIndex
        // Still being thought about: the feed ends on what the user said,
        // and the answer arrives whole rather than as an empty bubble that
        // fills in later.
        if (live && thinking) return null
        const visible = (beat.chips ?? []).filter((c) => c.style !== "hidden")
        const links = visible.filter((c) => c.style === "link")
        const buttons = visible.filter((c) => c.style !== "link")

        return (
          <div
            key={i}
            className="flex animate-in gap-3 duration-300 ease-out fade-in slide-in-from-bottom-2"
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

              {/* Prose stops at 80% of the column: full width is far too long
                  a line to read, and the eye loses the start of the next one
                  on the way back. Only the paragraphs — the cards and tables
                  below them are laid out in columns and want the full width,
                  so the cap is on direct <p> children rather than the whole
                  turn. */}
              <ShownAs.Provider value={live ? null : (entry.shown ?? null)}>
                <ShownSample.Provider
                  value={live ? null : (entry.sample ?? null)}
                >
                  <div className="text-[0.9375rem] leading-relaxed [&>p]:max-w-[80%]">
                    {beat.content}
                  </div>
                </ShownSample.Provider>
              </ShownAs.Provider>

              {live && buttons.length > 0 && (
                <div className="mt-4 flex animate-in flex-wrap gap-2.5 duration-300 [animation-delay:150ms] [animation-fill-mode:backwards] fade-in">
                  {buttons.map((chip) => (
                    <Button
                      key={chip.label + chip.next}
                      size="default"
                      variant={
                        chip.primary
                          ? "default"
                          : chip.tone === "destructive"
                            ? "destructive"
                            : "outline"
                      }
                      className={cn(
                        "h-10 text-sm",
                        !chip.primary &&
                          chip.tone !== "destructive" &&
                          "bg-background hover:bg-muted/50"
                      )}
                      onClick={() => onChip(chip)}
                    >
                      {chip.label}
                    </Button>
                  ))}
                </div>
              )}

              {live && links.length > 0 && (
                <div className="mt-3 flex animate-in flex-col items-start gap-2 duration-300 [animation-delay:150ms] [animation-fill-mode:backwards] fade-in">
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
            </div>
          </div>
        )
      })}
      <div ref={end} />
    </div>
  )
}
