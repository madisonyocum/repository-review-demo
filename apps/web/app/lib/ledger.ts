/**
 * Everything downstream of classify(): who a file goes to, what the manifest
 * says, and how the random sample is drawn. All derived, none of it hardcoded.
 */
import { classify, type Classification, type Doc } from "./classify"
import { DEFAULT_CONVENTION } from "./convention"
import type { Change, ChangeAction } from "@/state/types"

/**
 * Files a person has to look at. The assistant escalates when the filename
 * contradicts itself, or when two files in a family each claim to be final —
 * neither is something a rename can settle.
 */
export function escalated(result: Classification): Doc[] {
  return result.docs.filter((d) => {
    if (d.bucket !== "review") return false
    if (d.contradicts) return true
    const fam = d.familyKey ? result.families[d.familyKey] : undefined
    if (!fam) return false
    const cleanFinals = fam.memberIds.filter(
      (id) => result.byId[id]!.isFinal && !result.byId[id]!.isDraft
    )
    return cleanFinals.length >= 2
  })
}

/** Review-pile files the assistant can resolve once a person says go. */
export function decided(result: Classification): Doc[] {
  const out = new Set(escalated(result).map((d) => d.id))
  return result.docs.filter((d) => d.bucket === "review" && !out.has(d.id))
}

/** Decided files that are not the operative version — these get archived. */
export function superseded(result: Classification): Doc[] {
  return decided(result).filter((d) => {
    const fam = d.familyKey ? result.families[d.familyKey] : undefined
    return !!fam && fam.memberIds.length > 1 && fam.operativeId !== d.id
  })
}

/** Only a default. The live one is whatever the user set — `state.convention`. */
export const ARCHIVE = DEFAULT_CONVENTION.archive

export function actionFor(d: Doc, archivedIds: string[]): ChangeAction {
  if (archivedIds.includes(d.id)) return "supersede"
  if (!d.counterparty || !d.docType) return "no-action"
  const renamed = d.proposedName !== d.filename
  const moved = d.proposedPath !== d.folderPath
  if (renamed && moved) return "rename+move"
  if (renamed) return "rename"
  if (moved) return "move"
  return "no-action"
}

export function changeFor(
  d: Doc,
  approvedBy: string,
  archivedIds: string[],
  at = new Date(),
  archive: string = ARCHIVE
): Change {
  const action = actionFor(d, archivedIds)
  const isArchive = action === "supersede"
  const noop = action === "no-action"
  return {
    fileId: d.id,
    oldName: d.filename,
    newName: noop ? d.filename : d.proposedName,
    oldPath: d.folderPath,
    newPath: isArchive ? archive : noop ? d.folderPath : d.proposedPath,
    action,
    reason: d.reason,
    approvedBy,
    approvedAt: at.toISOString(),
  }
}

/* ------------------------------------------------------------------ */
/* Worst first                                                         */
/* ------------------------------------------------------------------ */

export interface ReadyRisk {
  id: string
  /** How much of this proposed name rests on evidence that could be wrong. */
  score: number
  /** Every reason it is on the list, worst first, said in plain English. */
  faults: string[]
}

/**
 * How much each weakness is worth. A counterparty read out of the document
 * text is the only one classify() already scores Low on its own — the rest
 * are things a name can survive one of and not three.
 */
const WEIGHTS = {
  weakCounterparty: 3,
  wording: 2,
  ambiguousDate: 2,
  restsOnFinal: 1,
  date: 1,
  inFamily: 1,
} as const

/**
 * A year anywhere in the name, with no word boundaries: `20200331` and
 * `Feb2021` both carry one, and a boundary-anchored pattern would call them
 * undated and say so on screen.
 */
const YEAR = /(19|20)\d{2}/

/**
 * The ready pile ordered worst evidence first — no randomness anywhere, so
 * the five the demo shows are the five the data says are weakest, and the
 * same five every time.
 *
 * Sampling at random would let a presenter draw five easy rows and call the
 * other 127 safe on the strength of them. Worst first can only make the
 * opposite claim, which is the honest one: if these hold, the rest hold.
 */
export function rankReady(
  result: Classification,
  excluded: string[] = []
): ReadyRisk[] {
  const skip = new Set(excluded)
  return (
    result.docs
      .filter((d) => d.bucket === "ready" && !skip.has(d.id))
      .map((d) => {
        const faults: string[] = []
        let score = 0
        if (d.weakGrouping) {
          score += WEIGHTS.weakCounterparty
          faults.push("Company name read out of the contents, not the filename")
        }
        if (d.wording) {
          score += WEIGHTS.wording
          faults.push(
            `Filed as ${d.wording.filed}; the contents describe ${d.wording.describes}`
          )
        }
        if (d.ambiguousDate) {
          score += WEIGHTS.ambiguousDate
          faults.push("The date in the name could be read two ways")
        }
        if (d.restsOnTheWordFinal) {
          score += WEIGHTS.restsOnFinal
          faults.push("Counted as final because the filename says so")
        }
        // The new name always takes its date from the file's modified date —
        // that is the only date this tool can actually verify. Worth flagging
        // when the filename either offers nothing to check that against, or
        // offers something that disagrees with it. An ambiguous date is
        // already reported above; saying "no date in the name" as well would
        // contradict it.
        const year = d.filename.match(YEAR)?.[0]
        const modifiedYear = d.dateModified.slice(0, 4)
        if (!d.ambiguousDate) {
          if (!year) {
            score += WEIGHTS.date
            faults.push("No date in the name; the new one is the modified date")
          } else if (year !== modifiedYear) {
            score += WEIGHTS.date
            faults.push(
              `The name says ${year}; the modified date the new name uses is ${modifiedYear}`
            )
          }
        }
        const fam = d.familyKey ? result.families[d.familyKey] : undefined
        if (fam && fam.memberIds.length > 1) {
          score += WEIGHTS.inFamily
          faults.push(`One of ${fam.memberIds.length} versions`)
        }
        return { id: d.id, score, faults }
      })
      // Ties break on file_id so the order is stable across runs, not on
      // whatever order the CSV happened to arrive in.
      .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
  )
}

/** One page of five off the worst-first ranking. */
export function weakestFive(
  result: Classification,
  page: number,
  excluded: string[] = []
): string[] {
  const ranked = rankReady(result, excluded)
  if (!ranked.length) return []
  // Past the end, wrap: [Show the next five] never lands on nothing.
  const start = (page * 5) % Math.max(1, ranked.length)
  return ranked.slice(start, start + 5).map((r) => r.id)
}

/* ------------------------------------------------------------------ */
/* "Distrust FINAL" what-if                                            */
/* ------------------------------------------------------------------ */

export interface FinalRuleImpact {
  /** classify() re-run with the word "final" stripped of any weight. */
  distrusted: Classification
  /** Files whose proposed name changes because the operative pick moved. */
  changedProposals: number
  /** Files whose confidence goes up — mostly false contradictions clearing. */
  easier: number
  /** Files whose confidence drops — a clean single FINAL stops being one. */
  harder: number
  /** Families whose operative pick was final on the word alone. */
  affectedFamilies: number
  /**
   * Families that had something claiming to be the signed copy and, under
   * the rule, have nothing at all — the orphans. FINAL was the only thing
   * telling their members apart.
   */
  orphanFamilies: number
  orphanFileIds: string[]
  /** The orphans currently sitting in Ready to apply on that word alone. */
  orphanReadyIds: string[]
}

const CONFIDENCE_RANK = { High: 2, Medium: 1, Low: 0 } as const

/**
 * What actually changes if "final" in a filename is worth nothing. Computed
 * by diffing two real classify() runs against each other — nothing here is
 * asserted, only counted.
 */
export function distrustFinalImpact(
  rows: Parameters<typeof classify>[0],
  baseline: Classification
): FinalRuleImpact {
  // Same convention, so the only differences counted below are the rule's.
  const distrusted = classify(rows, {
    trustFinal: false,
    distrustFinal: true,
    convention: baseline.convention,
  })

  let changedProposals = 0
  let easier = 0
  let harder = 0
  for (const d of baseline.docs) {
    const after = distrusted.byId[d.id]!
    if (after.proposedName !== d.proposedName) changedProposals++
    const delta =
      CONFIDENCE_RANK[after.confidence] - CONFIDENCE_RANK[d.confidence]
    if (delta > 0) easier++
    if (delta < 0) harder++
  }

  let affectedFamilies = 0
  for (const fam of Object.values(baseline.families)) {
    const operative = baseline.byId[fam.operativeId]!
    if (
      operative.isFinal &&
      !operative.isDraft &&
      operative.restsOnTheWordFinal
    ) {
      affectedFamilies++
    }
  }

  // The orphans: counted by diffing the two runs family by family, not
  // asserted. A family is orphaned when something in it read as signed
  // before the rule and nothing does after.
  const orphanFileIds: string[] = []
  const orphanReadyIds: string[] = []
  let orphanFamilies = 0
  const signed = (c: Classification, ids: string[]) =>
    ids.filter((id) => c.byId[id]!.isFinal && !c.byId[id]!.isDraft)
  for (const fam of Object.values(baseline.families)) {
    const after = distrusted.families[fam.key]
    if (!after) continue
    if (!signed(baseline, fam.memberIds).length) continue
    if (signed(distrusted, after.memberIds).length) continue
    orphanFamilies++
    for (const id of fam.memberIds) {
      orphanFileIds.push(id)
      const d = baseline.byId[id]!
      if (d.bucket === "ready" && !d.weakGrouping) orphanReadyIds.push(id)
    }
  }

  return {
    distrusted,
    changedProposals,
    easier,
    harder,
    affectedFamilies,
    orphanFamilies,
    orphanFileIds,
    orphanReadyIds,
  }
}
