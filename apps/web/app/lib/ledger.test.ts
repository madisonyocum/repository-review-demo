import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { classify } from "./classify"
import { parseCsv } from "./dataset"
import { distrustFinalImpact, rankReady, weakestFive } from "./ledger"

const rows = parseCsv(
  readFileSync(
    join(__dirname, "../data/contract repository dataset.csv"),
    "utf8"
  )
)
const result = classify(rows)

describe("worst first", () => {
  it("ranks the whole ready pile and nothing else", () => {
    const ranked = rankReady(result)
    expect(ranked).toHaveLength(result.counts.ready)
    for (const r of ranked) expect(result.byId[r.id]!.bucket).toBe("ready")
  })

  it("is ordered, deterministic, and the same five every time", () => {
    const scores = rankReady(result).map((r) => r.score)
    expect([...scores].sort((a, b) => b - a)).toEqual(scores)
    expect(weakestFive(result, 0)).toEqual(weakestFive(result, 0))
  })

  // The point of ranking rather than drawing: the sample cannot be a lucky
  // five. Whatever is on screen is at least as weak as anything off it.
  it("puts nothing off the list that is weaker than something on it", () => {
    const five = weakestFive(result, 0)
    const ranked = rankReady(result)
    const worstOff = ranked.find((r) => !five.includes(r.id))!
    const bestOn = Math.min(
      ...ranked.filter((r) => five.includes(r.id)).map((r) => r.score)
    )
    expect(worstOff.score).toBeLessThanOrEqual(bestOn)
  })

  it("gives every row at least one reason for being there", () => {
    for (const id of weakestFive(result, 0)) {
      const risk = rankReady(result).find((r) => r.id === id)!
      expect(risk.faults.length).toBeGreaterThan(0)
    }
  })

  it("excludes files already demoted, so the next page is new files", () => {
    const first = weakestFive(result, 0)
    const next = weakestFive(result, 1, first)
    expect(next.some((id) => first.includes(id))).toBe(false)
  })
})

describe("distrusting FINAL", () => {
  const impact = distrustFinalImpact(rows, result)

  it("reports both directions", () => {
    expect(impact.easier).toBeGreaterThan(0)
    expect(impact.harder).toBeGreaterThan(0)
  })

  // The orphans are the cost of the rule: families that had something
  // claiming to be signed and, with the word ignored, have nothing.
  it("counts orphaned families off two real runs", () => {
    expect(impact.orphanFamilies).toBeGreaterThan(0)
    expect(impact.orphanFileIds.length).toBeGreaterThanOrEqual(
      impact.orphanFamilies
    )
    for (const id of impact.orphanFileIds) {
      const fam = result.families[result.byId[id]!.familyKey!]!
      const signedAfter = fam.memberIds.filter((m) => {
        const d = impact.distrusted.byId[m]!
        return d.isFinal && !d.isDraft
      })
      expect(signedAfter).toHaveLength(0)
    }
    expect(
      impact.orphanReadyIds.every((id) => impact.orphanFileIds.includes(id))
    ).toBe(true)
  })
})

describe("the reasons a row gives for itself", () => {
  const faultsFor = (filename: string) =>
    rankReady(result).find((r) => result.byId[r.id]!.filename === filename)
      ?.faults ?? []

  // A year with digits either side of it is still a year. `\b` would miss
  // both of these and the row would claim on screen to have no date at all.
  it("does not call a dated filename undated", () => {
    for (const name of [
      "Supplier Agreement final 20200331.pdf",
      "Collab Agreement-pending signature-Feb2021.pdf",
    ]) {
      const faults = faultsFor(name)
      expect(faults.length).toBeGreaterThan(0)
      expect(faults.some((f) => f.startsWith("No date"))).toBe(false)
    }
  })

  it("never says a name has no date and an unreadable one at once", () => {
    for (const r of rankReady(result)) {
      const undated = r.faults.some((f) => f.startsWith("No date"))
      const ambiguous = r.faults.some((f) => f.includes("read two ways"))
      expect(undated && ambiguous).toBe(false)
    }
  })
})
