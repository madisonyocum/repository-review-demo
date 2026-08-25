import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useReducer,
  type ReactNode,
} from "react"

import { classify, type RawRow } from "@/lib/classify"
import { DEFAULT_CONVENTION, type Convention } from "@/lib/convention"
import { changeFor, drawSample } from "@/lib/ledger"
import type { Piles, State, StoryId, View } from "./types"

const EMPTY_PILES: Piles = { ready: 0, review: 0, withPartner: 0, unknown: 0 }

export const initialState: State = {
  view: "upload",
  rows: [],
  result: null,
  source: null,
  piles: EMPTY_PILES,
  resolved: 0,
  bumped: [],
  storyId: null,
  convention: DEFAULT_CONVENTION,
  conventionConfirmed: false,
  conventionVia: "default",
  conventionNotes: [],
  conventionPending: false,
  pendingBeat: null,
  transcript: [],
  changes: [],
  sample: [],
  demoted: [],
  archived: [],
  trustFinal: false,
  escalatedUnknown: [],
  finalRuleApplied: false,
  done: { A: false, B: false },
  seed: 1,
}

export type Action =
  | { type: "load"; rows: RawRow[]; source: string }
  | { type: "view"; view: View }
  | { type: "story"; id: StoryId; firstBeat: string }
  | { type: "beat"; beatId: string; effect?: (s: State) => State }
  | { type: "say"; text: string }
  | { type: "convention-pending" }
  | {
      type: "convention"
      convention: Convention
      via: State["conventionVia"]
      notes: string[]
    }
  | { type: "reseed" }
  | { type: "commit"; effect: (s: State) => State; view: View }
  | { type: "reset" }

/**
 * Stamp the newest beat with the convention it is being shown under, so the
 * card in that turn stays what it was when it was said.
 */
function stamp(s: State): State {
  const i = s.transcript.length - 1
  const last = s.transcript[i]
  if (!last || last.kind !== "beat") return s
  const transcript = [...s.transcript]
  transcript[i] = {
    ...last,
    shown: {
      convention: s.convention,
      via: s.conventionVia,
      notes: s.conventionNotes,
    },
  }
  return { ...s, transcript }
}

/** Which pile numbers moved, so the tiles know what to animate. */
function diffPiles(before: Piles, after: Piles): (keyof Piles)[] {
  return (Object.keys(after) as (keyof Piles)[]).filter(
    (k) => before[k] !== after[k]
  )
}

function reduce(state: State, action: Action): State {
  switch (action.type) {
    case "load": {
      const result = classify(action.rows, {
        trustFinal: false,
        convention: initialState.convention,
      })
      // The real numbers, for anyone who wants to check the screen against them.
      console.log("[classify]", result.counts, {
        families: Object.keys(result.families).length,
        storyAFamily: result.storyAFamilyKey,
        weakInReady: result.weakInReady,
        result,
      })
      return {
        ...initialState,
        view: "dashboard",
        rows: action.rows,
        result,
        source: action.source,
        piles: {
          ready: result.counts.ready,
          review: result.counts.review,
          withPartner: 0,
          unknown: result.counts.unknown,
        },
        seed: Math.floor(Math.random() * 1e9),
      }
    }
    case "view":
      return { ...state, view: action.view, bumped: [] }
    case "story": {
      // Entering a story from the dashboard always starts its transcript
      // fresh, whether this is the first visit or a return trip after
      // backing out — otherwise the previous run's turns stick around and
      // the same opening beat lands twice in a row. Piles, changes and
      // everything else in state carries over untouched.
      // A story that has already been walked doesn't get walked again.
      const wanted =
        (action.id === "A" && state.done.A) || (action.id === "B" && state.done.B)
          ? "again"
          : action.firstBeat
      // Until the convention is settled, every route into the conversation
      // lands on the convention step first and remembers where it was going.
      const first = state.conventionConfirmed ? wanted : "c1"
      return stamp({
        ...state,
        view: "chat",
        storyId: action.id,
        bumped: [],
        pendingBeat: wanted,
        transcript: [{ kind: "beat", beatId: first, at: Date.now() }],
      })
    }
    case "beat": {
      const withBeat: State = {
        ...state,
        view: "chat",
        transcript: [
          ...state.transcript,
          { kind: "beat", beatId: action.beatId, at: Date.now() },
        ],
        bumped: [],
      }
      const next = stamp(action.effect ? action.effect(withBeat) : withBeat)
      return { ...next, bumped: diffPiles(state.piles, next.piles) }
    }
    case "say":
      return {
        ...state,
        transcript: [
          ...state.transcript,
          { kind: "user", text: action.text, at: Date.now() },
        ],
        bumped: [],
      }
    case "convention-pending":
      return { ...state, conventionPending: true }
    case "convention":
      return applyConvention(state, action.convention, action.via, action.notes)
    case "commit": {
      const next = action.effect(state)
      return {
        ...next,
        view: action.view,
        bumped: diffPiles(state.piles, next.piles),
      }
    }
    case "reseed": {
      const seed = state.seed + 1
      const sample = state.result
        ? drawSample(state.result, seed, state.demoted).ids
        : []
      return { ...state, seed, sample, bumped: [] }
    }
    case "reset":
      return initialState
  }
}

/**
 * Adopt a naming convention: re-run the classification under it so every
 * proposed name on screen is the user's convention rather than ours, and
 * re-render any change already recorded. Which pile a file is in cannot move
 * here — a convention decides what a file is *called*, never what is known
 * about it — so the counts are deliberately left alone.
 */
export function applyConvention(
  state: State,
  convention: Convention,
  via: State["conventionVia"],
  notes: string[]
): State {
  if (!state.result) {
    return stamp({
      ...state,
      convention,
      conventionVia: via,
      conventionNotes: notes,
      conventionPending: false,
    })
  }
  const result = classify(state.rows, {
    trustFinal: state.trustFinal,
    convention,
  })
  const changes = state.changes.map((c) => {
    const doc = result.byId[c.fileId]
    if (!doc || c.action === "no-action") return c
    return {
      ...c,
      newName: doc.proposedName,
      newPath:
        c.action === "supersede"
          ? convention.archive
          : changeFor(doc, c.approvedBy, [], new Date(), convention.archive)
              .newPath,
    }
  })
  // The turn that is showing the card is the one that just asked about it,
  // so it gets re-stamped with what was actually read.
  return stamp({
    ...state,
    convention,
    conventionVia: via,
    conventionNotes: notes,
    conventionPending: false,
    result,
    changes,
  })
}

interface History {
  past: State[]
  present: State
}

function historyReducer(
  history: History,
  action: Action | { type: "undo" } | { type: "undo-all" }
): History {
  if (action.type === "undo-all") {
    // Back to the moment the repository loaded. Nothing applied, nothing lost.
    const first = history.past[0]
    return first ? { past: [], present: first } : history
  }
  if (action.type === "undo") {
    const previous = history.past.at(-1)
    if (!previous) return history
    return { past: history.past.slice(0, -1), present: previous }
  }
  const present = reduce(history.present, action)
  if (present === history.present) return history
  // Loading a repository starts a fresh history; there is nothing behind it.
  if (action.type === "load" || action.type === "reset")
    return { past: [], present }
  // "It's reading that now" is not a step in the conversation, so Undo
  // shouldn't stop on it.
  if (action.type === "convention-pending") return { ...history, present }
  return { past: [...history.past, history.present], present }
}

interface Store {
  state: State
  dispatch: (action: Action) => void
  undo: () => void
  undoAll: () => void
  canUndo: boolean
}

const StoreContext = createContext<Store | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [history, raw] = useReducer(historyReducer, {
    past: [],
    present: initialState,
  })
  const dispatch = useCallback((action: Action) => raw(action), [])
  const undo = useCallback(() => raw({ type: "undo" }), [])
  const undoAll = useCallback(() => raw({ type: "undo-all" }), [])
  const value = useMemo(
    () => ({
      state: history.present,
      dispatch,
      undo,
      undoAll,
      canUndo: history.past.length > 0,
    }),
    [history, dispatch, undo, undoAll]
  )
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore(): Store {
  const store = useContext(StoreContext)
  if (!store) throw new Error("useStore must be used inside <StoreProvider>")
  return store
}

export function useAppState(): State {
  return useStore().state
}
