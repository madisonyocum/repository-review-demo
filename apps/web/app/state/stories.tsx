/**
 * The A and B storylines are scripted conversation paths through one UI. They
 * are data: a map of beats, each with content, chips, and an effect on state.
 * No branching components, and every number in the copy is read off the
 * classification rather than typed in.
 */
import { Check, Plus } from "lucide-react"

import { applyConvention, useAppState } from "./store"

import { classify, type Classification } from "@/lib/classify"
import {
  changeFor,
  decided,
  distrustFinalImpact,
  drawSample,
  escalated,
  superseded,
} from "@/lib/ledger"
import {
  ConventionCard,
  FileCard,
  Proposal,
  RuleCard,
  SampleList,
  VersionFamily,
} from "@/components/beats"
import { DEFAULT_CONVENTION, PRESETS, type Convention } from "@/lib/convention"
import { Pencil } from "lucide-react"
import { APPROVER, PARTNER, PARTNER_FIRST_NAME } from "@/lib/people"
import type { Beat, State, Story } from "./types"

const WORDS = [
  "no", "one", "two", "three", "four", "five", "six", "seven", "eight",
  "nine", "ten", "eleven", "twelve",
]
const spell = (n: number) => WORDS[n] ?? String(n)
const Spell = ({ n }: { n: number }) => <>{spell(n)}</>

/**
 * Ways of saying "that one, thanks". The convention step reads anything typed
 * as a convention, so accepting has to be sayable as well as clickable.
 */
const ACCEPT_WORDS = [
  "set this rule",
  "set the rule",
  "set it",
  "use this",
  "use that",
  "looks good",
  "sounds good",
  "that works",
  "that's fine",
  "thats fine",
  "go ahead",
  "perfect",
  "keep it",
  "accept",
  "yes",
  "yep",
  "okay",
]

/** Wherever the user said superseded copies go. Never a literal in the copy. */
const ArchiveFolder = () => {
  const { convention } = useAppState()
  return <span className="text-primary">{convention.archive}</span>
}

export function buildStories(result: Classification): {
  STORY_C: Beat[]
  STORY_A: Beat[]
  STORY_B: Beat[]
  all: Story
} {
  const famKey = result.storyAFamilyKey
  const fam = famKey ? result.families[famKey]! : null
  const focus = result.storyAFocusId ? result.byId[result.storyAFocusId]! : null
  const others = fam ? fam.memberIds.filter((id) => id !== focus?.id) : []
  const weak = result.weakInReady
  const readyAfterB = result.counts.ready - weak.length
  const unknownAfterB = result.counts.unknown + weak.length
  const moreFound = Math.max(0, weak.length - 1)

  // Every can't-identify file once Story B has caught its own mistakes: the
  // ones classify() could never place, plus the ones just demoted out of
  // Ready to apply. Escalating this pile is a Story B detour, not a required
  // step — it never removes anything from Can't identify, only annotates who
  // it is with now.
  const allUnknownIds = [
    ...result.docs.filter((d) => d.bucket === "unknown").map((d) => d.id),
    ...weak,
  ]

  // A second what-if, independent of trustFinal: what changes if the word
  // "final" in a filename is worth nothing at all. Computed once, from the
  // real data — the numbers in b5rule's copy come straight out of this.
  const finalRuleImpact = distrustFinalImpact(result.docs.map((d) => ({
    file_id: d.id,
    filename: d.filename,
    folder_path: d.folderPath,
    file_type: d.fileType,
    size_kb: d.sizeKb,
    date_modified: d.dateModified,
    content_excerpt: d.excerpt,
  })), result)

  /* ---------------------------------------------------------------- */
  /* Effects                                                          */
  /* ---------------------------------------------------------------- */

  /** Approve the focus file, archive the rest of its family. */
  const confirmFamily = (s: State): State => {
    if (!fam || !focus) return s
    const archived = [...s.archived, ...others]
    const at = new Date()
    const changes = [
      changeFor(focus, APPROVER, archived, at, s.convention.archive),
      ...others.map((id) =>
        changeFor(
          result.byId[id]!,
          APPROVER,
          archived,
          at,
          s.convention.archive
        )
      ),
    ]
    return {
      ...s,
      archived,
      changes: [...s.changes, ...changes],
      resolved: s.resolved + fam.memberIds.length,
      piles: { ...s.piles, review: s.piles.review - fam.memberIds.length },
      done: { ...s.done, A: true },
    }
  }

  const escalate = (s: State): State => ({
    ...s,
    piles: {
      ...s.piles,
      review: s.piles.review - 1,
      withPartner: s.piles.withPartner + 1,
    },
  })

  /** The rule from A5: trust an unambiguous FINAL in the filename. */
  const applyTrustRule = (s: State): State => {
    if (!s.result) return s
    const trusting = classifyTrusting(s)
    const delta = s.result.counts.review - trusting
    return {
      ...s,
      trustFinal: true,
      piles: {
        ...s.piles,
        review: Math.max(0, s.piles.review - delta),
        ready: s.piles.ready + delta,
      },
    }
  }

  const roll = (s: State): State => {
    const seed = s.seed + 1
    return { ...s, seed, sample: drawSample(result, seed, s.demoted).ids }
  }

  const ensureSample = (s: State): State =>
    s.sample.length ? s : roll(s)

  /** Story B: the one the user caught. */
  const demoteSpotted = (s: State): State => {
    const spotted = s.sample.find((id) => weak.includes(id))
    if (!spotted || s.demoted.includes(spotted)) return s
    return {
      ...s,
      demoted: [...s.demoted, spotted],
      piles: {
        ...s.piles,
        ready: s.piles.ready - 1,
        unknown: s.piles.unknown + 1,
      },
    }
  }

  /** Story B: the rest, found by re-checking everything else. */
  const demoteRest = (s: State): State => {
    const rest = weak.filter((id) => !s.demoted.includes(id))
    if (!rest.length) return s
    return {
      ...s,
      demoted: [...s.demoted, ...rest],
      piles: {
        ...s.piles,
        ready: s.piles.ready - rest.length,
        unknown: s.piles.unknown + rest.length,
      },
    }
  }

  /* ---------------------------------------------------------------- */
  /* The convention step — before anything is renamed                 */
  /* ---------------------------------------------------------------- */

  /** Adopt a convention and re-render every proposed name under it. */
  const setConvention =
    (
      convention: Convention,
      via: State["conventionVia"],
      notes: string[] = []
    ) =>
    (s: State): State =>
      applyConvention(s, convention, via, notes)

  /**
   * Reached only when a story that has already been walked is asked for
   * again. A demo that replays records the same decision twice and shows the
   * same file as if it were new, which is worse than saying so.
   */
  function AlreadyDone() {
    const { done, piles, changes } = useAppState()
    const which = done.A && done.B ? "both of those" : "that one"
    return (
      <>
        <p>
          We&rsquo;ve already been through {which}.{" "}
          {changes.length > 0 && (
            <>
              <Spell n={changes.length} />{" "}
              {changes.length === 1 ? "decision is" : "decisions are"} recorded
              and still hold, so I&rsquo;m not going to run it again and write
              the same ones down twice.
            </>
          )}
        </p>
        <p className="mt-2">
          What&rsquo;s left is {piles.ready} ready to apply and {piles.review}{" "}
          still needing a decision.
        </p>
      </>
    )
  }

  const STORY_C: Beat[] = [
    {
      id: "c1",
      actor: "assistant",
      content: (
        <>
          <p>
            Before I rename anything - what should the names look like? This is
            the convention all {result.counts.total} files get held to, so it
            should be yours, not mine. Here&rsquo;s what I&rsquo;d suggest, from
            what&rsquo;s already in your filenames. Change any of it, or just
            tell me in your own words.
          </p>
          <ConventionCard />
        </>
      ),
      // Typing is the point of this step: whatever is written here gets read
      // as a convention rather than treated as agreement with mine.
      readsConvention: true,
      onFreeText: "c1custom",
      suggest:
        "Company name, then document type, then the year, separated by dashes - and leave the folders where they are.",
      chips: [
        {
          label: "Set this rule",
          next: "resume",
          primary: true,
          matchText: ACCEPT_WORDS,
        },
        {
          label: PRESETS[1]!.label,
          next: "c1set",
          effect: setConvention(PRESETS[1]!.convention, "preset"),
        },
        {
          label: PRESETS[2]!.label,
          next: "c1set",
          effect: setConvention(PRESETS[2]!.convention, "preset"),
        },
      ],
    },
    {
      id: "c1set",
      actor: "assistant",
      content: (
        <>
          <p>Set. Every proposed name in this session now reads like this:</p>
          <ConventionCard />
        </>
      ),
      readsConvention: true,
      onFreeText: "c1custom",
      suggest: "Actually, put the date first and use underscores.",
      chips: [
        {
          label: "Set this rule",
          next: "resume",
          primary: true,
          matchText: ACCEPT_WORDS,
        },
        {
          label: "Start over",
          next: "c1",
          matchText: ["start over", "start again", "never mind", "nevermind", "scrap that"],
          effect: setConvention(DEFAULT_CONVENTION, "default"),
        },
      ],
    },
    {
      id: "c1custom",
      actor: "assistant",
      content: (
        <>
          <p>Here&rsquo;s how I read that:</p>
          <ConventionCard />
        </>
      ),
      readsConvention: true,
      onFreeText: "c1custom",
      chips: [
        {
          label: "Set this rule",
          next: "resume",
          primary: true,
          matchText: ACCEPT_WORDS,
        },
        {
          label: "Start over",
          next: "c1",
          matchText: ["start over", "start again", "never mind", "nevermind", "scrap that"],
          effect: setConvention(DEFAULT_CONVENTION, "default"),
        },
      ],
    },
  ]

  /* ---------------------------------------------------------------- */
  /* Story A — one file, in depth                                     */
  /* ---------------------------------------------------------------- */

  const STORY_A: Beat[] = [
    {
      id: "a1",
      actor: "assistant",
      content: (
        <>
          <p>
            Here&rsquo;s the first one I need you to decide from the Needs
            Review pile.
          </p>
          {focus && <FileCard doc={focus} />}
        </>
      ),
      suggest:
        "Okay great, let's get started. I need more details on this file and why it needs review.",
    },
    {
      id: "a2",
      actor: "assistant",
      content: (
        <>
          <p>
            There are <Spell n={fam?.memberIds.length ?? 0} /> versions of this{" "}
            {fam?.docType} and <Spell n={fam?.largestIdenticalGroup ?? 0} />{" "}
            share identical text. The filename says FINAL_v2, but nothing in the
            contents confirms it was the one signed, so I&rsquo;d only be
            trusting whoever typed the filename.
          </p>
          {famKey && <VersionFamily result={result} familyKey={famKey} />}
        </>
      ),
      then: "a3",
    },
    {
      id: "a3",
      actor: "assistant",
      content: (
        <>
          <p>Here&rsquo;s what I&rsquo;d do and how sure I am:</p>
          {focus && <Proposal doc={focus} kept={1} />}
        </>
      ),
      suggest:
        "Yeah that's the right one, I remember this deal. Approve it and get rid of the other versions, we don't need four copies floating around.",
      chips: [
        { label: "Approve", next: "a4", primary: true },
        { label: "Reject", next: "a3r" },
        { label: "Escalate", next: "a3e" },
      ],
    },
    {
      id: "a3r",
      actor: "assistant",
      content: (
        <p>
          Rejected - left exactly as it was, nothing renamed. Do you want to
          send it to someone, or move on?
        </p>
      ),
      chips: [
        { label: "Actually, approve it", next: "a4", primary: true },
        { label: `Send it to ${PARTNER_FIRST_NAME}`, next: "a3e" },
      ],
    },
    {
      id: "a3e",
      actor: "assistant",
      content: (
        <p>
          Sent to {PARTNER}. It stays in the repository untouched until they
          answer, and it shows in the manifest as open rather than done.
        </p>
      ),
      effect: escalate,
      chips: [{ label: "Next one", next: "a5", primary: true }],
    },

    /* A4 — the point of Story A. */
    {
      id: "a4",
      actor: "assistant",
      content: (
        <p>
          Approved. I&rsquo;ll archive them rather than delete though - the
          other <Spell n={others.length} /> move to <ArchiveFolder />, each
          pointing at the copy you kept. If this turns out to be the wrong
          version it&rsquo;s reversible. Say the word if you genuinely want them
          gone.
        </p>
      ),
      suggest: "No that's fine, archive is better.",
      chips: [
        { label: "That's fine", next: "a5", primary: true },
        { label: "Show archive", next: "a4archive" },
        { label: "No, delete them", next: "a4b", tone: "destructive" },
      ],
    },
    {
      id: "a4archive",
      actor: "assistant",
      content: (
        <>
          <p>
            These <Spell n={others.length} /> move to <ArchiveFolder />. Each
            keeps its original name and points at the copy you kept.
          </p>
          {others.map((id) => {
            const d = result.byId[id]
            return d ? <FileCard key={id} doc={d} /> : null
          })}
        </>
      ),
      chips: [
        { label: "That's fine", next: "a5", primary: true },
        { label: "No, delete them", next: "a4b", tone: "destructive" },
      ],
    },
    {
      id: "a4b",
      actor: "assistant",
      content: (
        <p>
          I can&rsquo;t do that from here - this tool renames and moves, it
          doesn&rsquo;t delete, and I&rsquo;d rather it stayed that way while
          we&rsquo;re working through {result.counts.total} files on filename
          evidence. What I&rsquo;ll do instead is archive the {others.length}{" "}
          and flag them for deletion by whoever owns the repository, so
          it&rsquo;s one deliberate action by a person rather than a side effect
          of this conversation.
        </p>
      ),
      chips: [{ label: "That's fine", next: "a5", primary: true }],
    },
    {
      id: "a5",
      actor: "assistant",
      content: (
        <>
          <p className="flex items-start gap-2 font-medium text-primary">
            <Check className="mt-0.5 size-4 shrink-0" />
            <span>
              {focus?.proposedName} approved.{" "}
              <span className="capitalize">{spell(others.length)}</span>{" "}
              versions archived.
            </span>
          </p>
          <p className="mt-2">
            {Math.max(0, result.counts.review - (fam?.memberIds.length ?? 0))}{" "}
            more to go. Want the next one, or shall we do this by rule instead?
          </p>
        </>
      ),
      effect: confirmFamily,
      suggest: `Good. Now show me the ${result.counts.ready} that are ready to apply.`,
      chips: [
        { label: "Next one", next: "a1", primary: true },
        { label: `Show me all ${result.counts.review}`, next: "b1" },
        { label: "Set a rule", next: "a5rule" },
      ],
    },
    {
      id: "a5rule",
      actor: "assistant",
      content: <TrustRuleCopy result={result} />,
      effect: applyTrustRule,
      chips: [
        {
          label: `Show me all ${result.counts.ready}`,
          next: "b1",
          primary: true,
        },
        { label: "Next one", next: "a1" },
      ],
    },
  ]

  /* ---------------------------------------------------------------- */
  /* Story B — 132 at once, by sample                                 */
  /* ---------------------------------------------------------------- */

  // Which of the five sampled rows was the plant. drawSample always seeds
  // it into the sample, so the last one added to the sample is the spotted
  // file — read from state at render time since the sample itself is live.
  function SpottedCopy() {
    const { sample } = useAppState()
    const spottedId = sample.find((id) => weak.includes(id))
    return (
      <>
        <p>
          You&rsquo;re right, that one shouldn&rsquo;t be in this group.
          It&rsquo;s got a date and a type but no counterparty, so it belongs in
          the can&rsquo;t-identify pile. Moving it, and checking the other{" "}
          {result.counts.ready - 1} for the same mistake.
        </p>
        {spottedId && (
          <RuleCard
            id={spottedId}
            rule="New rule added - must have a company name"
          />
        )}
      </>
    )
  }

  function FoundMoreCopy() {
    return (
      <p className="mt-3 flex items-center gap-2 font-medium text-primary">
        <Plus className="size-4 shrink-0" />
        {moreFound === 0
          ? `Ready to apply is now ${readyAfterB}, can't identify is ${unknownAfterB}.`
          : `${moreFound} more found. Ready to apply is now ${readyAfterB}, can't identify is ${unknownAfterB}.`}
      </p>
    )
  }

  const STORY_B: Beat[] = [
    {
      id: "b1",
      actor: "assistant",
      content: (
        <p>
          I&rsquo;ve read all {result.counts.total} files and sorted them by how
          confident I am. How can I help you get through them?
        </p>
      ),
      suggest: `Okay let's start, what about the ${result.counts.ready} you said were fine? Let's review those.`,
      chips: [
        {
          label: `Start with the ${result.counts.ready}`,
          next: "b2",
          primary: true,
        },
        { label: `Review the ${result.counts.review}`, next: "a1" },
        { label: "Show me what you couldn't identify", next: "dashboard" },
      ],
    },
    {
      id: "b2",
      actor: "assistant",
      content: (
        <>
          <p>
            I can rename all {result.counts.ready} now. Before I do, here are
            five at random - if these look right, the other{" "}
            {result.counts.ready - 5} follow the same rules.
          </p>
          <SampleList />
        </>
      ),
      effect: ensureSample,
      suggest: "You found it, that fifth one hasn't got a company name on it.",
      chips: [
        // Hidden: gives free text and the pre-filled suggestion above a
        // correct destination without a visible pill for it.
        { label: "One is wrong", next: "b4", primary: true, style: "hidden" },
        { label: "Show me five more", next: "b2r" },
      ],
    },
    {
      id: "b2r",
      actor: "assistant",
      content: (
        <>
          <p>A different five, same rule:</p>
          <SampleList />
        </>
      ),
      effect: roll,
      suggest: "You found it, that fifth one hasn't got a company name on it.",
      chips: [
        { label: "One is wrong", next: "b4", primary: true, style: "hidden" },
        { label: "Show me five more", next: "b2r" },
      ],
    },
    {
      id: "b4",
      actor: "assistant",
      content: <SpottedCopy />,
      effect: demoteSpotted,
      then: "b5",
    },
    {
      id: "b5",
      actor: "assistant",
      content: <FoundMoreCopy />,
      effect: demoteRest,
      // The pre-filled line IS the escalation request — a presenter can just
      // press send, the way every other step works, rather than that being
      // something a button click quietly implies. Clicking "Approve"
      // produces the identical transcript line, so either path is honest
      // about what's about to happen.
      suggest:
        "Thank you, I'll approve all of them and send a copy to our partner, Sara Vitelli",
      chips: [
        { label: "Show me another five", next: "b2r" },
        {
          label: `Approve the ${readyAfterB}`,
          next: "b5escalate",
          primary: true,
          sayAs:
            "Thank you, I'll approve all of them and send a copy to our partner, Sara Vitelli",
        },
      ],
    },
    {
      id: "b5escalate",
      actor: "assistant",
      content: (
        <>
          <p>
            Sending them to {PARTNER}. She&rsquo;ll get all the files without a
            company name, {unknownAfterB} files, each with what I found and why
            I couldn&rsquo;t call it.
          </p>
          <p className="mt-3 flex items-center gap-2 font-medium text-ok">
            <Check className="size-4 shrink-0" />
            Sent to {PARTNER}
          </p>
        </>
      ),
      effect: (s) => ({ ...s, escalatedUnknown: allUnknownIds }),
      then: "b5rule",
      thenSay:
        "Also, don't trust FINAL at all. Everyone typed it on everything.",
    },
    {
      id: "b5rule",
      actor: "assistant",
      content: (
        <>
          <p>
            Applied as a rule and re-run. {finalRuleImpact.changedProposals}{" "}
            proposals changed. {finalRuleImpact.easier} of the status conflicts
            resolve cleanly - but {finalRuleImpact.affectedFamilies} version
            families now have no clear final at all, because FINAL was the only
            thing separating them.
          </p>
          <p className="mt-2">
            Your rule made {finalRuleImpact.easier} files easier and{" "}
            {finalRuleImpact.harder} files harder.
          </p>
          <p className="mt-3 flex items-center gap-2 text-[0.9375rem] font-medium text-primary">
            <Pencil className="size-4 shrink-0" />
            Ignore FINAL in filenames. Only treat a document as the signed
            version if the contents say so.
          </p>
        </>
      ),
      effect: (s) => ({
        ...s,
        finalRuleApplied: true,
        done: { ...s.done, B: true },
      }),
      suggest: "Good, apply everything and show me the manifest.",
      chips: [
        { label: "Apply everything", next: "manifest", primary: true },
        { label: "Show all rules", next: "b5rules" },
      ],
    },
    {
      id: "b5rules",
      actor: "assistant",
      content: (
        <p>
          One rule active right now:{" "}
          <span className="font-medium">Ignore FINAL in filenames</span> -
          affects {finalRuleImpact.changedProposals} files.
        </p>
      ),
      chips: [{ label: "Back", next: "b5rule" }],
    },
  ]

  /** Not part of either story: where a finished one sends you instead. */
  const AGAIN: Beat[] = [
    {
      id: "again",
      actor: "assistant",
      content: <AlreadyDone />,
      suggest: "Fine - apply everything and show me the manifest.",
      chips: [
        { label: "Apply everything", next: "manifest", primary: true },
        { label: "Back to the dashboard", next: "dashboard" },
      ],
    },
  ]

  const all: Story = {}
  for (const b of [...STORY_C, ...STORY_A, ...STORY_B, ...AGAIN]) all[b.id] = b
  return { STORY_C, STORY_A, STORY_B, all }
}

/* ------------------------------------------------------------------ */

function classifyTrusting(s: State): number {
  return classify(s.rows, { trustFinal: true, convention: s.convention }).counts
    .review
}

function TrustRuleCopy({ result }: { result: Classification }) {
  return (
    <p>
      Rule set: where a filename says FINAL and nothing in the family
      contradicts it, I&rsquo;ll treat that as the operative version instead of
      asking. That moves work out of Needs review, and it means you are trusting
      whoever typed the filename - which is the thing we just spent{" "}
      {result.counts.review > 0 ? "a file" : "time"} establishing you
      can&rsquo;t always do. You can turn it off in the manifest.
    </p>
  )
}

/**
 * "Apply everything": settle the remaining review pile. What the assistant can
 * resolve, it resolves and records; what needs a person stays open with the partner.
 * Nothing is invented here — both sets come out of the classification.
 */
export function applyEverything(result: Classification) {
  return (s: State): State => {
    const recorded = new Set(s.changes.map((c) => c.fileId))
    const demoted = new Set(s.demoted)
    const at = new Date()

    const pendingReady = result.docs.filter(
      (d) => d.bucket === "ready" && !recorded.has(d.id) && !demoted.has(d.id)
    )
    const pendingDecided = decided(result).filter((d) => !recorded.has(d.id))
    const open = escalated(result).filter((d) => !recorded.has(d.id))

    // Resolving a version family archives the copies it supersedes, the same
    // way Story A did for one family by hand.
    const archived = [
      ...s.archived,
      ...superseded(result)
        .map((d) => d.id)
        .filter((id) => !recorded.has(id)),
    ]

    return {
      ...s,
      archived,
      changes: [
        ...s.changes,
        ...pendingReady.map((d) =>
          changeFor(d, "Assistant", archived, at, s.convention.archive)
        ),
        ...pendingDecided.map((d) =>
          changeFor(d, APPROVER, archived, at, s.convention.archive)
        ),
      ],
      resolved: s.resolved + pendingReady.length + pendingDecided.length,
      piles: {
        ready: 0,
        review: 0,
        withPartner: s.piles.withPartner + open.length,
        unknown: s.piles.unknown,
      },
      done: { A: true, B: true },
    }
  }
}
