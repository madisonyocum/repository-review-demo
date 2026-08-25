import { useEffect, useState } from "react"

/**
 * How long the assistant takes to answer. Not one fixed pause: most turns
 * come back at a conversational speed, and roughly one in three takes
 * noticeably longer, the way a real answer sometimes does. Long enough to
 * read as considered, short enough that clicking through a demo never feels
 * like waiting on a spinner.
 */
const QUICK_MS = 720
const CONSIDERED_MS = 1650

/**
 * Derived from the turn's own timestamp rather than Math.random(), so it is
 * stable across re-renders and a step back with Undo replays the same pause
 * it had the first time.
 */
export function pauseFor(at: number): number {
  if (!at) return QUICK_MS
  return at % 3 === 0 ? CONSIDERED_MS + (at % 400) : QUICK_MS + (at % 300)
}

/**
 * True while the assistant is still working on the turn that arrived at `at`.
 * `pending` is real waiting — the convention reader — rather than the
 * scripted kind, and holds for as long as it actually takes.
 */
export function useThinking(at: number, pending = false): boolean {
  const [settled, setSettled] = useState(false)
  useEffect(() => {
    setSettled(false)
    const timer = setTimeout(() => setSettled(true), pauseFor(at))
    return () => clearTimeout(timer)
  }, [at])
  return !settled || pending
}

/**
 * The pause itself, shown just above the composer where the next answer is
 * about to appear. Two states use it: the scripted beats, and the one place
 * the product really is waiting on something — reading a typed convention.
 */
export function Thinking({ label = "Thinking…" }: { label?: string }) {
  return (
    <div
      className="flex items-center gap-2.5 py-1"
      role="status"
      aria-live="polite"
    >
      <svg
        viewBox="0 0 24 24"
        className="size-5 shrink-0 animate-spin text-primary [animation-duration:0.7s]"
        aria-hidden="true"
      >
        <circle
          cx="12"
          cy="12"
          r="9"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeOpacity="0.2"
        />
        <path
          d="M12 3a9 9 0 0 1 8.49 6"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      </svg>
      <span className="animate-pulse text-[0.9375rem] text-muted-foreground">
        {label}
      </span>
    </div>
  )
}
