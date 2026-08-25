/**
 * Everything downstream of classify(): who a file goes to, what the manifest
 * says, and how the random sample is drawn. All derived, none of it hardcoded.
 */
import type { Classification, Doc } from "./classify"
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

export const ARCHIVE = "/Archive"

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
  at = new Date()
): Change {
  const action = actionFor(d, archivedIds)
  const isArchive = action === "supersede"
  const noop = action === "no-action"
  return {
    fileId: d.id,
    oldName: d.filename,
    newName: noop ? d.filename : d.proposedName,
    oldPath: d.folderPath,
    newPath: isArchive ? ARCHIVE : noop ? d.folderPath : d.proposedPath,
    action,
    reason: d.reason,
    approvedBy,
    approvedAt: at.toISOString(),
  }
}

/* ------------------------------------------------------------------ */
/* Sampling                                                            */
/* ------------------------------------------------------------------ */

/** mulberry32 — small, seeded, so a re-roll is reproducible from the seed. */
export function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function shuffled<T>(items: T[], rand: () => number): T[] {
  const a = [...items]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[a[i], a[j]] = [a[j]!, a[i]!]
  }
  return a
}

/**
 * Five from the ready pile, of which exactly one is a file whose counterparty
 * was inferred from the document text rather than the filename — the weaker
 * evidence, and the mistake Story B is about.
 *
 * Both halves are drawn at random and re-roll independently, so [Show me five
 * more] genuinely returns a different five. It is a stratified sample, not a
 * uniform one: the demo guarantees a bad row is present, and says so.
 */
export function drawSample(
  result: Classification,
  seed: number,
  excluded: string[] = []
): { ids: string[]; wrongId: string } {
  const rand = rng(seed)
  const skip = new Set(excluded)
  const weak = result.weakInReady.filter((id) => !skip.has(id))
  const clean = result.docs
    .filter(
      (d) => d.bucket === "ready" && !d.weakGrouping && !skip.has(d.id)
    )
    .map((d) => d.id)

  const wrongId = shuffled(weak, rand)[0]!
  const rest = shuffled(clean, rand).slice(0, 4)
  return { ids: shuffled([wrongId, ...rest], rand), wrongId }
}
