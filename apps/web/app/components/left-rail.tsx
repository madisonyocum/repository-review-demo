import { AlertTriangle, Ban, Check } from "lucide-react"
import type { LucideIcon } from "lucide-react"

import { cn } from "@workspace/ui/lib/utils"
import { useAppState, useStore } from "@/state/store"
import type { Piles } from "@/state/types"
import { AnimatedCount } from "./animated-count"

const GROUPS: {
  key: keyof Piles
  label: string
  icon: LucideIcon
  iconTone: string
  countTone: string
}[] = [
  {
    key: "ready",
    label: "Ready to apply",
    icon: Check,
    iconTone: "text-primary",
    countTone: "text-primary",
  },
  {
    key: "review",
    label: "Needs review",
    icon: AlertTriangle,
    iconTone: "text-muted-foreground",
    countTone: "text-foreground",
  },
  {
    key: "unknown",
    label: "Can't identify",
    icon: Ban,
    iconTone: "text-destructive",
    countTone: "text-destructive",
  },
]

/** Always present. Zeroed until a repository is loaded. */
export function LeftRail() {
  const { piles, bumped, result } = useAppState()
  const { dispatch } = useStore()

  return (
    <aside className="w-[14rem] shrink-0 py-6 pr-2 pl-4">
      <nav className="space-y-1">
        {/* Overview goes back to the dashboard. The other two aren't wired to
            anything, so they don't pretend to be: no pointer, no hover. */}
        <button
          type="button"
          onClick={() => dispatch({ type: "view", view: "dashboard" })}
          disabled={!result}
          className="flex h-10 w-full cursor-pointer items-center rounded-[0.625rem] bg-primary/8 px-3.5 text-left text-[0.9375rem] font-medium text-primary transition-colors hover:bg-primary/12 disabled:cursor-default disabled:hover:bg-primary/8"
        >
          Overview
        </button>
        {["All documents", "Activity"].map((item) => (
          <span
            key={item}
            className="flex h-10 items-center rounded-[0.625rem] px-3.5 text-[0.9375rem] text-muted-foreground"
          >
            {item}
          </span>
        ))}
      </nav>

      <p className="mt-8 px-3.5 text-[11px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
        Review groups
      </p>

      <ul className="mt-3 space-y-1">
        {GROUPS.map(({ key, label, icon: Icon, iconTone, countTone }) => (
          <li
            key={key}
            className="flex h-10 items-center gap-2.5 rounded-[0.625rem] pr-2 pl-3.5 text-[0.9375rem]"
          >
            <Icon className={cn("size-[1.05rem] shrink-0", iconTone)} />
            <span className="truncate text-foreground">{label}</span>
            <AnimatedCount
              value={piles[key]}
              bump={bumped.includes(key)}
              className={cn("ml-auto text-sm font-medium", countTone)}
            />
          </li>
        ))}
      </ul>
    </aside>
  )
}
