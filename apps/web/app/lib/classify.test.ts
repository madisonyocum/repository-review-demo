import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { classify, findCounterparty, findDocType } from "./classify"
import { parseCsv } from "./dataset"

const rows = parseCsv(
  readFileSync(
    join(__dirname, "../data/contract repository dataset.csv"),
    "utf8"
  )
)

describe("false positives", () => {
  it('does not read "PLEASE READ" as a lease', () => {
    expect(findDocType("Lumen_Analytics_Employment Agreement_FINAL_PLEASE READ"))
      .toBe("Employment")
    expect(
      findDocType("vantage-retail-group 04.10.2023 FINAL_v2 Collab Agreement PLEASE READ")
    ).toBe("Partnership")
    expect(
      findDocType("Harbourline_Shipping_Data Processing Agreement_old_2017_PLEASE READ")
    ).toBe("DPA")
    expect(findDocType("PLEASE READ")).toBeNull()
  })

  it('does not read "Harbour View" as Harbourline Shipping', () => {
    expect(
      findCounterparty(
        "This Lease sets out the terms of occupancy, rent, and maintenance obligations for the property at 5 Harbour View, Leith."
      )
    ).toBeNull()
    const f0004 = rows.find((r) => r.file_id === "F0004")!
    const doc = classify(rows).byId["F0004"]!
    expect(f0004.filename).toContain("corvus-data")
    expect(doc.counterparty).toBe("Corvus Data")
  })

  it('does not read "content licensing" as a licence', () => {
    expect(
      findDocType(
        "Offer letter and employment terms for a position in the content licensing team, including start date and reporting line."
      )
    ).toBe("Employment")
  })

  it("matches counterparties across every separator style", () => {
    for (const s of [
      "VANTAGE_RETAIL_GROUP_Collab Agreement",
      "vantage-retail-group_2023_FINAL(2)",
      "Vantage__Retail__Group Software License",
      "Vantage SOW FINAL_v2",
    ]) {
      expect(findCounterparty(s)).toBe("Vantage Retail Group")
    }
  })

  it("matches through a leading underscore, which is a regex word character", () => {
    expect(findCounterparty("DRAFT_HALDEN_&_CO_Lease")).toBe("Halden & Co")
    expect(findCounterparty("v2_BrightpathHealth_16.09.2021")).toBe(
      "Brightpath Health"
    )
    expect(findCounterparty("signed_Employment Contract_Jan2022_unsigned_ashworth-textiles")).toBe(
      "Ashworth Textiles"
    )
  })

  it("prefers the longer type name over its substring", () => {
    expect(findDocType("acme-corp-Data Processing Addendum-executed")).toBe("DPA")
    expect(findDocType("Foxglove_Marketing_Amendment_reviewed_2022")).toBe(
      "Amendment"
    )
  })
})

describe("classification of the real 220 rows", () => {
  const result = classify(rows)

  it("reads every row", () => {
    expect(rows).toHaveLength(220)
    expect(result.counts.total).toBe(220)
  })

  it("reconciles to the total", () => {
    const { ready, review, unknown, total } = result.counts
    expect(ready + review + unknown).toBe(total)
  })

  it("finds a counterparty for all but the genuinely unidentifiable", () => {
    expect(result.counts.unknown).toBe(
      result.docs.filter((d) => !d.counterparty).length
    )
    expect(result.counts.unknown).toBeGreaterThan(0)
  })

  it("finds one four-version family with exactly three identical texts", () => {
    expect(result.storyAFamilyKey).not.toBeNull()
    const fam = result.families[result.storyAFamilyKey!]!
    expect(fam.memberIds).toHaveLength(4)
    expect(fam.largestIdenticalGroup).toBe(3)
  })

  it("is deterministic", () => {
    expect(classify(rows).counts).toEqual(classify(rows).counts)
  })

  it("trustFinal moves work out of Needs review without losing rows", () => {
    const trusting = classify(rows, { trustFinal: true })
    expect(trusting.counts.review).toBeLessThan(result.counts.review)
    expect(
      trusting.counts.ready + trusting.counts.review + trusting.counts.unknown
    ).toBe(220)
  })
})
