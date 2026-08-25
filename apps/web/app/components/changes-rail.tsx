import { ArrowUp, Check, Layers, Pencil, X } from "lucide-react"
import type { LucideIcon } from "lucide-react"

import { ago, initialled, kindOf, VERB, type HistoryKind } from "@/lib/history"
import { useAppState } from "@/state/store"

const ICON: Record<HistoryKind, LucideIcon> = {
  approved: Check,
  renamed: Pencil,
  rejected: X,
  escalated: ArrowUp,
  unchanged: Pencil,
  archived: Check,
}

const TONE: Record<HistoryKind, string> = {
  approved: "text-primary",
  renamed: "text-primary",
  rejected: "text-destructive",
  escalated: "text-primary",
  unchanged: "text-muted-foreground",
  archived: "text-warn",
}

/** Always present. Fills as changes are made. */
export function ChangesRail() {
  const { changes } = useAppState()
  const latest = [...changes].reverse().slice(0, 6)

  return (
    <aside className="hidden w-[18rem] shrink-0 py-6 pr-5 pl-2 xl:block">
      <div className="surface p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-[11px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
            Latest changes
          </h2>
          <button
            type="button"
            className="inline-flex cursor-pointer items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <Layers className="size-3.5" /> View History
          </button>
        </div>

        {latest.length === 0 ? (
          <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
            Nothing applied yet. Every change lands here with the name of
            whoever approved it.
          </p>
        ) : (
          <ul className="mt-4 space-y-3.5">
            {latest.map((c, i) => {
              const kind = kindOf(c)
              const Icon = ICON[kind]
              const when = ago(c.approvedAt)
              return (
                <li key={`${c.fileId}-${i}`} className="flex gap-2.5">
                  <Icon className={`mt-0.5 size-3.5 shrink-0 ${TONE[kind]}`} />
                  <p className="min-w-0 text-xs leading-relaxed text-muted-foreground">
                    <span className="break-all text-foreground">
                      {kind === "unchanged" ? c.oldName : c.newName}
                    </span>{" "}
                    - {VERB[kind]}
                    {c.approvedBy && kind !== "unchanged" && (
                      <>
                        {" "}
                        <span className="font-medium text-foreground">
                          {initialled(c.approvedBy)}
                        </span>
                      </>
                    )}
                    {when && ` · ${when}`}
                  </p>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </aside>
  )
}
