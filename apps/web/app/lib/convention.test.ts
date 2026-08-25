import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { classify } from "./classify"
import {
  DEFAULT_CONVENTION,
  describePattern,
  formatName,
  parseConventionLocally,
  PRESETS,
  type Convention,
} from "./convention"
import { parseCsv } from "./dataset"

const rows = parseCsv(
  readFileSync(
    join(__dirname, "../data/contract repository dataset.csv"),
    "utf8"
  )
)

const file = {
  counterparty: "Pinnacle Insurance",
  docType: "MSA" as const,
  dateModified: "2018-02-21",
  version: 2,
  fileType: "pdf",
  filename: "PINNACLE_INSURANCE_MSA_FINAL_v2.pdf",
}

describe("rendering a name", () => {
  it("follows the tokens, separator and date format it is given", () => {
    expect(formatName(file, DEFAULT_CONVENTION)).toBe(
      "PinnacleInsurance_MSA_2018-02-21.pdf"
    )
    expect(formatName(file, PRESETS[1]!.convention)).toBe(
      "2018-02-21-PinnacleInsurance-MSA.pdf"
    )
    expect(
      formatName(file, {
        ...DEFAULT_CONVENTION,
        tokens: ["counterparty", "type", "date", "version"],
        dateFormat: "year",
        caseStyle: "lower",
        separator: "-",
      })
    ).toBe("pinnacleinsurance-msa-2018-v2.pdf")
  })

  it("never invents a name for a file it can't identify", () => {
    const unnamed = { ...file, counterparty: null }
    expect(formatName(unnamed, DEFAULT_CONVENTION)).toBe(unnamed.filename)
  })

  it("describes itself the way the pattern is typed", () => {
    expect(describePattern(DEFAULT_CONVENTION)).toBe(
      "Counterparty_Type_Date.ext"
    )
  })
})

describe("classifying under a convention", () => {
  const dateFirst: Convention = {
    ...DEFAULT_CONVENTION,
    tokens: ["date", "counterparty", "type"],
    separator: "-",
    folders: "keep",
  }

  it("changes every proposed name and no pile count", () => {
    const base = classify(rows, { trustFinal: false })
    const other = classify(rows, { trustFinal: false, convention: dateFirst })

    // The convention decides what a file is called, never what is known
    // about it — so the three piles have to be identical.
    expect(other.counts).toEqual(base.counts)
    expect(other.storyAFamilyKey).toBe(base.storyAFamilyKey)

    const renamed = other.docs.filter((d) => d.proposedName !== d.filename)
    expect(renamed.length).toBeGreaterThan(100)
    for (const d of renamed)
      expect(d.proposedName).toMatch(/^\d{4}-\d{2}-\d{2}-/)
  })

  it('leaves every file where it is when folders are "keep"', () => {
    const other = classify(rows, { trustFinal: false, convention: dateFirst })
    for (const d of other.docs) expect(d.proposedPath).toBe(d.folderPath)
  })

  it("files by document type by default", () => {
    const base = classify(rows, { trustFinal: false })
    const msa = base.docs.find((d) => d.docType === "MSA" && d.counterparty)!
    expect(msa.proposedPath).toBe("/Legal/Contracts/Master Agreements")
  })
})

describe("reading a convention out of a sentence", () => {
  it("takes the order from the order the parts are named in", () => {
    const { convention, notes } = parseConventionLocally(
      "Company name, then the document type, then the year, separated by dashes - and leave the folders where they are."
    )
    expect(convention.tokens).toEqual(["counterparty", "type", "date"])
    expect(convention.separator).toBe("-")
    expect(convention.dateFormat).toBe("year")
    expect(convention.folders).toBe("keep")
    expect(notes.length).toBeGreaterThan(0)
  })

  it("reads a pattern typed as a pattern", () => {
    const { convention } = parseConventionLocally("Date_Counterparty_Type")
    expect(convention.tokens).toEqual(["date", "counterparty", "type"])
    expect(convention.separator).toBe("_")
  })

  it("keeps what it was not told to change", () => {
    const { convention } = parseConventionLocally("use lowercase", {
      ...DEFAULT_CONVENTION,
      folders: "keep",
    })
    expect(convention.caseStyle).toBe("lower")
    expect(convention.tokens).toEqual(DEFAULT_CONVENTION.tokens)
    expect(convention.folders).toBe("keep")
  })

  it("says so rather than guessing, when there is nothing to read", () => {
    const { convention, notes } = parseConventionLocally("thanks, looks good")
    expect(convention).toEqual(DEFAULT_CONVENTION)
    expect(notes[0]).toMatch(/kept the current one/)
  })
})
