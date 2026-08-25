/**
 * The manifest is built from state, not from a template. Every file in the
 * repository appears exactly once, including the ones nothing happened to —
 * a change log that hides its no-ops is not a record of what you did.
 */
import type { Change, State } from "@/state/types"
import { changeFor, decided, escalated } from "./ledger"
import { APPROVER, PARTNER } from "./people"
import type { Doc } from "./classify"

export const MANIFEST_COLUMNS = [
  "file_id",
  "old_name",
  "new_name",
  "old_path",
  "new_path",
  "action",
  "reason",
  "approved_by",
  "approved_at",
] as const

export function buildManifest(state: State): Change[] {
  const { result } = state
  if (!result) return []

  const recorded = new Map<string, Change>()
  for (const c of state.changes) recorded.set(c.fileId, c)

  const escalatedIds = new Set(escalated(result).map((d) => d.id))
  const decidedIds = new Set(decided(result).map((d) => d.id))
  const demoted = new Set(state.demoted)
  const escalatedUnknown = new Set(state.escalatedUnknown)

  const rowFor = (d: Doc): Change => {
    const already = recorded.get(d.id)
    if (already) return already

    // Demoted in Story B, or never identifiable: left exactly as it was.
    // Handed to the partner on top of that is annotated, not moved — the
    // file still isn't renamed, it just has an owner now.
    if (demoted.has(d.id) || d.bucket === "unknown") {
      const reason = demoted.has(d.id)
        ? "Counterparty was inferred from the contents, not the filename. Not enough to rename on."
        : d.reason
      const handedOff = escalatedUnknown.has(d.id)
      return {
        fileId: d.id,
        oldName: d.filename,
        newName: d.filename,
        oldPath: d.folderPath,
        newPath: d.folderPath,
        action: "no-action",
        reason: handedOff ? `${reason} Open with ${PARTNER}.` : reason,
        approvedBy: handedOff ? `${PARTNER} (open)` : "-",
        approvedAt: "",
      }
    }

    if (escalatedIds.has(d.id)) {
      return {
        fileId: d.id,
        oldName: d.filename,
        newName: d.filename,
        oldPath: d.folderPath,
        newPath: d.folderPath,
        action: "no-action",
        reason: `${d.reason} Open with ${PARTNER}.`,
        approvedBy: `${PARTNER} (open)`,
        approvedAt: "",
      }
    }

    const approver = decidedIds.has(d.id) ? APPROVER : "Assistant"
    return changeFor(
      d,
      approver,
      state.archived,
      new Date(),
      state.convention.archive
    )
  }

  return result.docs.map(rowFor)
}

/** RFC 4180-ish: quote everything, double any embedded quote. */
function csvCell(value: string): string {
  return `"${String(value).replace(/"/g, '""')}"`
}

export function manifestToCsv(rows: Change[]): string {
  const header = MANIFEST_COLUMNS.join(",")
  const body = rows.map((r) =>
    [
      r.fileId,
      r.oldName,
      r.newName,
      r.oldPath,
      r.newPath,
      r.action,
      r.reason,
      r.approvedBy,
      r.approvedAt,
    ]
      .map(csvCell)
      .join(",")
  )
  return [header, ...body].join("\n")
}

export function downloadManifest(rows: Change[], filename = "manifest.csv") {
  const blob = new Blob([manifestToCsv(rows)], {
    type: "text/csv;charset=utf-8;",
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
