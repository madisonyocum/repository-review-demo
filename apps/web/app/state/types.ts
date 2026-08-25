import type { ReactNode } from "react"

import type { Classification, RawRow } from "@/lib/classify"

export type View = "upload" | "dashboard" | "chat" | "manifest"

export type ChangeAction =
  | "rename"
  | "move"
  | "rename+move"
  | "supersede"
  | "no-action"

export interface Change {
  fileId: string
  oldName: string
  newName: string
  oldPath: string
  newPath: string
  action: ChangeAction
  reason: string
  approvedBy: string
  approvedAt: string
}

export interface Piles {
  ready: number
  review: number
  withPartner: number
  unknown: number
}

export interface State {
  view: View
  rows: RawRow[]
  result: Classification | null
  source: string | null
  piles: Piles
  resolved: number
  /** Pile keys whose number changed on the last transition, for the scale bump. */
  bumped: (keyof Piles)[]
  storyId: StoryId | null
  transcript: Entry[]
  changes: Change[]
  sample: string[]
  demoted: string[]
  archived: string[]
  trustFinal: boolean
  /** Can't-identify files handed to the partner during Story B's detour. */
  escalatedUnknown: string[]
  /** Story B's "distrust FINAL" what-if has been walked through. */
  finalRuleApplied: boolean
  done: { A: boolean; B: boolean }
  seed: number
}

export type StoryId = "A" | "B"

export type Entry =
  | { kind: "beat"; beatId: string; at: number }
  | { kind: "user"; text: string; at: number }

export interface Chip {
  label: string
  next: string
  /** Renders as a primary action. Primary is for primary actions only. */
  primary?: boolean
  tone?: "default" | "destructive"
  /**
   * Words that, if the user's own typed message contains any of them, route
   * free text here instead of the beat's primary chip — the one place a
   * presenter can go off-script on purpose and land somewhere real, matching
   * how the escalation in Story B is reached: typed, not clicked.
   */
  matchText?: string[]
  /**
   * What lands in the transcript when this chip is clicked, if different from
   * the button's own label — a short button ("Approve") can still read as the
   * fuller scripted line ("Thank you, I'll approve all of them and send a
   * copy to our partner, Sara Vitelli") in the conversation.
   */
  sayAs?: string
  /**
   * "link" renders as a single line of link text with a check mark, for a
   * beat with exactly one obvious next step, instead of a full pill button.
   * "hidden" isn't rendered at all — it exists only so free text or a
   * pre-filled suggestion has somewhere correct to go via the primary flag.
   */
  style?: "button" | "link" | "hidden"
}

export interface Beat {
  id: string
  actor: "assistant" | "user"
  content: ReactNode | string
  chips?: Chip[]
  effect?: (s: State) => State
  /** Plays immediately after this one, with no turn from the user between. */
  then?: string
  /**
   * A synthetic user line inserted right before `then` plays — the forced
   * flow keeps moving from one click, but the transcript still reads as a
   * real back-and-forth instead of two assistant messages run together.
   */
  thenSay?: string
  /**
   * The scripted reply for this turn. It arrives pre-filled in the composer so
   * a presenter can just press send — editable, and never required.
   */
  suggest?: string
}

export type Story = Record<string, Beat>
