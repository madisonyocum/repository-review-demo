/**
 * The named people in the demo. Every approval in the manifest records one of
 * these, which is the point — "approved" with no name attached is not a record.
 */
export const APPROVER = "Brendan Walsh"

/** The partner work gets escalated to when a rename can't settle it. */
export const PARTNER = "Sara Vitelli"

export const PARTNER_FIRST_NAME = PARTNER.split(" ")[0]!

/** The approver's monogram, for the avatar. "Brendan Walsh" reads as "BW". */
export const APPROVER_INITIALS = APPROVER.split(/\s+/)
  .map((part) => part[0]!.toUpperCase())
  .join("")
