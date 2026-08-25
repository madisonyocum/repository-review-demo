# Repository Review — demo prototype

A single-screen prototype of a contract repository clean-up assistant, built
from the Figma file. Demo-grade: no backend, no API calls, no live inference.

```bash
pnpm install
pnpm --filter web dev     # http://localhost:5173
pnpm --filter web test    # 20 unit tests
pnpm build
```

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

## The two storylines

`src/state/stories.tsx` models both as data — a map of beats with content,
chips, and an effect on state. Advancing means clicking a chip or typing
anything; **free text always advances**, following the beat's primary chip, so
unexpected input can't strand the demo.

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
--ok:   oklch(0.52 0.10 158);
--warn: oklch(0.62 0.12 76);
```

`--destructive` is the third state. `--primary` is used on primary actions and
the selected-tab indicator. Elevation is tokenised too (`--shadow-card`,
`--shadow-raised`, applied through the `surface` utility), so no colour or
shadow literal appears outside this file.
