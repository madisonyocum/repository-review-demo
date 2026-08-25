/**
 * The rail as the design draws it: a repository somebody has already been
 * working in, not a blank panel waiting for the demo to start.
 *
 * These rows are decoration and nothing else. They are never in `state.changes`,
 * so they can't reach the manifest, the ledger or any count — real changes push
 * them down the list as they're made, and the six most recent rows show.
 */
import type { HistoryKind } from "./history"
import { APPROVER, PARTNER } from "./people"

/** A third reviewer, from the design. Only ever appears in these rows. */
const COLLEAGUE = "Calum Whitcombe"

export interface SeededChange {
  name: string
  kind: HistoryKind
  by: string
  /** Written out rather than computed — these have no real timestamp. */
  when: string
}

export const SEEDED_HISTORY: SeededChange[] = [
  {
    name: "CorvusData_Lease_2024-02-11_v2.pdf",
    kind: "approved",
    by: PARTNER,
    when: "2 hours ago",
  },
  {
    // The design shows the Pinnacle MSA here. Story A approves that exact
    // file, so this row uses a different one — the same shape, without the
    // rail claiming a file was settled twice.
    name: "GreymoorLogistics_Lease_2024-09-21.pdf",
    kind: "approved",
    by: APPROVER,
    when: "3 hours ago",
  },
  {
    name: "AshworthTextiles_Employment_2022-01.pdf",
    kind: "renamed",
    by: COLLEAGUE,
    when: "1 day ago",
  },
  {
    name: "Vantage SOW FINAL_v2.doc",
    kind: "rejected",
    by: APPROVER,
    when: "1 day ago",
  },
  {
    name: "CrestlineMedia_NDA_2025-07-06.pdf",
    kind: "escalated",
    by: PARTNER,
    when: "1 day ago",
  },
  {
    name: "Mutual NDA copy 04-05-20.doc",
    kind: "unchanged",
    by: "",
    when: "2 days ago",
  },
]
