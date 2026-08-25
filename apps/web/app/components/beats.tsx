/**
 * The pieces a beat can put in the feed. They read live state where they need
 * to (the sample re-rolls), so a beat's `content` stays a plain ReactNode.
 */
import { FileText, Pencil, Plus } from "lucide-react"

import { Badge } from "@workspace/ui/components/badge"
import { cn } from "@workspace/ui/lib/utils"
import type { Classification, Confidence, Doc } from "@/lib/classify"
import { useAppState } from "@/state/store"

export function confidenceClass(c: Confidence): string {
  return c === "High" ? "text-ok" : c === "Medium" ? "text-warn" : "text-destructive"
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
  unknown: { label: "Can't Identify", cls: "bg-destructive/10 text-destructive" },
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
  for (const m of ordered) counts.set(m.excerpt, (counts.get(m.excerpt) ?? 0) + 1)
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
                "flex w-12 flex-col items-center gap-1 rounded-[0.7rem] px-1.5 py-2.5 text-[11px] font-medium",
                isDup
                  ? "bg-destructive/10 text-destructive"
                  : "bg-muted text-muted-foreground"
              )}
            >
              <FileText className="size-3.5" />
              <span>v{i + 1}</span>
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
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


