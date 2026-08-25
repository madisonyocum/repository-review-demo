import { Download, Undo2 } from "lucide-react"

import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"
import { buildManifest, downloadManifest, MANIFEST_COLUMNS } from "@/lib/manifest"
import { PARTNER_FIRST_NAME } from "@/lib/people"
import { useAppState, useStore } from "@/state/store"

/**
 * The ending, rendered as a panel in the main column like everything else —
 * the rails, the tiles and the composer all stay where they were.
 */
export function ManifestPanel() {
  const state = useAppState()
  const { dispatch, undoAll } = useStore()
  const { result } = state
  if (!result) return null

  // Every figure below is counted off the manifest itself, so the ledger can
  // only ever add up to the number of rows in the file.
  const rows = buildManifest(state)
  const isOpen = (approvedBy: string) => approvedBy.includes("(open)")

  const fromContents = rows.filter(
    (r) => r.action !== "no-action" && r.approvedBy === "Assistant"
  )
  const decidedRows = rows.filter(
    (r) =>
      r.action !== "no-action" &&
      r.approvedBy !== "Assistant" &&
      !isOpen(r.approvedBy)
  )
  const archived = rows.filter((r) => r.action === "supersede")
  const open = rows.filter((r) => isOpen(r.approvedBy))
  const untouched = rows.filter(
    (r) => r.action === "no-action" && !isOpen(r.approvedBy)
  )

  const ledger: { n: number; label: string; sub?: string; tone: string }[] = [
    {
      n: fromContents.length,
      label: "renamed from their own contents",
      tone: "text-ok",
    },
    {
      n: decidedRows.length,
      label: "renamed after your decisions",
      sub: `of which ${archived.length} superseded ${
        archived.length === 1 ? "copy" : "copies"
      } moved to /Archive`,
      tone: "text-ok",
    },
    {
      n: open.length,
      label: `with ${PARTNER_FIRST_NAME}, still open`,
      tone: "text-warn",
    },
    {
      n: untouched.length,
      label: "left exactly as they were",
      tone: "text-muted-foreground",
    },
  ]

  // Three distinct shapes, including a no-action row.
  const preview = dedupe([
    decidedRows.find((r) => r.action !== "supersede") ?? decidedRows[0],
    archived[0],
    untouched[0],
  ])

  return (
    <div className="space-y-4">
      <section className="surface p-5">
        <p className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
          Manifest
        </p>
        <h1 className="mt-1 text-lg font-semibold">
          {result.counts.total} files, accounted for
        </h1>

        {/* Same type scale as the tiles: a large tabular number carrying the
            colour, the claim in body text, the qualifier one step down. */}
        <dl className="mt-4 divide-y divide-border/60 border-y border-border/60">
          {ledger.map(({ n, label, sub, tone }) => (
            <div key={label} className="flex items-baseline gap-4 py-3.5">
              <dt
                className={cn(
                  "w-12 shrink-0 text-2xl font-semibold tabular-nums",
                  tone
                )}
              >
                {n}
              </dt>
              <dd className="min-w-0">
                <p className="text-sm leading-snug">{label}</p>
                {sub && (
                  <p className="mt-1 text-xs leading-snug text-muted-foreground">
                    {sub}
                  </p>
                )}
              </dd>
            </div>
          ))}
        </dl>

        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
          Nothing deleted. Every change records who approved it and when.
        </p>

        <div className="mt-5 flex flex-wrap gap-3">
          <Button onClick={() => downloadManifest(rows)}>
            <Download data-icon="inline-start" /> Download the manifest
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              undoAll()
              dispatch({ type: "view", view: "dashboard" })
            }}
          >
            <Undo2 data-icon="inline-start" /> Undo everything
          </Button>
        </div>
      </section>

      <section className="surface overflow-hidden">
        <div className="border-b border-border/60 px-6 py-3.5">
          <p className="text-[11px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
            manifest.csv &middot; {rows.length} rows &middot;{" "}
            {MANIFEST_COLUMNS.length} columns
          </p>
        </div>
        <table className="w-full text-left text-xs text-muted-foreground">
          <thead>
            <tr className="border-b border-border/60">
              {["old_name", "new_name", "action", "approved_by"].map((h) => (
                <th key={h} className="px-6 pt-4 pb-3 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {preview.map((r) => (
              <tr key={r.fileId} className="border-b border-border/60 last:border-0">
                <td className="max-w-52 px-6 py-3.5 font-mono break-all">
                  {r.oldName}
                </td>
                <td className="max-w-52 px-6 py-3.5 font-mono break-all">
                  {r.action === "no-action" ? "-" : r.newName}
                </td>
                <td className="px-6 py-3.5 whitespace-nowrap">{r.action}</td>
                <td className="px-6 py-3.5 whitespace-nowrap">{r.approvedBy}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  )
}

/** Distinct rows only — the same file must not appear twice in a preview. */
function dedupe<T extends { fileId: string }>(rows: (T | undefined)[]): T[] {
  const seen = new Set<string>()
  const out: T[] = []
  for (const r of rows) {
    if (!r || seen.has(r.fileId)) continue
    seen.add(r.fileId)
    out.push(r)
  }
  return out
}
