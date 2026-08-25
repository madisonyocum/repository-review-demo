/**
 * How a recorded change reads in the Latest changes rail. The rail starts
 * empty and fills as changes are actually made.
 */
import type { Change } from "@/state/types"

export type HistoryKind =
  | "approved"
  | "renamed"
  | "rejected"
  | "escalated"
  | "unchanged"
  | "archived"

export const VERB: Record<HistoryKind, string> = {
  approved: "approved by",
  renamed: "renamed by",
  rejected: "rejected by",
  escalated: "escalated to a partner by",
  unchanged: "left unchanged, no counterparty",
  archived: "superseded copy archived by",
}

/** "Jonathan Sayer" reads as "Jonathan S.", as in the design. */
export function initialled(name: string): string {
  const parts = name
    .replace(/\s*\(open\)\s*/, "")
    .trim()
    .split(/\s+/)
  if (parts.length < 2) return parts[0] ?? name
  return `${parts[0]} ${parts[1]![0]}.`
}

export function kindOf(change: Change): HistoryKind {
  if (change.approvedBy.includes("(open)")) return "escalated"
  if (change.action === "supersede") return "archived"
  if (change.action === "no-action") return "unchanged"
  return change.approvedBy === "Assistant" ? "renamed" : "approved"
}

export function ago(iso: string, now = Date.now()): string {
  if (!iso) return ""
  const seconds = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000))
  if (seconds < 60) return "just now"
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`
  const days = Math.floor(hours / 24)
  return `${days} day${days === 1 ? "" : "s"} ago`
}
