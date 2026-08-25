import { useEffect, useRef, useState } from "react"

import { cn } from "@workspace/ui/lib/utils"

/**
 * Counts up or down to the new value and bumps the scale, so a number that
 * changes because of something you did is visibly the same number moving —
 * not a different number appearing.
 *
 * requestAnimationFrame is paused in a background tab, so an animation started
 * there would never finish and the number would sit frozen at a stale value.
 * When the page is hidden the count snaps instead, and it re-syncs on the way
 * back to visible.
 */
export function AnimatedCount({
  value,
  bump,
  className,
}: {
  value: number
  bump?: boolean
  className?: string
}) {
  const [shown, setShown] = useState(value)
  const [pulsing, setPulsing] = useState(false)
  const frame = useRef<number | undefined>(undefined)
  const target = useRef(value)
  target.current = value

  useEffect(() => {
    if (document.hidden) {
      setShown(value)
      return
    }

    let from = 0
    setShown((current) => {
      from = current
      return current
    })

    const start = performance.now()
    let duration = 0

    const step = (now: number) => {
      if (!duration) {
        duration = Math.min(700, 180 + Math.abs(value - from) * 12)
      }
      const t = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - t, 3)
      setShown(Math.round(from + (value - from) * eased))
      if (t < 1) frame.current = requestAnimationFrame(step)
    }

    frame.current = requestAnimationFrame(step)
    return () => {
      if (frame.current) cancelAnimationFrame(frame.current)
    }
  }, [value])

  // Coming back to a tab that was hidden mid-change: land on the real number.
  useEffect(() => {
    const sync = () => {
      if (!document.hidden) setShown(target.current)
    }
    document.addEventListener("visibilitychange", sync)
    return () => document.removeEventListener("visibilitychange", sync)
  }, [])

  useEffect(() => {
    if (!bump) return
    setPulsing(true)
    const id = setTimeout(() => setPulsing(false), 520)
    return () => clearTimeout(id)
  }, [bump, value])

  return (
    <span
      className={cn(
        "inline-block tabular-nums transition-transform duration-300 ease-out",
        pulsing && "scale-115",
        className
      )}
    >
      {shown}
    </span>
  )
}
