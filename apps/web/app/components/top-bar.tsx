import { ChevronDown, Search, Undo2 } from "lucide-react"

import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"
import { APPROVER_INITIALS } from "@/lib/people"
import { useStore } from "@/state/store"
import { AnimatedCount } from "./animated-count"
import { Sparkle } from "./icons"

export function TopBar() {
  const { state, dispatch, undo, canUndo } = useStore()
  const total = state.result?.counts.total ?? 0
  const pct = total ? Math.round((state.resolved / total) * 100) : 0

  return (
    <header className="flex h-16 shrink-0 items-center gap-4 border-b border-border/70 bg-card px-7">
      <button
        type="button"
        onClick={() => dispatch({ type: "view", view: "dashboard" })}
        disabled={!state.result}
        title="Back to the dashboard"
        className="flex cursor-pointer items-center gap-2.5 rounded-[0.6rem] transition-opacity hover:opacity-80 disabled:cursor-default disabled:hover:opacity-100"
      >
        <span className="flex size-8 items-center justify-center rounded-[0.6rem] bg-primary text-primary-foreground">
          <Sparkle className="size-4" />
        </span>
        <span className="text-[1.0625rem] font-semibold">Repository Review</span>
      </button>

      <span className="text-border">/</span>

      <button
        type="button"
        className="flex min-w-0 items-center gap-1.5 text-sm text-foreground"
      >
        <span className={cn("truncate", !state.source && "text-muted-foreground")}>
          {state.source ?? "No repository loaded"}
        </span>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
      </button>

      {total > 0 && (
        <>
          <p className="ml-2 shrink-0 text-sm text-muted-foreground">
            <AnimatedCount
              value={state.resolved}
              bump={state.bumped.length > 0}
              className="text-foreground"
            />{" "}
            of {total} resolved
          </p>
          <div
            className="h-2 w-[15.5rem] shrink-0 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out"
              style={{ width: `${pct}%` }}
            />
          </div>
        </>
      )}

      <div className="ml-auto flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={undo}
          disabled={!canUndo}
          title="Undo the last step"
        >
          <Undo2 data-icon="inline-start" /> Undo
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label="Search">
          <Search />
        </Button>
        <span className="ml-1 flex size-9 items-center justify-center rounded-full bg-secondary text-xs font-medium text-foreground">
          {APPROVER_INITIALS}
        </span>
      </div>
    </header>
  )
}
