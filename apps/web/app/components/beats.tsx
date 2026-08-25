/**
 * The pieces a beat can put in the feed. They read live state where they need
 * to (the sample re-rolls), so a beat's `content` stays a plain ReactNode.
 */
import { createContext, useContext } from "react"
import { ArrowRight, FileText, Folder, Pencil, Plus } from "lucide-react"

import { Badge } from "@workspace/ui/components/badge"
import { cn } from "@workspace/ui/lib/utils"
import type { Classification, Confidence, Doc } from "@/lib/classify"
import {
  describeFolders,
  describePattern,
  formatName,
  formatPath,
} from "@/lib/convention"
import { hasApiKey, MODEL } from "@/lib/llm"
import { useAppState } from "@/state/store"
import type { ConventionSnapshot } from "@/state/types"

export function confidenceClass(c: Confidence): string {
  return c === "High"
    ? "text-ok"
    : c === "Medium"
      ? "text-warn"
      : "text-destructive"
}

export function FileName({ children }: { children: string }) {
  return (
    <span className="font-mono text-[0.8em] break-all text-foreground">
      {children}
    </span>
  )
}

const BUCKET_BADGE = {
  ready: { label: "Ready to Apply", cls: "bg-ok/10 text-ok" },
  review: { label: "Needs Review", cls: "bg-warn/10 text-warn" },
  unknown: {
    label: "Can't Identify",
    cls: "bg-destructive/10 text-destructive",
  },
} as const

/** One file, named, with the pile it currently sits in. */
export function FileCard({ doc }: { doc: Doc }) {
  const badge = BUCKET_BADGE[doc.bucket]
  return (
    <div className="surface mt-3 flex items-center gap-3.5 px-4 py-3.5">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-[0.6rem] bg-muted text-muted-foreground">
        <FileText className="size-4" />
      </span>
      <span className="min-w-0 flex-1 text-[0.9375rem] break-words">
        {doc.filename}
      </span>
      <span
        className={cn(
          "shrink-0 rounded-full px-3 py-1 text-xs font-medium",
          badge.cls
        )}
      >
        {badge.label}
      </span>
    </div>
  )
}

/** v1 v2 v3 v4 with the duplicates called out. */
export function VersionFamily({
  result,
  familyKey,
}: {
  result: Classification
  familyKey: string
}) {
  const fam = result.families[familyKey]!
  const ordered = fam.memberIds
    .map((id) => result.byId[id]!)
    .sort(
      (a, b) =>
        (a.version ?? 0) - (b.version ?? 0) ||
        a.dateModified.localeCompare(b.dateModified)
    )
  const counts = new Map<string, number>()
  for (const m of ordered)
    counts.set(m.excerpt, (counts.get(m.excerpt) ?? 0) + 1)
  const dupExcerpt = [...counts.entries()].find(
    ([, n]) => n === fam.largestIdenticalGroup
  )?.[0]

  // The matching copies come first so "3 of 4 share identical text" is legible
  // at a glance. Ordinal labels: two members can both lack an explicit version,
  // so numbering off their own filenames would print v2 twice. The real
  // filename is on the tooltip.
  const members = [
    ...ordered.filter((m) => m.excerpt === dupExcerpt),
    ...ordered.filter((m) => m.excerpt !== dupExcerpt),
  ]

  return (
    <div className="surface mt-3 flex flex-wrap items-center gap-4 px-4 py-3.5">
      <div className="flex flex-wrap gap-2">
        {members.map((m, i) => {
          const isDup = m.excerpt === dupExcerpt
          return (
            <div
              key={m.id}
              title={m.filename}
              className={cn(
                // Square, with the icon and its label centred in it — even
                // padding on all four sides rather than a tall box with the
                // content sitting high.
                "flex size-14 flex-col items-center justify-center gap-0.5 rounded-[0.7rem] pt-[5px] text-[11px] font-medium",
                isDup
                  ? "bg-destructive/10 text-destructive"
                  : "bg-muted text-muted-foreground"
              )}
            >
              <FileText className="size-4" />
              <span className="numeric">v{i + 1}</span>
            </div>
          )
        })}
      </div>
      <p className="text-sm text-muted-foreground">
        {fam.largestIdenticalGroup} of {members.length} share identical text
      </p>
      <button
        type="button"
        className="ml-auto inline-flex cursor-pointer items-center gap-1 text-sm font-medium text-foreground hover:underline"
      >
        <Plus className="size-3" /> View Duplicates
      </button>
    </div>
  )
}

/** Confidence · Version family · Name change. */
export function Proposal({ doc, kept }: { doc: Doc; kept: number }) {
  return (
    <div className="surface mt-3 grid grid-cols-1 gap-5 px-5 py-4 sm:grid-cols-[auto_auto_1fr]">
      <Field label="Confidence">
        <span className={cn("font-medium", confidenceClass(doc.confidence))}>
          {doc.confidence}
        </span>
      </Field>
      <Field label="Version family">
        <span className="font-medium">
          {kept} {kept === 1 ? "copy" : "copies"}
        </span>
      </Field>
      <Field label="Name change">
        <span className="font-medium break-words text-primary">
          {doc.proposedName}
        </span>
      </Field>
    </div>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-medium tracking-[0.08em] text-muted-foreground uppercase whitespace-nowrap">
        {label}
      </p>
      <p className="mt-1.5 text-[0.9375rem]">{children}</p>
    </div>
  )
}

/**
 * The sampled rows, one file per line. Reads the live sample so a re-roll
 * re-renders. The flagged row carries a "No Counterparty" tag rather than an
 * arrow to a second column — the point is that it doesn't get a proposed name
 * at all.
 */
export function SampleList() {
  const { result, sample } = useAppState()
  if (!result) return null
  const docs = sample.map((id) => result.byId[id]!).filter(Boolean)

  return (
    <div className="surface mt-3 divide-y divide-border/60">
      {docs.map((d) => (
        <div key={d.id} className="flex items-center gap-3 px-4 py-3">
          <FileText className="size-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate text-[0.9375rem]">
            {d.filename}
          </span>
          {d.weakGrouping && (
            <Badge
              variant="destructive"
              className="shrink-0 rounded-full px-2.5 py-1"
            >
              No Counterparty
            </Badge>
          )}
        </div>
      ))}
    </div>
  )
}

/** One flagged file plus the rule the assistant just added because of it. */
export function RuleCard({ id, rule }: { id: string; rule: string }) {
  const { result } = useAppState()
  const d = result?.byId[id]
  if (!d) return null
  return (
    <div className="surface mt-3 flex items-center gap-3 px-4 py-3">
      <FileText className="size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate text-[0.9375rem]">
        {d.filename}
      </span>
      <span className="flex shrink-0 items-center gap-1.5 text-sm text-muted-foreground">
        <Pencil className="size-3.5" />
        {rule}
      </span>
    </div>
  )
}

/**
 * What a past turn was shown under. The feed provides it; the live turn
 * provides nothing and the card falls through to current state.
 */
export const ShownAs = createContext<ConventionSnapshot | null>(null)

/**
 * The naming convention — pattern, folders, archive, and one real file
 * rendered under it. The live turn shows the convention as it stands now; an
 * earlier turn shows what it was when that turn was said.
 */
export function ConventionCard() {
  const state = useAppState()
  const shown = useContext(ShownAs)
  const { result } = state
  const convention = shown?.convention ?? state.convention
  const conventionVia = shown?.via ?? state.conventionVia
  const conventionNotes = shown?.notes ?? state.conventionNotes
  if (!result) return null

  // A real file from the repository, never a made-up example: the first one
  // the classifier can actually name, re-rendered under the convention this
  // card is showing.
  const source =
    (result.storyAFocusId ? result.byId[result.storyAFocusId] : undefined) ??
    result.docs.find(
      (d) => d.bucket === "ready" && d.proposedName !== d.filename
    )
  const example = source && {
    ...source,
    proposedName: formatName({ ...source, version: null }, convention),
    proposedPath: formatPath(source, convention),
  }

  return (
    <div className="mt-3 surface px-5 py-4">
      {/* Wrapping beats squeezing: the pattern is the one field that must
          stay readable, so it keeps its natural width and the others drop to
          the next line when the rail is narrow. */}
      <div className="flex flex-wrap items-start gap-x-8 gap-y-4">
        <Field label="Pattern">
          <span className="font-mono text-[0.8125rem] font-medium break-all text-primary">
            {describePattern(convention)}
          </span>
        </Field>
        <Field label="Folders">
          <span className="font-medium whitespace-nowrap">
            {describeFolders(convention)}
          </span>
        </Field>
        <Field label="Superseded">
          <span className="font-medium whitespace-nowrap">
            {convention.archive}
          </span>
        </Field>
      </div>

      {example && (
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border/60 pt-3.5 text-[0.8125rem]">
          <FileText className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="font-mono break-all text-muted-foreground line-through">
            {example.filename}
          </span>
          <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="font-mono font-medium break-all text-foreground">
            {example.proposedName}
          </span>
          {example.proposedPath !== example.folderPath && (
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <Folder className="size-3.5 shrink-0" />
              {example.proposedPath}
            </span>
          )}
        </div>
      )}

      {conventionNotes.length > 0 && (
        <ul className="mt-3.5 space-y-1.5">
          {conventionNotes.map((note) => (
            <li
              key={note}
              className="flex items-center gap-2 text-[0.8125rem] text-muted-foreground"
            >
              <Pencil className="size-3 shrink-0" />
              {note}
            </li>
          ))}
        </ul>
      )}

      <p className="mt-3.5 text-xs text-muted-foreground">
        {SOURCE_LINE[conventionVia]}
      </p>
    </div>
  )
}

/** Which reader produced this, said plainly rather than implied. */
const SOURCE_LINE: Record<string, string> = {
  default:
    "My suggestion, from what is already in your filenames. Yours to change.",
  preset: "Your choice.",
  claude: `Read from what you typed by Claude \u00b7 ${MODEL}`,
  local: hasApiKey()
    ? "Read from what you typed, here in the browser."
    : "Read from what you typed, here in the browser \u00b7 no API key configured.",
}
