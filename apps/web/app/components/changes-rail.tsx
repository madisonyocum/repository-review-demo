import { ArrowUp, Check, Layers, Pencil, X } from "lucide-react"
import type { LucideIcon } from "lucide-react"

import { cn } from "@workspace/ui/lib/utils"
import { ago, initialled, kindOf, VERB, type HistoryKind } from "@/lib/history"
import { SEEDED_HISTORY } from "@/lib/seed-history"
import { useAppState } from "@/state/store"

/**
 * The design uses exactly four marks, and each one means one thing:
 *
 *   green check   a person approved it
 *   blue pencil   the tool wrote the name, or deliberately left it alone
 *   red cross     rejected
 *   blue arrow    handed to a person
 *
 * An archived copy was renamed and moved by the tool, so it takes the pencil
 * rather than inventing a fifth mark the design doesn't have.
 */
const ICON: Record<HistoryKind, LucideIcon> = {
  approved: Check,
  renamed: Pencil,
  rejected: X,
  escalated: ArrowUp,
  unchanged: Pencil,
  archived: Pencil,
}

/**
 * Lucide draws the cross and the arrow smaller inside their box than the
 * check and the pencil, so at one nominal size they read as lighter marks
 * than they should. Those two get a larger box, and a little room on the
 * right so the wider glyph doesn't crowd the line it labels.
 */
const SIZE: Record<HistoryKind, string> = {
  approved: "size-[1.15rem]",
  renamed: "size-4",
  rejected: "size-5 mr-[3px]",
  escalated: "size-5 mr-[3px]",
  unchanged: "size-4",
  archived: "size-4",
}

const TONE: Record<HistoryKind, string> = {
  approved: "text-ok",
  renamed: "text-primary",
  rejected: "text-destructive",
  escalated: "text-primary",
  unchanged: "text-primary",
  archived: "text-primary",
}

interface Row {
  key: string
  name: string
  kind: HistoryKind
  by: string
  when: string
}

/**
 * Always present, and never empty: the repository is one somebody has been
 * working in already, so the rail opens on the six rows from the design.
 * Real changes land on top and push those down as they are made — they are
 * the only rows that exist anywhere else in state.
 */
export function ChangesRail({ stretch }: { stretch?: boolean } = {}) {
  const { changes } = useAppState()

  const latest: Row[] = [
    ...[...changes].reverse().map((c, i) => {
      const kind = kindOf(c)
      return {
        key: `${c.fileId}-${i}`,
        name: kind === "unchanged" ? c.oldName : c.newName,
        kind,
        by: c.approvedBy,
        when: ago(c.approvedAt),
      }
    }),
    ...SEEDED_HISTORY.map((row) => ({ ...row, key: row.name })),
  ].slice(0, 6)

  // Always a column of the content grid, so the panel beside it keeps one
  // width whatever the view is. On the opening screen it stretches to match
  // that column; over a scrolling panel it keeps its own height and stays put.
  return (
    <aside
      className={cn(
        "hidden xl:block",
        // Sized to its own content and pinned, so it stays on screen while a
        // long conversation scrolls past it. A stretched grid item has no
        // room to stick, hence self-start.
        stretch ? "h-full" : "sticky top-0 self-start"
      )}
    >
      <div className={cn("surface px-5 pt-5 pb-3.5", stretch && "h-full")}>
        <div className="flex items-center justify-between">
          <h2 className="text-[11px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
            Latest changes
          </h2>
          <button
            type="button"
            className="inline-flex cursor-pointer items-center gap-1.5 text-[0.8125rem] text-muted-foreground hover:text-foreground"
          >
            <Layers className="size-4" /> View History
          </button>
        </div>

        <ul className="mt-4 space-y-4">
          {latest.map(({ key, name, kind, by, when }) => {
            const Icon = ICON[kind]
            return (
              <li key={key} className="flex gap-3">
                <Icon
                  className={`mt-0.5 shrink-0 ${SIZE[kind]} ${TONE[kind]}`}
                />
                <p className="min-w-0 text-[0.8125rem] leading-relaxed text-muted-foreground">
                  <span className="break-words text-foreground">{name}</span> -{" "}
                  {VERB[kind]}
                  {by && kind !== "unchanged" && (
                    <>
                      {" "}
                      <span className="font-medium text-foreground">
                        {initialled(by)}
                      </span>
                    </>
                  )}
                  {when && ` · ${when}`}
                </p>
              </li>
            )
          })}
        </ul>
      </div>
    </aside>
  )
}
