import type { ReactNode } from "react"

import type { Classification, RawRow } from "@/lib/classify"
import type { Convention, ConventionParse } from "@/lib/convention"

export type View = "upload" | "dashboard" | "chat" | "manifest"

export type ChangeAction =
  "rename" | "move" | "rename+move" | "supersede" | "no-action"

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
  /**
   * How this repository gets renamed. The user's decision — the assistant
   * opens with a proposal and nothing is applied until it is confirmed.
   */
  convention: Convention
  conventionConfirmed: boolean
  /** Which reader produced the current convention, for the UI to own up to. */
  conventionVia: "default" | "preset" | ConventionParse["via"]
  conventionNotes: string[]
  /** A typed convention is being read right now — the chat shows it thinking. */
  conventionPending: boolean
  /**
   * The beat the conversation was heading for when the convention step
   * interrupted it. "resume" goes here.
   */
  pendingBeat: string | null
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
  /** When a repository was last read, for the confirmation toast. */
  loadedAt: number
  /**
   * Which page of the worst-first ranking is on screen. The sample is not a
   * draw — [Show the next five] walks down the list rather than re-rolling.
   */
  samplePage: number
  /**
   * Files in a version family that, once FINAL is ignored, has nothing at all
   * claiming to be the signed copy. They still get renamed — the rule changed
   * no names — but the manifest stops claiming one of them is operative.
   */
  flaggedOrphans: string[]
  /** The plan has been run. Running it twice must not count anything twice. */
  applied: boolean
}

export type StoryId = "A" | "B"

/**
 * What the convention was when a given turn was said. The transcript is a
 * record: a card in an earlier turn has to keep showing what was on screen
 * then, not quietly restate whatever was decided afterwards.
 */
export interface ConventionSnapshot {
  convention: Convention
  via: State["conventionVia"]
  notes: string[]
}

export type Entry =
  | {
      kind: "beat"
      beatId: string
      at: number
      shown?: ConventionSnapshot
      /**
       * The five files this turn put on screen. Same reason as `shown`: a
       * turn that showed five named files has to keep showing those five
       * when the list moves on.
       */
      sample?: string[]
    }
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
  /**
   * Applied on top of the destination beat's own effect. Lets several chips
   * share one destination and still do different things — the convention
   * presets all land on the same beat, each having set a different one.
   */
  effect?: (s: State) => State
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
  /**
   * Where free text goes, when that is somewhere other than the primary chip.
   * The convention step needs this: its primary action is [Use this], but
   * anything typed is a convention to be read, not an acceptance of ours.
   */
  onFreeText?: string
  /**
   * This beat's typed line is a naming convention — read it (with Claude if
   * there's a key, locally otherwise) and apply the result.
   */
  readsConvention?: boolean
}

export type Story = Record<string, Beat>
