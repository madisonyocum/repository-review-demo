/**
 * The naming convention is the user's, not ours.
 *
 * Nothing in this file decides what a good filename looks like — it only knows
 * how to render one from parts the user has chosen: which fields appear, in
 * what order, joined by what, how the date is written, and where the file ends
 * up. `DEFAULT_CONVENTION` is a proposal the assistant opens with, not a rule
 * the product enforces, and every screen that shows a new name reads it from
 * here.
 */
import type { DocType } from "./classify"

export type NameToken =
  "counterparty" | "type" | "date" | "version" | "original"

/** 2024-03-11 · 20240311 · 2024 */
export type DateFormat = "iso" | "compact" | "year"

/** PinnacleInsurance · pinnacleinsurance · Pinnacle Insurance */
export type CaseStyle = "pascal" | "lower" | "keep"

export type FolderMode = "by-type" | "by-counterparty" | "keep"

export interface Convention {
  tokens: NameToken[]
  separator: "_" | "-" | " " | ""
  dateFormat: DateFormat
  caseStyle: CaseStyle
  folders: FolderMode
  /** Where a superseded copy goes. Never a delete — see Story A. */
  archive: string
}

export const DEFAULT_CONVENTION: Convention = {
  tokens: ["counterparty", "type", "date"],
  separator: "_",
  dateFormat: "iso",
  caseStyle: "pascal",
  folders: "by-type",
  archive: "/Archive",
}

/**
 * Three starting points, offered as buttons. They are not the only answers —
 * anything typed into the composer is parsed instead (see `parseConvention`).
 */
export interface Preset {
  id: string
  label: string
  convention: Convention
}

export const PRESETS: Preset[] = [
  {
    id: "counterparty-first",
    label: "Counterparty first",
    convention: DEFAULT_CONVENTION,
  },
  {
    id: "date-first",
    label: "Date first, dashes",
    convention: {
      ...DEFAULT_CONVENTION,
      tokens: ["date", "counterparty", "type"],
      separator: "-",
    },
  },
  {
    id: "keep-folders",
    label: "Keep my folders",
    convention: { ...DEFAULT_CONVENTION, folders: "keep" },
  },
]

/* ------------------------------------------------------------------ */
/* Rendering a name                                                    */
/* ------------------------------------------------------------------ */

export function pascal(name: string): string {
  return name
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase() + w.slice(1))
    .join("")
}

function cased(value: string, style: CaseStyle): string {
  if (style === "pascal") return pascal(value)
  if (style === "lower") return value.toLowerCase().replace(/[^a-z0-9]+/g, "")
  return value
}

/** The date is only ever reformatted, never invented. */
function formatDate(iso: string, format: DateFormat): string {
  if (format === "year") return iso.slice(0, 4)
  if (format === "compact") return iso.replace(/-/g, "")
  return iso
}

export interface Namable {
  counterparty: string | null
  docType: DocType | null
  dateModified: string
  version: number | null
  fileType: string
  filename: string
}

/**
 * One name, built from the tokens the user asked for. A file the classifier
 * couldn't place keeps the name it arrived with — a convention is a way of
 * writing down what you know, and there is nothing here to write down.
 */
export function formatName(d: Namable, c: Convention): string {
  if (!d.counterparty || !d.docType) return d.filename
  const stem = d.filename.replace(/\.[A-Za-z0-9]+$/, "")

  const parts = c.tokens
    .map((token) => {
      switch (token) {
        case "counterparty":
          return cased(d.counterparty!, c.caseStyle)
        case "type":
          return cased(d.docType!, c.caseStyle)
        case "date":
          return formatDate(d.dateModified, c.dateFormat)
        // Only worth writing down when it distinguishes something: v1 of one
        // is noise, and the operative copy of a family is deliberately
        // renamed without a version at all.
        case "version":
          return d.version && d.version > 1 ? `v${d.version}` : ""
        case "original":
          return cased(stem, c.caseStyle === "pascal" ? "keep" : c.caseStyle)
      }
    })
    .filter(Boolean)

  if (!parts.length) return d.filename
  return `${parts.join(c.separator)}.${d.fileType}`
}

const PATH_FOR: Record<DocType, string> = {
  MSA: "/Legal/Contracts/Master Agreements",
  SOW: "/Legal/Contracts/Statements of Work",
  NDA: "/Legal/NDAs",
  DPA: "/Legal/Data Protection",
  Lease: "/Legal/Property",
  Employment: "/Legal/People",
  License: "/Legal/Licensing",
  Purchase: "/Legal/Commercial",
  Supply: "/Legal/Commercial",
  Partnership: "/Legal/Partnerships",
  Amendment: "/Legal/Amendments",
}

export function formatPath(
  d: {
    docType: DocType | null
    counterparty: string | null
    folderPath: string
  },
  c: Convention
): string {
  if (c.folders === "keep") return d.folderPath
  if (c.folders === "by-counterparty")
    return d.counterparty ? `/Legal/${d.counterparty}` : d.folderPath
  return d.docType ? PATH_FOR[d.docType] : d.folderPath
}

/* ------------------------------------------------------------------ */
/* Describing one, in words                                            */
/* ------------------------------------------------------------------ */

const TOKEN_WORD: Record<NameToken, string> = {
  counterparty: "Counterparty",
  type: "Type",
  date: "Date",
  version: "Version",
  original: "OriginalName",
}

/** The pattern as a person would write it: Counterparty_Type_Date */
export function describePattern(c: Convention): string {
  const joined = c.tokens.map((t) => TOKEN_WORD[t]).join(c.separator || "")
  return `${joined}.ext`
}

const FOLDER_WORD: Record<FolderMode, string> = {
  "by-type": "filed by document type",
  "by-counterparty": "filed by counterparty",
  keep: "left in their current folders",
}

export function describeFolders(c: Convention): string {
  return FOLDER_WORD[c.folders]
}

export function describeConvention(c: Convention): string {
  return `${describePattern(c)}, ${describeFolders(c)}, superseded copies to ${c.archive}`
}

export function sameConvention(a: Convention, b: Convention): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

/* ------------------------------------------------------------------ */
/* Reading one out of a sentence                                       */
/* ------------------------------------------------------------------ */

export interface ConventionParse {
  convention: Convention
  /** Which reader produced it — the UI says so rather than implying magic. */
  via: "claude" | "local"
  /** What was understood, in the user's terms. Shown, not logged. */
  notes: string[]
}

const TOKEN_CUES: { token: NameToken; re: RegExp }[] = [
  {
    token: "counterparty",
    re: /counterpart(?:y|ies)|company|client|customer|vendor|supplier|party|firm|who\s+it'?s\s+with/i,
  },
  {
    token: "type",
    re: /\btypes?\b|doc(?:ument)?\s*type|kind\s+of\s+(?:doc|agreement|contract)|what\s+it\s+is/i,
  },
  { token: "date", re: /\bdates?\b|\byears?\b|\bwhen\b|yyyy|mm-?dd/i },
  { token: "version", re: /\bversions?\b|\brevisions?\b|\bv\d\b/i },
  {
    token: "original",
    re: /original\s*name|existing\s*name|current\s*name|old\s*name|originalname/i,
  },
]

/**
 * A deliberately small, deterministic reader: it looks for the words people
 * actually use and takes the order they appear in as the order of the name.
 * It runs when there's no API key, and as the fallback whenever the model call
 * fails — the demo never depends on the network to move.
 */
export function parseConventionLocally(
  text: string,
  base: Convention = DEFAULT_CONVENTION
): ConventionParse {
  const t = text.trim()
  const notes: string[] = []
  const next: Convention = { ...base, tokens: [...base.tokens] }

  // Someone who types the pattern itself — "Date_Counterparty_Type" — has
  // said exactly what they mean, but an underscore is a regex word character,
  // so \b never fires between the parts. Swapping them for spaces is
  // length-preserving, which keeps the positions below honest.
  const words = t.replace(/_/g, " ")

  const found = TOKEN_CUES.map(({ token, re }) => ({
    token,
    at: words.search(re),
  })).filter((c) => c.at >= 0)

  if (found.length) {
    next.tokens = found.sort((a, b) => a.at - b.at).map((c) => c.token)
    notes.push(
      `Name order: ${next.tokens.map((x) => TOKEN_WORD[x]).join(" then ")}`
    )
  }

  // The separator is read from the sentence's own punctuation first — someone
  // typing "Company-Type-Date" has already shown which one they mean.
  const sep = /underscore|snake/i.test(t)
    ? "_"
    : /dash|hyphen|kebab/i.test(t)
      ? "-"
      : /\bspaces?\b/i.test(t)
        ? " "
        : /camel|no separator|nothing between|run together/i.test(t)
          ? ""
          : /[A-Za-z]_[A-Za-z]/.test(t)
            ? "_"
            : /[A-Za-z]-[A-Za-z]/.test(t)
              ? "-"
              : null
  if (sep !== null && sep !== base.separator) {
    next.separator = sep
    notes.push(`Joined by ${sep === "" ? "nothing" : `"${sep}"`}`)
  }

  if (/yyyymmdd|no dashes in the date|compact date/i.test(words)) {
    next.dateFormat = "compact"
    notes.push("Date as YYYYMMDD")
  } else if (/\byear only\b|\b(?:just |only )?the year\b/i.test(words)) {
    next.dateFormat = "year"
    notes.push("Date as the year alone")
  }

  if (/lower ?case/i.test(t)) {
    next.caseStyle = "lower"
    notes.push("Lower case")
  } else if (
    /keep the (?:spelling|caps|capitals)|as (?:they are|written)/i.test(t)
  ) {
    next.caseStyle = "keep"
    notes.push("Names spelled as they already are")
  }

  if (
    /keep (?:the |my |our )?(?:existing |current )?(?:folders?|paths?|structure)|leave (?:the )?folders?|don'?t move|do not move|same folders?/i.test(
      t
    )
  ) {
    next.folders = "keep"
    notes.push("Folders left exactly as they are")
  } else if (
    /by counterpart|by company|folder per (?:company|counterpart)|group by (?:company|counterpart)/i.test(
      t
    )
  ) {
    next.folders = "by-counterparty"
    notes.push("A folder per counterparty")
  } else if (/by (?:document )?type|folder per type/i.test(t)) {
    next.folders = "by-type"
    notes.push("Filed by document type")
  }

  // "…move superseded copies to /Superseded" — take the folder they named.
  if (/archive|supersede/i.test(t)) {
    const named = t.match(
      /(?:to|into|in)\s+\/?([A-Za-z][A-Za-z0-9 _-]{1,30}?)(?:\s+(?:folder|instead))?\s*[.,]?$/i
    )
    const folder = named?.[1]?.trim()
    if (folder && !/^(archive)$/i.test(folder)) {
      next.archive = `/${folder.replace(/^\/+/, "")}`
      notes.push(`Superseded copies to ${next.archive}`)
    }
  }

  if (!notes.length)
    notes.push(
      "Nothing in that reads as a naming rule, so I've kept the current one."
    )

  return { convention: next, via: "local", notes }
}
