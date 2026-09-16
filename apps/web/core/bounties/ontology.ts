import { ContentIds, SystemIds } from '@geoprotocol/geo-sdk/lite';

/**
 * GRC-20 ontology for bounties: paid curation work published as entities in a
 * DAO space, worked by curators, reviewed and paid out in points by editors.
 *
 * Every id here is a canonical geo-sdk id, verified byte-equal to the set
 * curator-app publishes and reads (its `packages/curator-utils/src/ids.ts`).
 * Only re-export from `SystemIds`/`ContentIds`; never hardcode a second copy,
 * so the two apps can never drift. The type/property declarations were
 * published on TESTNET by curator-app's bootstrap scripts — nothing needs
 * publishing for geogenesis to interoperate.
 *
 * UI and data code must import bounty ids from this module, not from
 * `~/core/constants` (whose BOUNTY_* names predate it and are kept only for
 * the existing bounty-linking code).
 */

/** Bounty (TYPE) — the unit of paid curation work, owned by a DAO space. */
export const BOUNTY_TYPE_ID = SystemIds.BOUNTY_TYPE; // 808af0ba…

/** Description (TEXT). The canonical description property, not bounty-specific. */
export const BOUNTY_DESCRIPTION_PROPERTY_ID = SystemIds.DESCRIPTION_PROPERTY; // 9b1f76ff…

/** Bounty Budget (FLOAT) — the points budget, named "Reward" in the SDK. */
export const BOUNTY_BUDGET_PROPERTY_ID = SystemIds.REWARD_PROPERTY; // 9ece325c…

/** Max Contributors (FLOAT). */
export const BOUNTY_MAX_CONTRIBUTORS_PROPERTY_ID = SystemIds.MAX_CONTRIBUTORS_PROPERTY; // 1d7bb89e…

/** Max Submissions Per Person (FLOAT). */
export const BOUNTY_MAX_SUBMISSIONS_PER_PERSON_PROPERTY_ID = SystemIds.MAX_SUBMISSIONS_PER_PERSON_PROPERTY; // 21c06b6d…

/** Submission Deadline (DATETIME) — "Active until"; Active/Ended is derived from it. */
export const BOUNTY_DEADLINE_PROPERTY_ID = SystemIds.ACTIVE_UNTIL_PROPERTY; // 7566286c…

/** Skills (RELATION → Skill) — shared with Person.skills, so they are directly comparable. */
export const BOUNTY_SKILLS_PROPERTY_ID = ContentIds.SKILLS_PROPERTY; // a38732e3…

/**
 * Creator (RELATION → Person). Deprecated in the SDK, but curator-app still
 * writes and displays it — keep writing it for interop parity.
 */
export const BOUNTY_CREATOR_PROPERTY_ID = SystemIds.CREATOR_PROPERTY; // e200041d…

/** Maintainer (RELATION → Person, multiple) — contacts surfaced in allocation emails. */
export const BOUNTY_MAINTAINER_PROPERTY_ID = SystemIds.MAINTAINER_PROPERTY; // 0693e377…

// -- Difficulty -------------------------------------------------------------

/** Difficulty (RELATION → one of exactly three Difficulty entities). */
export const BOUNTY_DIFFICULTY_PROPERTY_ID = SystemIds.DIFFICULTY_PROPERTY; // 8c8405ab…
export const DIFFICULTY_TYPE_ID = SystemIds.DIFFICULTY_TYPE; // 0ef12e0d…
export const EASY_DIFFICULTY_ID = SystemIds.EASY_DIFFICULTY; // 6ce89cfc…
export const MEDIUM_DIFFICULTY_ID = SystemIds.MEDIUM_DIFFICULTY; // 74a88abe…
export const HARD_DIFFICULTY_ID = SystemIds.HARD_DIFFICULTY; // 80daec57…

// -- Workflow status ----------------------------------------------------------

/**
 * Workflow Status (RELATION → one of exactly six Bounty Task Status entities).
 * A bounty with no status relation is treated as Backlog. Note: this is
 * distinct from the generic "Status" property (f54a8163…), which is not part
 * of the bounty ontology despite the old BOUNTY_STATUS_PROPERTY_ID name that
 * used to sit in ~/core/constants.
 */
export const BOUNTY_TASK_STATUS_PROPERTY_ID = SystemIds.BOUNTY_TASK_STATUS_PROPERTY; // 054a7993…
export const BOUNTY_TASK_STATUS_TYPE_ID = SystemIds.BOUNTY_TASK_STATUS_TYPE; // b69f2e11…
export const BOUNTY_STATUS_BACKLOG_ID = SystemIds.BOUNTY_STATUS_BACKLOG; // ee3dd49a…
export const BOUNTY_STATUS_TODO_ID = SystemIds.BOUNTY_STATUS_TODO; // 76b5b831…
export const BOUNTY_STATUS_IN_PROGRESS_ID = SystemIds.BOUNTY_STATUS_IN_PROGRESS; // 548fca08…
export const BOUNTY_STATUS_IN_REVIEW_ID = SystemIds.BOUNTY_STATUS_IN_REVIEW; // 16f54362…
export const BOUNTY_STATUS_DONE_ID = SystemIds.BOUNTY_STATUS_DONE; // 425f3e80…
export const BOUNTY_STATUS_CANCELLED_ID = SystemIds.BOUNTY_STATUS_CANCELLED; // 0fb6253b…

// -- Interest / allocation ----------------------------------------------------

/**
 * Interested In (RELATION personal-space system entity → Bounty). Authored
 * into the CURATOR'S PERSONAL space with toSpaceId = the bounty's DAO space.
 * Legacy testnet rows use the person entity and omit toSpaceId; readers stay
 * dual-shape. Read via cross-space backlinks on the bounty (filter by
 * toEntityId + typeId, no space filter).
 */
export const INTERESTED_IN_BOUNTY_PROPERTY_ID = SystemIds.INTERESTED_IN_PROPERTY; // ff7e1b44…

/**
 * Allocated (RELATION Bounty → personal-space system entity), authored into
 * the bounty's DAO space by an editor. Legacy rows target the person entity;
 * readers accept both (see buildBountyAllocationTargets).
 */
export const BOUNTY_ALLOCATED_PROPERTY_ID = SystemIds.ALLOCATE_PROPERTY; // cfeb6422…

/**
 * Submission link (RELATION Proposal → Bounty) — a governance proposal
 * counting toward a bounty. Same id as BOUNTIES_RELATION_TYPE in
 * ~/core/constants (the review-flow bounty linking writes it).
 */
export const BOUNTY_SUBMISSION_PROPERTY_ID = SystemIds.SUBMISSION_PROPERTY; // 3b4c516f…

// -- Payout -------------------------------------------------------------------

/**
 * Payout (TYPE) — a relation-entity on a space —Payout Recipient→ person
 * relation, carrying the points amount and links to the bounty and the paid
 * proposals. The shape must stay byte-compatible with curator-app's
 * `create-payout.ts` or its readers miss geogenesis-authored payouts.
 */
export const PAYOUT_TYPE_ID = SystemIds.PAYOUT_TYPE; // f5132deb…
export const PAYOUT_AMOUNT_PROPERTY_ID = SystemIds.PAYOUT_AMOUNT_PROPERTY; // 82fe45a3… (DECIMAL, whole points)
export const PAYOUT_RECIPIENT_PROPERTY_ID = SystemIds.PAYOUT_RECIPIENT_PROPERTY; // fddacaae…
export const PAYOUT_BOUNTY_PROPERTY_ID = SystemIds.PAYOUT_BOUNTY_PROPERTY; // 1b595a8b…

/**
 * Proposals (RELATION → Proposal) — shared by Payout AND Bounty review
 * entities (SDK exports it under both names; same id). Readers must
 * disambiguate by the from-entity's type.
 */
export const PAYOUT_PROPOSALS_PROPERTY_ID = SystemIds.PAYOUT_SUBMISSION_PROPERTY; // 8128964c…
export const REVIEW_PROPOSALS_PROPERTY_ID = SystemIds.PROPOSALS_PROPERTY; // 8128964c… (same id)

// -- Bounty review --------------------------------------------------------------

/** Bounty review (TYPE) — published into the REVIEWER'S personal space. */
export const BOUNTY_REVIEW_TYPE_ID = SystemIds.BOUNTY_REVIEW_TYPE; // 36efe3dc…
export const REVIEW_PASS_PROPERTY_ID = SystemIds.PASS_PROPERTY; // 88cb2cbe… (BOOLEAN)
/** Review comment — the canonical markdown-content property, not review-specific. */
export const REVIEW_COMMENT_PROPERTY_ID = SystemIds.MARKDOWN_CONTENT; // e3e363d1…
/** Ratings are FLOATs stored normalized to 0..1 (the UI's 1–5 stars ÷ 5). */
export const REVIEW_COMPLETENESS_RATING_PROPERTY_ID = SystemIds.COMPLETENESS_RATING_PROPERTY; // a6183aad…
export const REVIEW_ACCURACY_RATING_PROPERTY_ID = SystemIds.ACCURACY_RATING_PROPERTY; // 6858ea8c…
export const REVIEW_SKILL_RATING_PROPERTY_ID = SystemIds.SKILL_RATING_PROPERTY; // 0db7b663…
export const REVIEW_EFFORT_RATING_PROPERTY_ID = SystemIds.EFFORT_RATING_PROPERTY; // 3c83be2a…
