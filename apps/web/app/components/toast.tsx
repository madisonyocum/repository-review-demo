import { useEffect, useState } from "react"
import { Check } from "lucide-react"

import { cn } from "@workspace/ui/lib/utils"

/**
 * The counts animate for up to 700ms after a repository loads. The
 * confirmation lands just after they settle, so it reads as the answer to
 * "did that work?" rather than competing with the numbers for attention.
 */
const APPEAR_AFTER_MS = 780
const STAY_MS = 3400
/** Long enough to read as leaving rather than being switched off. */
const LEAVE_MS = 320

/**
 * One toast, upper right, for one event: a repository was read. It is keyed on
 * when the load happened, so loading a second file shows it again.
 */
export function LoadToast({ at, files }: { at: number; files: number }) {
  // "gone" isn't rendered at all; "leaving" is still on screen, fading out.
  const [phase, setPhase] = useState<"gone" | "shown" | "leaving">("gone")

  useEffect(() => {
    if (!at) return
    setPhase("gone")
    const appear = setTimeout(() => setPhase("shown"), APPEAR_AFTER_MS)
    const leave = setTimeout(
      () => setPhase("leaving"),
      APPEAR_AFTER_MS + STAY_MS
    )
    const gone = setTimeout(
      () => setPhase("gone"),
      APPEAR_AFTER_MS + STAY_MS + LEAVE_MS
    )
    return () => {
      clearTimeout(appear)
      clearTimeout(leave)
      clearTimeout(gone)
    }
  }, [at])

  if (phase === "gone") return null

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "pointer-events-none fixed top-[4.5rem] right-[19px] z-50",
        phase === "shown"
          ? "animate-in fade-in zoom-in-95 slide-in-from-top-3 duration-500 ease-out"
          : "animate-out fade-out zoom-out-95 slide-out-to-top-2 fill-mode-forwards duration-300 ease-in"
      )}
    >
      <div className="surface-float flex items-center gap-3 px-5 py-4">
        <Check className="size-[1.15rem] shrink-0 text-ok" strokeWidth={2.25} />
        <p className="text-[0.9375rem] leading-snug">
          CSV uploaded successfully.{" "}
          <span className="text-muted-foreground">
            All <span className="numeric">{files}</span> files read and sorted.
          </span>
        </p>
      </div>
    </div>
  )
}
