# Repository Review

**Live demo:** https://madisonyocum.github.io/repository-review-demo/ — nothing to
install, click *Use the sample repository*.
**Source:** https://github.com/madisonyocum/repository-review-demo

## What this is

A legal team keeps 220 contracts in a shared drive and the filenames have stopped
meaning anything: `final-v2 copy.docx`, `Vantage SOW FINAL_v2.doc`, four versions
of one agreement with byte-identical text, a scan nobody can read. Somewhere in
there is the version that was actually signed, and no one can say which.

This is a working prototype of an assistant that reads that repository, sorts
every file into three piles by how sure it is, and then talks a person through
the ones it can't settle on its own. It renames and it moves. It never deletes.

Prototype, not product: one screen, no backend, and a bundled 220-row CSV
standing in for the drive. It is built from the Figma file and meant to be
clicked through, not deployed.

## Try it in a minute

1. Open the live demo and press **Use the sample repository**. The three piles
   fill in — 132 ready to apply, 76 needing review, 12 it can't identify.
2. Press **Review the 76** (one file in depth) or **Review the 132** (a whole
   pile, by sample). Either way the assistant asks what the new filenames should
   look like *before* it touches anything — take its suggestion, pick a preset,
   or type a convention in your own words.
3. Follow the conversation. Buttons and free text both move it along; you can't
   get it stuck.
4. It ends at **Apply everything** → a manifest of all 220 files, with a real
   CSV to download.

Everything you can click is live. The counts, the random sample, the manifest
arithmetic and the CSV are all computed from the data in the browser — there is
no scripted screen recording behind any of it.

## What's worth looking at

- **The convention is the user's, not the product's.** The demo never assumes a
  naming scheme. It proposes one, shows it rendered on a real file, and waits.
- **It won't delete.** Asked directly to delete three superseded copies, it
  archives them instead and explains why that's reversible — and pressing *No,
  delete them* still doesn't delete them.
- **It shows what a rule costs.** Say "don't trust FINAL" and it re-runs the
  whole classification and reports both sides: how many files got easier, how
  many got harder.
- **It admits what it can't do.** The demo deliberately ends with 19 files still
  unresolved and named as somebody's problem, rather than a clean zero.

Full detail on all of it below.

## Running it locally

```bash
pnpm install
pnpm --filter web dev     # http://localhost:5173
pnpm --filter web test    # 30 unit tests
pnpm build

# Optional: let Claude read a typed naming convention instead of the local
# reader. Without it the demo behaves identically, and says which one answered.
echo 'VITE_ANTHROPIC_API_KEY=sk-ant-...' > apps/web/.env.local

# Deploy to GitHub Pages (rebuilds with the /repository-review-demo/ base path
# baked in, then force-pushes apps/web/build/client to the gh-pages branch)
GH_PAGES=1 pnpm --filter web build
```

## The convention is the user's

The brief deliberately doesn't say what the target naming scheme or folder
structure should be, so the product doesn't decide either. The conversation
opens on it — before any file is renamed — and nothing is applied until it's
confirmed:

```
Pattern      Counterparty_Type_Date.ext
Folders      filed by document type
Superseded   /Archive

PINNACLE_INSURANCE-Master Services Agreement-FINAL_v2-2018.pdf
  → PinnacleInsurance_MSA_2018-02-21.pdf   /Legal/Contracts/Master Agreements
```

Three buttons for the common answers, or type it: *"company name, then document
type, then the year, separated by dashes — and leave the folders where they
are"* gives `Counterparty-Type-Date.ext`, folders untouched. `lib/convention.ts`
holds the whole vocabulary — which parts appear and in what order, the
separator, the date format, the casing, where files are filed, where superseded
copies go — and `classify()` takes it as an option. So the naming scheme is data,
not code: **every proposed name on screen, in the rail and in the manifest CSV is
rendered from it**, and the earlier turns of the transcript keep showing what
they were shown under rather than restating the latest decision.

A convention changes what a file is *called*, never what is known about it, so
the three pile counts are identical under any of them. That invariant is a unit
test.

## The one live inference path

`lib/llm.ts` sends the typed sentence to `claude-opus-5` through the official
`@anthropic-ai/sdk`, as a strict tool call whose schema is the `Convention`
type, and validates what comes back before it reaches state. The SDK is loaded
with a dynamic import, so with no key it never enters the bundle.

With no key configured — which is how the public build ships —
`parseConventionLocally` does the same job in the browser: it looks for the
words people actually use and takes the order they appear in as the order of the
name. It is also the fallback if the call fails. The card says which one
answered, in as many words: *"Read from what you typed, here in the browser · no
API key configured."*

Nothing else in the product calls a model. The counts, the piles, the sample,
the manifest and the two what-if rules are all pure functions over the CSV, and
that is deliberate — a demo whose numbers come out of an LLM can't be checked
against the data, and these can.

## The counts are real

`src/lib/classify.ts` is a pure, deterministic function over the 220-row CSV.
Every number on screen comes out of it; nothing is typed in. It logs the whole
result object to the console on load.

Two rules decide the piles:

| Pile | Rule | Count |
| --- | --- | --- |
| **Can't identify** | No counterparty in the filename *or* the contents | 12 |
| **Needs review** | The name carries a staleness marker (`old` / `copy` / `backup`), **or** the version family holds two or more files with identical contents — so the name alone can't say which is operative | 76 |
| **Ready to apply** | Everything else | 132 |

Counterparty and document type are read from the filename first, then the
content excerpt. Two false positives are guarded and unit-tested: **"PLEASE
READ" is not a lease** (word boundaries on the type patterns) and **"Harbour
View" is not Harbourline Shipping** (separator-tolerant matching that must
still start on a non-alphanumeric boundary — `\b` is wrong, because `_` is a
regex word character and `DRAFT_HALDEN_&_CO` has to match).

Story A's subject is derived, not chosen: the only family with four versions of
which exactly three share identical text. On this data that is the Pinnacle
Insurance MSA, whose `FINAL_v2` filename the contents don't confirm.

## The chat behaves like a chat

Each turn holds behind a spinner above the composer before it lands — most come
back quickly, and roughly one in three takes noticeably longer, derived from the
turn's own timestamp so a step back with Undo replays the same pause. Reading a
convention shows the same indicator for as long as it actually takes, labelled
*Reading your convention…*. The scripted reply for the next turn only appears in
the composer once the answer has arrived.

Chips are live controls, not a record: once the conversation moves past a turn
its buttons are simply gone. What was chosen is already in the transcript as the
user's own line.

Each storyline is walked once. Asking for a finished one again — the [Next one]
chip, or its dashboard tile — lands on a beat that says so and offers what's
actually left, rather than replaying the same file and recording the same
decisions twice.

## The two storylines

`src/state/stories.tsx` models both as data — a map of beats with content,
chips, and an effect on state. Advancing means clicking a chip or typing
anything; **free text always advances**, following the beat's primary chip (or
`onFreeText`, where what was typed is the point — that's how the convention step
reads a sentence instead of taking it as agreement), so unexpected input can't
strand the demo.

- **Story A** — one file in depth. A4 is the point: asked to delete the other
  three versions, the assistant archives instead and explains why it's
  reversible. Pressing "No, delete them" does not get them deleted.
- **Story B** — 132 at once, by sample. Five drawn at random, one of which is a
  file whose counterparty was inferred from the document text rather than the
  filename. Catching it demotes that file and re-checks the rest, which finds
  six more. The sample is stratified (four clean + one weak, both drawn at
  random) and re-rolls independently, so "Show me five more" really does return
  a different five.

## The ending

`[Apply everything]` reaches the manifest. Every figure there is counted off the
manifest rows themselves, so the ledger can only add up to 220:

```
125  renamed from their own contents
 57  renamed after your decisions
     of which 22 superseded copies moved to /Archive
 19  with Sara, still open
 19  left exactly as they were
```

Those figures are the default convention's. Choosing "keep my folders" makes
most of the actions `rename` rather than `rename+move`, and the archive line
names whichever folder was chosen — the ledger is counted off the rows either
way, so it still adds up to 220.

`[Download the manifest]` writes a real CSV — one row per file including the
no-action rows, with `file_id, old_name, new_name, old_path, new_path, action,
reason, approved_by, approved_at`. `[Undo everything]` returns to the dashboard;
the toolbar Undo steps back one beat at a time, repeatedly.

The left rail ends at Ready 0, Needs review 0, Can't identify 19 — the last one
deliberately not zeroed. The 19 still open with Sara are carried in the manifest
rather than the rail, so the ledger still says the work isn't finished.

## Design tokens

`packages/ui/src/styles/globals.css` is the shadcn preset with the `.dark` block
removed (the product is light only) and two state colours added. The preset's
chart ramp is five shades of one blue, so the three states would otherwise be
indistinguishable:

```css
--ok:   #1da05f;
--warn: #c2651a;
```

`--destructive` is the third state. `--primary` is used on primary actions and
the selected-tab indicator. The Latest changes rail uses four marks, as in the
design: a green (`--ok`) check for anything settled, a blue pencil for anything
the assistant wrote or deliberately left alone, a red cross for a rejection, a
blue arrow for work handed to a person. Elevation is tokenised too (`--shadow-card`,
`--shadow-raised`, applied through the `surface` utility), so no colour or
shadow literal appears outside this file.

**Inter** for text, with headings differing from body text by weight alone.
Every number in the product goes through one `numeric` utility — `--font-numeric`
plus `tabular-nums lining-nums` — so a column of them lines up, an animated
count doesn't shuffle its own digits as it runs, and no number anywhere is in a
different face from any other. `--font-numeric` asks for **Google Sans** first,
which is picked up on any machine that already has it; it is proprietary and
can't be shipped from here, so the bundled figure face is **DM Sans** — open
licence, and the nearest geometric to Google Sans's own numerals. Filenames are the exception, set in the default monospace
stack, because a name is read character by character rather than as prose.
