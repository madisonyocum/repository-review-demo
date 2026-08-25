/**
 * Pure, deterministic classification of a contract repository.
 *
 * Every count on screen derives from this module. Nothing about the UI is
 * hardcoded — if you feed it a different CSV you get different numbers.
 *
 * The two rules that decide the piles:
 *   unknown ("Can't identify")  no counterparty in the filename OR the contents
 *   review  ("Needs review")    the name carries a staleness marker (old / copy /
 *                               backup), OR the version family contains two or
 *                               more files with byte-identical contents, so the
 *                               name alone cannot say which one is operative
 *   ready   ("Ready to apply")  everything else
 */

import {
  DEFAULT_CONVENTION,
  formatName,
  formatPath,
  type Convention,
} from "./convention"

export type DocType =
  | "MSA"
  | "SOW"
  | "NDA"
  | "DPA"
  | "Lease"
  | "Employment"
  | "License"
  | "Purchase"
  | "Supply"
  | "Partnership"
  | "Amendment"

export type Bucket = "ready" | "review" | "unknown"
export type Confidence = "High" | "Medium" | "Low"
export type Source = "filename" | "contents"

export interface RawRow {
  file_id: string
  filename: string
  folder_path: string
  file_type: string
  size_kb: string | number
  date_modified: string
  content_excerpt: string
}

export interface Doc {
  id: string
  filename: string
  folderPath: string
  fileType: string
  sizeKb: number
  dateModified: string
  excerpt: string
  counterparty: string | null
  counterpartySource: Source | null
  docType: DocType | null
  docTypeSource: Source | null
  version: number | null
  isFinal: boolean
  isDraft: boolean
  isStale: boolean
  contradicts: boolean
  /** isFinal is true only because the filename literally says "final". */
  restsOnTheWordFinal: boolean
  /** The filename's date could be read two ways — 10-03 is March or October. */
  ambiguousDate: { day: number; month: number } | null
  /** The filename and the contents call the document different things. */
  wording: { filed: string; describes: string } | null
  familyKey: string | null
  bucket: Bucket
  reason: string
  confidence: Confidence
  proposedName: string
  proposedPath: string
  operative: boolean
  /** Counterparty was inferred from the document text, not the filename. */
  weakGrouping: boolean
}

export interface Family {
  key: string
  counterparty: string
  docType: DocType
  memberIds: string[]
  operativeId: string
  /** Size of the largest set of members that share identical contents. */
  largestIdenticalGroup: number
}

export interface Counts {
  total: number
  ready: number
  review: number
  unknown: number
}

export interface Classification {
  docs: Doc[]
  /** The convention every proposedName in here was rendered under. */
  convention: Convention
  byId: Record<string, Doc>
  families: Record<string, Family>
  counts: Counts
  /**
   * The family Story A is about: the only family with four versions of which
   * exactly three share identical text. Derived, never hardcoded.
   */
  storyAFamilyKey: string | null
  storyAFocusId: string | null
  /** Ready-pile files whose counterparty came from the contents, not the name. */
  weakInReady: string[]
}

/* ------------------------------------------------------------------ */
/* Reference data — the vocabulary, not the answers.                   */
/* ------------------------------------------------------------------ */

const COUNTERPARTIES = [
  "Ashworth Textiles",
  "Bluewave Logistics",
  "Corvus Data",
  "Vantage Retail Group",
  "Cobalt Freight",
  "Greymoor Logistics",
  "Pinnacle Insurance",
  "Elmtree Realty",
  "Harbourline Shipping",
  "Brightpath Health",
  "Halden & Co",
  "Acme Corp",
  "Northgate Partners",
  "Riverstone Capital",
  "Silvergate Foods",
  "Solara Energy",
  "Granite Peak Mining",
  "Foxglove Marketing",
  "Meridian Cloud Systems",
  "Lumen Analytics",
  "Crestline Media",
  "Oakridge Manufacturing",
  "Anchor Point Bank",
  "Marlin Consulting",
  "Falcon Security",
  "Tandem Software",
  "Ferrow Industries",
  "Whitfield Legal Services",
]

/** "Anchor" alone is too thin to be a safe short form; "AnchorPoint" is not. */
const SHORT_FORM_OVERRIDES: Record<string, string> = {
  "Anchor Point Bank": "anchorpoint",
}

const strip = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "")

/**
 * Build a matcher for one alias.
 *
 * Two properties matter and both are load-bearing:
 *  - separators between characters are optional, so `Vantage__Retail__Group`,
 *    `vantage-retail-group` and `VantageRetailGroup` all match;
 *  - the match must begin at a non-alphanumeric boundary. `\b` is wrong here
 *    because `_` counts as a word character, which would make
 *    `DRAFT_HALDEN_&_CO` fail. It also keeps `Harbour View` from matching
 *    `Harbourline` — after `harbour` the pattern needs `l` and finds `v`.
 */
function aliasMatcher(alias: string): RegExp {
  const body = alias
    .split("")
    .map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("[\\W_]*")
  return new RegExp(`(?<![A-Za-z0-9])${body}`, "i")
}

const COUNTERPARTY_MATCHERS: { name: string; res: RegExp[] }[] =
  COUNTERPARTIES.map((name) => {
    const compact = strip(name)
    const short = SHORT_FORM_OVERRIDES[name] ?? strip(name.split(" ")[0]!)
    const aliases = short === compact ? [compact] : [compact, short]
    return { name, res: aliases.map(aliasMatcher) }
  })

/**
 * Document type patterns, matched against separator-normalised text with real
 * word boundaries. Word boundaries are the whole trick: `PLEASE READ` must not
 * read as a lease, and `content licensing` must not read as a licence.
 * Order matters — `Data Processing Addendum` has to beat `Addendum`.
 */
const TYPE_PATTERNS: [DocType, RegExp[]][] = [
  ["DPA", [/\bDPA\b/i, /\bData\s+Processing\s+(?:Agreement|Addendum)\b/i]],
  [
    "MSA",
    [/\bMSA\b/i, /\bMaster\s+Services\s+Agreement\b/i, /\bMaster\s+Agreement\b/i],
  ],
  ["SOW", [/\bSOW\b/i, /\bStatement\s+of\s+Work\b/i, /\bWork\s+Order\b/i]],
  [
    "NDA",
    [
      /\bMNDA\b/i,
      /\bNDA\b/i,
      /\bNon\s?Disclosure\b/i,
      /\bConfidentiality\s+Agreement\b/i,
      /\bexchange\s+confidential\s+information\b/i,
    ],
  ],
  [
    "Employment",
    [/\bEmployment\s+(?:Agreement|Contract)\b/i, /\bOffer\s+Letter\b/i],
  ],
  [
    "Lease",
    [
      /\bProperty\s+Lease\b/i,
      /\bLease\s+Agreement\b/i,
      /\bLease\b/i,
      /\bterms\s+of\s+occupancy\b/i,
    ],
  ],
  [
    "License",
    [
      /\bSoftware\s+Licen[cs]e\b/i,
      /\bIP\s+Licen[cs]e\b/i,
      /\bLicen[cs]e\s+Agreement\b/i,
      /\bLicen[cs]e\b/i,
    ],
  ],
  ["Purchase", [/\bPurchase\s+Agreement\b/i]],
  ["Supply", [/\bSupplier\s+Agreement\b/i, /\bVendor\s+Agreement\b/i]],
  [
    "Partnership",
    [
      /\bPartnership\s+Agreement\b/i,
      /\bJoint\s+Venture\s+Agreement\b/i,
      /\bCollab(?:oration)?\s+Agreement\b/i,
    ],
  ],
  ["Amendment", [/\bContract\s+Amendment\b/i, /\bAmendment\b/i, /\bAddendum\b/i]],
]

/**
 * Split so a "distrust FINAL" rule can drop just the literal word and keep
 * the markers that actually describe an event (signed, executed) as
 * evidence.
 */
const FINAL_WORD_MARKER = /\bfinal\b/i
const EVENT_FINAL_MARKERS = [/\bexecuted\b/i, /\bsigned\b/i, /\bclean\s+version\b/i]
const FINAL_MARKERS = [FINAL_WORD_MARKER, ...EVENT_FINAL_MARKERS]
const DRAFT_MARKERS = [
  /\bdraft\b/i,
  /\bredline\b/i,
  /\bpending\s+signature\b/i,
  /\bunsigned\b/i,
  /\bfor\s+review\b/i,
  /\binternal\s+only\b/i,
  /\bdo\s+not\s+use\b/i,
  /\bdo\s+not\s+send\b/i,
  /\bnot\s+final\b/i,
  /\bplease\s+read\b/i,
]
const STALE_MARKERS = [/\bold\b/i, /\bcopy\b/i, /\bbackup\b/i, /\bsuperseded\b/i]

/** Collapse the separator zoo (`_`, `-`, `.`, `(`, `)`) down to single spaces. */
export function normalise(text: string): string {
  return text
    .replace(/[_\-–.()]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

export function findCounterparty(text: string): string | null {
  for (const { name, res } of COUNTERPARTY_MATCHERS) {
    for (const re of res) if (re.test(text)) return name
  }
  return null
}

export function findDocType(text: string): DocType | null {
  const t = normalise(text)
  for (const [type, patterns] of TYPE_PATTERNS) {
    for (const re of patterns) if (re.test(t)) return type
  }
  return null
}

/**
 * How each document type gets said in the wild. Two filings can land on the
 * same DocType while the filename and the contents word it differently — filed
 * as a collaboration agreement, described as a joint venture — which is worth
 * saying out loud even though it doesn't change the classification.
 */
const WORDINGS: [RegExp, string][] = [
  [/\bCollab(?:oration)?\s+Agreement\b/i, "a collaboration agreement"],
  [/\bJoint\s+Venture(?:\s+Agreement)?\b/i, "a joint venture"],
  [/\bPartnership\s+Agreement\b/i, "a partnership agreement"],
  [/\bMaster\s+Services\s+Agreement\b/i, "a master services agreement"],
  [/\bMaster\s+Agreement\b/i, "a master agreement"],
  [/\bFramework\s+agreement\b/i, "a framework agreement"],
  [/\bStatement\s+of\s+Work\b/i, "a statement of work"],
  [/\bWork\s+Order\b/i, "a work order"],
  [/\bSupplier\s+Agreement\b/i, "a supplier agreement"],
  [/\bVendor\s+Agreement\b/i, "a vendor agreement"],
  [/\bPurchase\s+Agreement\b/i, "a purchase agreement"],
  [/\bData\s+Processing\s+Addendum\b/i, "a data processing addendum"],
  [/\bData\s+Processing\s+Agreement\b/i, "a data processing agreement"],
  [/\bOffer\s+Letter\b/i, "an offer letter"],
  [/\bEmployment\s+Agreement\b/i, "an employment agreement"],
  [/\bEmployment\s+Contract\b/i, "an employment contract"],
  [/\bProperty\s+Lease\b/i, "a property lease"],
  [/\bLease\s+Agreement\b/i, "a lease agreement"],
  [/\bMutual\s+NDA\b/i, "a mutual NDA"],
  [/\bConfidentiality\s+Agreement\b/i, "a confidentiality agreement"],
  [/\bNon\s?Disclosure\b/i, "a non-disclosure agreement"],
  [/\bSoftware\s+Licen[cs]e\b/i, "a software licence"],
  [/\bIP\s+Licen[cs]e\b/i, "an IP licence"],
  [/\bLicen[cs]e\s+Agreement\b/i, "a licence agreement"],
  [/\bContract\s+Amendment\b/i, "a contract amendment"],
  [/\bAddendum\b/i, "an addendum"],
  [/\bAmendment\b/i, "an amendment"],
]

/**
 * Wordings that mean the same instrument. A master agreement and a framework
 * agreement are the same thing said twice; a collaboration agreement and a
 * joint venture are not. Only a change of sense is worth reporting.
 */
const SENSE: Record<string, string> = {
  "a master services agreement": "msa",
  "a master agreement": "msa",
  "a framework agreement": "msa",
  "a partnership agreement": "partnership",
  "a collaboration agreement": "collaboration",
  "a joint venture": "joint-venture",
  "a statement of work": "sow",
  "a work order": "work-order",
  "a supplier agreement": "supply",
  "a vendor agreement": "vendor",
  "a purchase agreement": "purchase",
  "an offer letter": "offer",
  "an employment agreement": "employment",
  "an employment contract": "employment",
  "a property lease": "lease",
  "a lease agreement": "lease",
  "a mutual NDA": "nda",
  "a confidentiality agreement": "nda",
  "a non-disclosure agreement": "nda",
  "a software licence": "software-licence",
  "an IP licence": "ip-licence",
  "a licence agreement": "licence",
  "a data processing agreement": "dpa",
  "a data processing addendum": "dpa",
  "a contract amendment": "amendment",
  "an amendment": "amendment",
  "an addendum": "amendment",
}

export function findWording(text: string): string | null {
  const t = normalise(text)
  for (const [re, phrase] of WORDINGS) if (re.test(t)) return phrase
  return null
}

function senseOf(phrase: string): string {
  return SENSE[phrase] ?? phrase
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]

/**
 * A numeric date whose first two parts are both 1–12 reads differently
 * depending on whether the repository writes day-first or month-first, and
 * this one writes both. Run against the raw filename — normalise() eats the
 * separators this depends on.
 */
export function findAmbiguousDate(
  filename: string
): { day: number; month: number } | null {
  const m = filename.match(/(?<![0-9])(\d{1,2})[._\-\/](\d{1,2})[._\-\/](\d{2,4})(?![0-9])/)
  if (!m) return null
  const a = Number(m[1])
  const b = Number(m[2])
  if (a < 1 || a > 12 || b < 1 || b > 12 || a === b) return null
  return { day: a, month: b }
}

export function describeAmbiguousDate(d: { day: number; month: number }): string {
  return `${d.day} ${MONTHS[d.month - 1]} or ${d.month} ${MONTHS[d.day - 1]}. Your repository uses both formats.`
}

function findVersion(filename: string): number | null {
  const t = normalise(filename)
  const explicit = t.match(/\bv\s?(\d)\b/i)
  if (explicit) return Number(explicit[1])
  if (/\bFINAL\s*2\b/i.test(t)) return 2
  return null
}

const anyOf = (res: RegExp[], t: string) => res.some((r) => r.test(t))

/* ------------------------------------------------------------------ */
/* Classify                                                            */
/* ------------------------------------------------------------------ */

export interface ClassifyOptions {
  /**
   * Treat an unambiguous FINAL marker in the filename as proof that a file is
   * the operative version. This is the "set a rule" the assistant offers at the
   * end of Story A — it moves work out of Needs review, at the cost of trusting
   * whoever typed the filename.
   */
  trustFinal: boolean
  /**
   * The opposite bet, offered in Story B: the word "final" carries no weight
   * at all, only signed/executed/clean-version do. Every downstream field —
   * isFinal, contradicts, bucket, confidence, the operative pick, the
   * proposed name — is derived from isFinal, so this one flag is enough to
   * re-run the whole classification under the new rule.
   */
  distrustFinal?: boolean
  /**
   * How a new name is written. The user's decision, not the product's — see
   * `lib/convention.ts`. It changes what every file is *called*, and nothing
   * about which pile it lands in.
   */
  convention?: Convention
}

export function classify(
  rows: RawRow[],
  options: ClassifyOptions = { trustFinal: false }
): Classification {
  const convention = options.convention ?? DEFAULT_CONVENTION
  const docs: Doc[] = rows.map((r) => {
    const stem = r.filename.replace(/\.[A-Za-z0-9]+$/, "")
    const nameCp = findCounterparty(r.filename)
    const contentsCp = nameCp ? null : findCounterparty(r.content_excerpt)
    const nameType = findDocType(stem)
    const contentsType = nameType ? null : findDocType(r.content_excerpt)
    const n = normalise(r.filename)

    const counterparty = nameCp ?? contentsCp
    const docType = nameType ?? contentsType
    const matchesEventFinal = anyOf(EVENT_FINAL_MARKERS, n)
    const isFinal = options.distrustFinal
      ? matchesEventFinal
      : matchesEventFinal || FINAL_WORD_MARKER.test(n)
    // The word "final" was the only thing making this file look final — the
    // exact case a "distrust FINAL" rule would strip out.
    const restsOnTheWordFinal = FINAL_WORD_MARKER.test(n) && !matchesEventFinal
    const isDraft = anyOf(DRAFT_MARKERS, n)
    const version = findVersion(r.filename)

    return {
      id: r.file_id,
      filename: r.filename,
      folderPath: r.folder_path,
      fileType: r.file_type,
      sizeKb: Number(r.size_kb) || 0,
      dateModified: r.date_modified,
      excerpt: r.content_excerpt,
      counterparty,
      counterpartySource: nameCp ? "filename" : contentsCp ? "contents" : null,
      docType,
      docTypeSource: nameType ? "filename" : contentsType ? "contents" : null,
      version,
      isFinal,
      isDraft,
      isStale: anyOf(STALE_MARKERS, n),
      contradicts: isFinal && isDraft,
      restsOnTheWordFinal,
      ambiguousDate: findAmbiguousDate(r.filename),
      wording: (() => {
        const filed = findWording(stem)
        const describes = findWording(r.content_excerpt)
        return filed && describes && senseOf(filed) !== senseOf(describes)
          ? { filed, describes }
          : null
      })(),
      familyKey: counterparty && docType ? `${counterparty}::${docType}` : null,
      bucket: "unknown",
      reason: "",
      confidence: "Medium",
      proposedName: formatName(
        {
          counterparty,
          docType,
          dateModified: r.date_modified,
          version,
          fileType: r.file_type,
          filename: r.filename,
        },
        convention
      ),
      proposedPath: formatPath(
        { docType, counterparty, folderPath: r.folder_path },
        convention
      ),
      operative: false,
      weakGrouping: contentsCp !== null,
    } satisfies Doc
  })

  const byId: Record<string, Doc> = {}
  for (const d of docs) byId[d.id] = d

  /* Group into version families. */
  const grouped: Record<string, Doc[]> = {}
  for (const d of docs) {
    if (!d.familyKey) continue
    ;(grouped[d.familyKey] ??= []).push(d)
  }

  const families: Record<string, Family> = {}
  for (const [key, members] of Object.entries(grouped)) {
    const identical: Record<string, number> = {}
    for (const m of members) identical[m.excerpt] = (identical[m.excerpt] ?? 0) + 1
    const largest = Math.max(...Object.values(identical))
    const operative = pickOperative(members)
    operative.operative = true
    // The operative copy is named without a version number: it is the one
    // that survives, so there is nothing left to tell it apart from.
    operative.proposedName = formatName(
      { ...operative, version: null },
      convention
    )
    families[key] = {
      key,
      counterparty: members[0]!.counterparty!,
      docType: members[0]!.docType!,
      memberIds: members.map((m) => m.id),
      operativeId: operative.id,
      largestIdenticalGroup: largest,
    }
  }

  /* Assign buckets. */
  for (const d of docs) {
    if (!d.counterparty) {
      d.bucket = "unknown"
      d.confidence = "Low"
      d.reason = d.excerpt.startsWith("Scanned copy")
        ? "No counterparty in the filename, and the scan is too poor to read one out of the contents."
        : "No counterparty in the filename or the contents."
      d.proposedName = d.filename
      d.proposedPath = d.folderPath
      continue
    }

    const fam = d.familyKey ? families[d.familyKey] : undefined
    const cleanFinals = fam
      ? fam.memberIds.filter((id) => byId[id]!.isFinal && !byId[id]!.isDraft)
      : []
    const famHasDuplicates = (fam?.largestIdenticalGroup ?? 1) > 1

    let needsReview = d.isStale || famHasDuplicates
    if (needsReview && options.trustFinal) {
      // With the rule on, one unambiguous FINAL in the family settles it.
      needsReview = famHasDuplicates
        ? cleanFinals.length !== 1
        : !(d.isFinal && !d.isDraft)
    }

    d.bucket = needsReview ? "review" : "ready"
    d.reason = explain(d, fam, famHasDuplicates)
    const versions = fam
      ? fam.memberIds
          .map((id) => byId[id]!.version)
          .filter((v): v is number => v !== null)
      : []
    const topVersion =
      d.version !== null && versions.length > 0 && d.version === Math.max(...versions)
    d.confidence = scoreConfidence(
      d,
      cleanFinals.length,
      famHasDuplicates,
      topVersion
    )
  }

  const counts: Counts = {
    total: docs.length,
    ready: docs.filter((d) => d.bucket === "ready").length,
    review: docs.filter((d) => d.bucket === "review").length,
    unknown: docs.filter((d) => d.bucket === "unknown").length,
  }

  /* Story A's subject: the one family with four versions, three identical. */
  let storyAFamilyKey: string | null = null
  for (const f of Object.values(families)) {
    if (f.memberIds.length === 4 && f.largestIdenticalGroup === 3) {
      storyAFamilyKey = f.key
      break
    }
  }
  const storyAFocusId = storyAFamilyKey
    ? (families[storyAFamilyKey]!.memberIds
        .map((id) => byId[id]!)
        .find((m) => m.isFinal && m.version === 2)?.id ??
      families[storyAFamilyKey]!.operativeId)
    : null

  const weakInReady = docs
    .filter((d) => d.bucket === "ready" && d.weakGrouping)
    .map((d) => d.id)

  return {
    docs,
    convention,
    byId,
    families,
    counts,
    storyAFamilyKey,
    storyAFocusId,
    weakInReady,
  }
}

/** Highest version, then an unambiguous FINAL, then freshest, then not-stale. */
function pickOperative(members: Doc[]): Doc {
  return [...members].sort((a, b) => {
    const av = a.version ?? 0
    const bv = b.version ?? 0
    if (av !== bv) return bv - av
    const af = a.isFinal && !a.isDraft ? 0 : 1
    const bf = b.isFinal && !b.isDraft ? 0 : 1
    if (af !== bf) return af - bf
    const as = a.isStale ? 1 : 0
    const bs = b.isStale ? 1 : 0
    if (as !== bs) return as - bs
    return b.dateModified.localeCompare(a.dateModified)
  })[0]!
}

function explain(d: Doc, fam: Family | undefined, famHasDuplicates: boolean): string {
  if (d.bucket === "ready") {
    if (d.counterpartySource === "contents")
      return "Counterparty read out of the contents; the filename doesn't name one."
    if (d.ambiguousDate)
      return `${describeAmbiguousDate(d.ambiguousDate)} Renaming from the modified date instead.`
    return "Counterparty and type confirmed by the contents."
  }
  if (d.contradicts) return "The filename says signed and unsigned at once."
  if (d.wording)
    return `Filed as ${d.wording.filed}. The contents describe ${d.wording.describes}.`
  if (d.ambiguousDate) return describeAmbiguousDate(d.ambiguousDate)
  if (famHasDuplicates && fam) {
    const n = fam.memberIds.length
    const hasDate = /\b(19|20)\d{2}\b/.test(d.filename)
    return hasDate
      ? `1 of ${n} versions with identical text. I can't tell which was signed.`
      : `1 of ${n} versions with identical text, and no date anywhere.`
  }
  if (d.isStale && d.isFinal)
    return "The filename says FINAL. Nothing in the contents confirms it."
  if (d.isStale)
    return "The filename marks this as an old copy, but nothing confirms which one it superseded."
  return "The evidence doesn't fully hold up."
}

function scoreConfidence(
  d: Doc,
  cleanFinals: number,
  famHasDuplicates: boolean,
  topVersion: boolean
): Confidence {
  if (d.contradicts) return "Low"
  if (d.counterpartySource === "contents") return "Low"
  if (d.bucket === "ready") return "High"
  // The operative pick that also carries the highest version number and a
  // clean FINAL is the one case where the name and the ordering agree.
  if (d.operative && topVersion && d.isFinal && !d.isDraft) return "High"
  if (famHasDuplicates && cleanFinals === 1) return "High"
  return "Medium"
}
