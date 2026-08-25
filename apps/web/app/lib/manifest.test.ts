import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { classify } from "./classify"
import { parseCsv } from "./dataset"
import { buildManifest, MANIFEST_COLUMNS, manifestToCsv } from "./manifest"
import { escalated, superseded } from "./ledger"
import { initialState } from "@/state/store"
import type { State } from "@/state/types"

const rows = parseCsv(
  readFileSync(join(__dirname, "../data/contract repository dataset.csv"), "utf8")
)
const result = classify(rows)

/** The state the demo is in once both stories and Apply everything have run. */
function endState(): State {
  return {
    ...initialState,
    rows,
    result,
    view: "manifest",
    demoted: result.weakInReady,
    archived: superseded(result).map((d) => d.id),
    piles: {
      ready: 0,
      review: 0,
      withPartner: escalated(result).length,
      unknown: result.counts.unknown + result.weakInReady.length,
    },
  }
}

describe("manifest", () => {
  const manifest = buildManifest(endState())

  it("has one row per file, no more and no fewer", () => {
    expect(manifest).toHaveLength(220)
    expect(new Set(manifest.map((r) => r.fileId)).size).toBe(220)
  })

  it("includes the no-action rows", () => {
    const noAction = manifest.filter((r) => r.action === "no-action")
    expect(noAction.length).toBeGreaterThan(0)
    // Files nothing happened to keep their own name and path.
    for (const r of noAction) {
      expect(r.newName).toBe(r.oldName)
      expect(r.newPath).toBe(r.oldPath)
    }
  })

  it("only uses the five permitted actions", () => {
    const allowed = new Set([
      "rename",
      "move",
      "rename+move",
      "supersede",
      "no-action",
    ])
    for (const r of manifest) expect(allowed.has(r.action)).toBe(true)
  })

  it("records an approver for everything it changed", () => {
    for (const r of manifest) {
      if (r.action === "no-action") continue
      expect(r.approvedBy).not.toBe("")
      expect(r.approvedBy).not.toBe("-")
      expect(r.approvedAt).not.toBe("")
    }
  })

  it("moves superseded copies to /Archive and deletes nothing", () => {
    const archived = manifest.filter((r) => r.action === "supersede")
    expect(archived.length).toBeGreaterThan(0)
    for (const r of archived) expect(r.newPath).toBe("/Archive")
    expect(manifest.some((r) => (r.action as string) === "delete")).toBe(false)
  })

  it("reconciles: every file lands in exactly one ledger line", () => {
    const isOpen = (by: string) => by.includes("(open)")
    const fromContents = manifest.filter(
      (r) => r.action !== "no-action" && r.approvedBy === "Assistant"
    ).length
    const byDecision = manifest.filter(
      (r) =>
        r.action !== "no-action" &&
        r.approvedBy !== "Assistant" &&
        !isOpen(r.approvedBy)
    ).length
    const open = manifest.filter((r) => isOpen(r.approvedBy)).length
    const untouched = manifest.filter(
      (r) => r.action === "no-action" && !isOpen(r.approvedBy)
    ).length
    expect(fromContents + byDecision + open + untouched).toBe(220)
  })

  it("serialises to a CSV that parses back to the same shape", () => {
    const csv = manifestToCsv(manifest)
    expect(csv.split("\n")[0]).toBe(MANIFEST_COLUMNS.join(","))

    const reparsed = parseCsv(csv) as unknown as Record<string, string>[]
    expect(reparsed).toHaveLength(220)
    expect(Object.keys(reparsed[0]!)).toEqual([...MANIFEST_COLUMNS])
    expect(reparsed.some((r) => r["action"] === "no-action")).toBe(true)
  })

  it("survives names containing commas and quotes", () => {
    const csv = manifestToCsv([
      {
        fileId: "F9999",
        oldName: 'Acme, Corp "FINAL".pdf',
        newName: "AcmeCorp_MSA_2020-01-01.pdf",
        oldPath: "/Legal",
        newPath: "/Legal/Contracts",
        action: "rename+move",
        reason: "Comma, and a quote: \"final\"",
        approvedBy: "Brendan Walsh",
        approvedAt: "2026-08-25T00:00:00.000Z",
      },
    ])
    const back = parseCsv(csv) as unknown as Record<string, string>[]
    expect(back[0]!["old_name"]).toBe('Acme, Corp "FINAL".pdf')
    expect(back[0]!["reason"]).toBe('Comma, and a quote: "final"')
  })
})
