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
  escalated,
  superseded,
  weakestFive,
} from "@/lib/ledger"
import {
  AppliedSummary,
  ConventionCard,
  FileCard,
  Proposal,
  RuleCard,
  TriageBuckets,
  RuleMatches,
  VersionFamily,
  WeakestList,
} from "@/components/beats"
import { DEFAULT_CONVENTION, PRESETS, type Convention } from "@/lib/convention"
import { Pencil } from "lucide-react"
import { APPROVER, PARTNER, PARTNER_FIRST_NAME } from "@/lib/people"
import type { Beat, State, Story } from "./types"

const WORDS = [
  "no",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
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
  const finalRuleImpact = distrustFinalImpact(
    result.docs.map((d) => ({
      file_id: d.id,
      filename: d.filename,
      folder_path: d.folderPath,
      file_type: d.fileType,
      size_kb: d.sizeKb,
      date_modified: d.dateModified,
      content_excerpt: d.excerpt,
    })),
    result
  )

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

  /** Show one page of the worst-first ranking. No draw, no re-roll. */
  const showPage =
    (page: number) =>
    (s: State): State => ({
      ...s,
      samplePage: page,
      sample: weakestFive(result, page, s.demoted),
    })

  const nextPage = (s: State): State => showPage(s.samplePage + 1)(s)

  const ensureSample = (s: State): State =>
    s.sample.length ? s : showPage(0)(s)

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
    const { piles } = useAppState()
    return (
      <>
        <p>
          We&rsquo;ve already been through that one. Your decisions are recorded
          and still hold, so I&rsquo;m not going to run it again and write the
          same ones down twice.
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
          matchText: [
            "start over",
            "start again",
            "never mind",
            "nevermind",
            "scrap that",
          ],
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
          matchText: [
            "start over",
            "start again",
            "never mind",
            "nevermind",
            "scrap that",
          ],
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
  /* Story B — the whole Ready pile, worst evidence first              */
  /*                                                                   */
  /* Triage, then the weakest five, then two corrections: one caught   */
  /* in the sample and generalised into a rule, one said in plain      */
  /* English and reported back in both directions.                     */
  /* ---------------------------------------------------------------- */

  /**
   * The FINAL rule, applied. It moves no file between piles — that is the
   * finding, not an omission — so what it changes is what the manifest is
   * willing to claim about the families it orphaned.
   */
  const applyFinalRule = (s: State): State => ({
    ...s,
    finalRuleApplied: true,
    flaggedOrphans: finalRuleImpact.orphanFileIds,
    done: { ...s.done, B: true },
  })

  /**
   * Which of the five on screen the user caught. The ranking puts the worst
   * evidence first, so this is the top row of the list they were shown —
   * read from live state, because the list moves with [Show the next five].
   */
  function RuleAddedCopy() {
    return (
      <>
        <p>
          Nice one &mdash; I&rsquo;ll set that as a rule: the company name has
          to be in the filename, not read out of the document text. It&rsquo;s
          now stored in your rules and applied to all {result.counts.ready}.
        </p>
        <RuleCard
          id={weak[0]!}
          rule="New rule added - must have a company name"
        />
        <p className="mt-3">
          {weak.length} {weak.length === 1 ? "file" : "files"} move out of Ready
          to apply on it. None of them are renamed, and nothing is deleted:
        </p>
        <RuleMatches ids={weak} />
        <p className="mt-3 flex items-center gap-2 font-medium text-primary">
          <Plus className="size-4 shrink-0" />
          Ready to apply is now {readyAfterB}. Can&rsquo;t identify is{" "}
          {unknownAfterB}.
        </p>
      </>
    )
  }

  const STORY_B: Beat[] = [
    /* 1 — Triage. */
    {
      id: "b1",
      actor: "assistant",
      content: (
        <>
          <p>
            I&rsquo;ve read all {result.counts.total} files and sorted them by
            how confident I am. How can I help you get through them?
          </p>
          <TriageBuckets />
        </>
      ),
      suggest: `Okay let's start, what about the ${result.counts.ready} you said were fine? Let's review and approve those.`,
      chips: [
        {
          label: `We'll start with the ${result.counts.ready} ready to approve`,
          next: "b2",
          primary: true,
          style: "link",
        },
        { label: `Review the ${result.counts.review}`, next: "a1" },
        {
          label: `Show me the ${result.counts.unknown} you couldn't identify`,
          next: "dashboard",
        },
      ],
    },

    /* 2 — The weakest five, worst evidence first. */
    {
      id: "b2",
      actor: "assistant",
      content: (
        <>
          <p>
            I can rename all {result.counts.ready} now. Before I do, here are
            the five shakiest to give you a view &mdash; if these hold, the
            other {result.counts.ready - 5} follow the same rules. Let&rsquo;s
            create the first naming rule:
          </p>
          <WeakestList />
        </>
      ),
      effect: ensureSample,
      suggest:
        "Every file must have the company name in the filename - don't take it from the document text.",
      chips: [
        // Hidden: gives free text and the pre-filled suggestion above a
        // correct destination without a visible pill for it.
        { label: "One is wrong", next: "b4", primary: true, style: "hidden" },
        { label: "Show the next five", next: "b2r" },
      ],
    },
    {
      id: "b2r",
      actor: "assistant",
      content: (
        <>
          <p>
            The next five down the same list, less shaky than the ones above
            them:
          </p>
          <WeakestList />
        </>
      ),
      effect: nextPage,
      suggest:
        "Same rule - the company name has to be in the filename.",
      chips: [
        { label: "One is wrong", next: "b4", primary: true, style: "hidden" },
        { label: "Show the next five", next: "b2r" },
      ],
    },

    /* 3 — The rule the sample produced, stored and applied. */
    {
      id: "b4",
      actor: "assistant",
      content: <RuleAddedCopy />,
      effect: (s) => demoteRest(demoteSpotted(s)),
      // The pre-filled line IS the approval — a presenter can just press
      // send, the way every other step works. The chip says the same
      // sentence, so either path is honest about what it asks for.
      suggest:
        "Thank you, make the naming changes and approve all of them and send a copy to our partner, Sara Vitelli",
      chips: [
        {
          label: "Apply rule to documents found",
          next: "b5escalate",
          primary: true,
          sayAs:
            "Thank you, make the naming changes and approve all of them and send a copy to our partner, Sara Vitelli",
        },
        { label: "Show the next five", next: "b2r" },
      ],
    },
    {
      id: "b5escalate",
      actor: "assistant",
      content: (
        <>
          <p>
            Sending them to {PARTNER}. She&rsquo;ll get all the files without a
            company name, {unknownAfterB} files, each with what I found on it
            and the reason it needs a person.
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

    /* 4 — A rule in plain English, applied and re-run, both directions. */
    {
      id: "b5rule",
      actor: "assistant",
      content: (
        <>
          <p>
            Applied as a rule and re-run.{" "}
            {finalRuleImpact.changedProposals === 0
              ? "No proposed name changed - the version numbers were already carrying that."
              : `${finalRuleImpact.changedProposals} proposals changed.`}{" "}
            {finalRuleImpact.easier} of the status conflicts resolve cleanly
            &mdash; but {finalRuleImpact.orphanFamilies} version families now
            have no candidate at all, because FINAL was the only thing
            separating them.
          </p>
          <p className="mt-2">
            Those {finalRuleImpact.orphanFileIds.length} files keep their new
            names and each row reads{" "}
            <span className="italic">no signed copy identified</span> rather
            than naming one, so nothing is signed off on a word alone.
            I&rsquo;ve updated the piles, applied your new rule and resent it to{" "}
            {PARTNER}.
          </p>
          <p className="mt-3 flex items-center gap-2 text-[0.9375rem] font-medium text-primary">
            <Pencil className="size-4 shrink-0" />
            Ignore FINAL in filenames. Only treat a document as the signed
            version if the contents say so.
          </p>
        </>
      ),
      effect: applyFinalRule,
      suggest: "Good, apply everything and show me the manifest.",
      chips: [
        { label: "Apply everything", next: "b6", primary: true },
        { label: "Show all changed files", next: "dashboard" },
        { label: "Show all rules", next: "b5rules" },
      ],
    },
    {
      id: "b5rules",
      actor: "assistant",
      content: (
        <>
          <p>Two rules active, both of them yours:</p>
          <ul className="mt-2 space-y-2">
            <li className="flex items-start gap-2">
              <Pencil className="mt-1 size-3.5 shrink-0 text-primary" />
              <span>
                <span className="font-medium">
                  The filename has to name the company
                </span>{" "}
                &mdash; moved {weak.length} files out of Ready to apply.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <Pencil className="mt-1 size-3.5 shrink-0 text-primary" />
              <span>
                <span className="font-medium">Ignore FINAL in filenames</span>{" "}
                &mdash; {finalRuleImpact.easier} files clearer,{" "}
                {finalRuleImpact.harder} less certain.
              </span>
            </li>
          </ul>
        </>
      ),
      chips: [
        { label: "Apply everything", next: "b6", primary: true },
        { label: "Back", next: "b5rule" },
      ],
    },

    /* 5 — Both rules applied, and the record of what ran. */
    {
      id: "b6",
      actor: "assistant",
      content: (
        <>
          <p>
            Both rules applied and the renames are through. Every change
            records who approved it and when:
          </p>
          <AppliedSummary />
        </>
      ),
      effect: applyEverything(result),
      suggest: "Show me the manifest.",
      chips: [
        { label: "Show the manifest", next: "manifest", primary: true },
      ],
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
    // Step 5 applies the plan in the conversation, and opening the manifest
    // applies it again. Second time through there is nothing left to record,
    // and the pile handed to a person must not be counted twice.
    if (s.applied) return s
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
      applied: true,
    }
  }
}
