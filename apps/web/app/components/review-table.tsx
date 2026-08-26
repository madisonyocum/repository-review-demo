import { useState } from "react"
import { ChevronLeft, ChevronRight, FileText } from "lucide-react"

import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"
import type { Doc } from "@/lib/classify"
import { useAppState, useStore } from "@/state/store"
import { confidenceClass } from "./beats"

const RANK = { High: 0, Medium: 1, Low: 2 } as const
const PER_PAGE = 3
const MAX_PAGE_LINKS = 8

/** The dashboard list. Facets of the whole repository, ranked by confidence. */
export function ReviewTable() {
  const { result } = useAppState()
  const { dispatch } = useStore()
  const [tab, setTab] = useState(0)
  const [page, setPage] = useState(1)
  if (!result) return null

  const inDuplicateFamily = (d: Doc) => {
    const fam = d.familyKey ? result.families[d.familyKey] : undefined
    return !!fam && fam.largestIdenticalGroup > 1
  }

  /**
   * The first tab is labelled with the size of the whole repository but lists
   * the decision queue — the tab bar says how much there is, the table says
   * what needs you. The other three are facets of all 220.
   */
  const facets: {
    label: string
    match: (d: Doc) => boolean
    count: (d: Doc) => boolean
    bare?: boolean
  }[] = [
    {
      label: "files",
      match: (d) => d.bucket === "review",
      count: () => true,
      bare: true,
    },
    {
      label: "Duplicate versions",
      match: inDuplicateFamily,
      count: inDuplicateFamily,
    },
    {
      label: "Unconfirmed status",
      match: (d) => d.isStale,
      count: (d) => d.isStale,
    },
    {
      label: "Conflicting dates",
      match: (d) => !!d.ambiguousDate,
      count: (d) => !!d.ambiguousDate,
    },
  ]

  const ranked = [...result.docs.filter(facets[tab]!.match)].sort(
    (a, b) => RANK[a.confidence] - RANK[b.confidence] || a.id.localeCompare(b.id)
  )
  const matching = facets[tab]!.bare ? spread(ranked) : ranked
  const pageCount = Math.max(1, Math.ceil(matching.length / PER_PAGE))
  const current = Math.min(page, pageCount)
  const rows = matching.slice((current - 1) * PER_PAGE, current * PER_PAGE)
  const links = Array.from(
    { length: Math.min(MAX_PAGE_LINKS, pageCount) },
    (_, i) => i + 1
  )

  const open = () => dispatch({ type: "story", id: "A", firstBeat: "a1" })

  return (
    <div className="mt-10">
      <div className="flex items-center gap-7 px-1">
        {facets.map((facet, i) => {
          const count = result.docs.filter(facet.count).length
          const active = i === tab
          return (
            <button
              key={facet.label}
              type="button"
              onClick={() => {
                setTab(i)
                setPage(1)
              }}
              aria-current={active ? "true" : undefined}
              className={cn(
                "cursor-pointer border-b-2 pb-1.5 text-[0.9375rem] leading-none whitespace-nowrap transition-colors",
                active
                  ? "border-primary font-medium text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {facet.bare
                ? `${count} ${facet.label}`
                : `${facet.label} · ${count}`}
            </button>
          )
        })}
      </div>

      <div className="surface mt-2.5 overflow-hidden">
        <table className="w-full table-fixed text-left text-sm">
          <colgroup>
            <col className="w-[32%]" />
            <col className="w-[31%]" />
            <col className="w-[13%]" />
            <col className="w-[24%]" />
          </colgroup>
          <thead>
            <tr className="text-[11px] tracking-[0.08em] text-muted-foreground uppercase">
              <th className="px-6 pt-3.5 pb-2.5 font-medium">Document</th>
              <th className="px-6 pt-3.5 pb-2.5 font-medium">Why it needs review</th>
              <th className="px-6 pt-3.5 pb-2.5 font-medium">Confidence</th>
              <th className="px-6 pt-3.5 pb-2.5 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((d) => (
              <tr key={d.id} className="border-t border-border/60 align-middle">
                <td className="px-6 py-3.5">
                  <div className="flex gap-3">
                    <FileText className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    <span className="leading-relaxed break-words">
                      {d.filename}
                    </span>
                  </div>
                </td>
                <td className="px-6 py-3.5 leading-relaxed text-muted-foreground">
                  {d.reason}
                </td>
                <td
                  className={cn(
                    "px-6 py-3.5 font-medium",
                    confidenceClass(d.confidence)
                  )}
                >
                  {d.confidence}
                </td>
                <td className="px-6 py-3.5">
                  <Button
                    variant="outline"
                    className="bg-card px-6 hover:bg-muted"
                    onClick={open}
                  >
                    Review
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="flex items-center justify-between border-t border-border/60 px-6 py-3.5">
          <button
            type="button"
            className="cursor-pointer text-sm text-muted-foreground hover:text-foreground"
            onClick={open}
          >
            + View All
          </button>

          <nav className="flex items-center gap-1" aria-label="Pagination">
            <PageButton
              disabled={current === 1}
              onClick={() => setPage(current - 1)}
              label="Previous page"
            >
              <ChevronLeft className="size-4" />
            </PageButton>
            {links.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setPage(n)}
                aria-current={n === current ? "page" : undefined}
                className={cn(
                  "size-8 cursor-pointer rounded-lg text-sm tabular-nums transition-colors",
                  n === current
                    ? "bg-muted font-medium text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {n}
              </button>
            ))}
            <PageButton
              disabled={current === pageCount}
              onClick={() => setPage(current + 1)}
              label="Next page"
            >
              <ChevronRight className="size-4" />
            </PageButton>
          </nav>
        </div>
      </div>
    </div>
  )
}

/**
 * The queue tab takes one row from each kind of problem before it repeats, so
 * its first page reads as the spread of the repository. The facet tabs are
 * where a single kind is read in bulk, and they keep the plain ranking.
 */
function spread(docs: Doc[]): Doc[] {
  const lanes = new Map<string, Doc[]>()
  for (const d of docs) {
    const lane = lanes.get(d.reasonKind)
    if (lane) lane.push(d)
    else lanes.set(d.reasonKind, [d])
  }
  const queues = [...lanes.values()]
  const out: Doc[] = []
  while (out.length < docs.length) {
    for (const q of queues) {
      const next = q.shift()
      if (next) out.push(next)
    }
  }
  return out
}

function PageButton({
  children,
  disabled,
  onClick,
  label,
}: {
  children: React.ReactNode
  disabled?: boolean
  onClick: () => void
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="flex size-8 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
    >
      {children}
    </button>
  )
}
