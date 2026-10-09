import { ContentIds, SystemIds } from '@geoprotocol/geo-sdk/lite';

import { KEY_FRAME_IMAGE_PROPERTY, OG_IMAGE_PROPERTY } from '~/core/constants';

/**
 * GRC-20 ontology for publishing a finished debate to the knowledge graph.
 *
 * IDs come from the "Debates ontology" spec. Where the spec reuses a canonical
 * geo-sdk id we re-export it from `SystemIds`/`ContentIds` (verified equal) rather
 * than hard-coding a second copy, so the two never drift.
 */

/** Debate (TYPE) — the top-level entity a published debate becomes. */
export const DEBATE_TYPE_ID = 'fd51f93520634617be397b672b23364c';

/**
 * The entity a `Tags` relation points at to mark a Claim as one meant for debating (GEO-2771).
 *
 * Curation rather than a property on the claim, which is what lets the debates surfaces ask the
 * graph for their whole corpus in one query: a few hundred tagged claims out of three hundred
 * thousand, so the tag is what gets asked for and the claims come back with it.
 *
 * It also narrows the debate-again picker's Related claims source, which offers a claim as
 * something to debate next. The claim page's Related claims gallery is deliberately *not* narrowed
 * by it — that gallery is a way out of the page rather than an invitation to a debate (GEO-2758).
 */
export const DEBATE_TAG_ID = '55c95b2626f8482cb9739ea99dfde438';

/** Transcript (TYPE) — holds the per-turn text blocks of a debate. */
export const TRANSCRIPT_TYPE_ID = '97042e6d9c7b4db5930c43d48debda84';

/** Debates page (TYPE) — the "All debates" landing page a Recent debates block links to. */
export const DEBATES_PAGE_TYPE_ID = 'dec3c8cae071482394f1dc4de11e7fb6';

/** Debate videos (RELATION) → Video. */
export const DEBATE_VIDEOS_PROPERTY_ID = 'c48dc314fa7148aeb967139160456f1d';

/** Claims (RELATION) → Claim. The claim the debate argued for/against. */
export const DEBATE_CLAIMS_PROPERTY_ID = 'e614cce1c4ce45868304fd1237119eb2';

/**
 * A claim's stance toward another claim (GEO-3142): Supports / Opposes / Addresses (RELATION)
 * → Claim. The debate publisher writes exactly one of these from every claim extracted from a
 * debate to the debate's motion, judged by the extractor on what the claim says rather than on
 * which side its speaker argued. Addresses means "on the subject, but a reason neither way".
 * The 108 debates published before 2 Oct 2026 got theirs from a one-off backfill bot.
 */
export const CLAIM_SUPPORTS_PROPERTY_ID = '81faa4adafad4009b1061374c1219f04';
export const CLAIM_OPPOSES_PROPERTY_ID = '71d1bcd5f1cf487fb9a3c7b1d53803eb';
export const CLAIM_ADDRESSES_PROPERTY_ID = '7115a43dcac347b8b036aa113c6ad1b0';

/** Transcripts (RELATION) → Transcript. */
export const DEBATE_TRANSCRIPTS_PROPERTY_ID = 'c504c7d5c3374016a5f083e4b5a92911';

/**
 * The debate entity's social share card, generated once at publish time (GEO-2755).
 *
 * Re-exported rather than a second literal, per the note above: the same property now heads the
 * share-image chain every entity page reads (GEO-2782), so the id has a home outside this ontology
 * and the two must not drift.
 */
export const OG_IMAGE_PROPERTY_ID = OG_IMAGE_PROPERTY;

/** Key frame (RELATION) → Image. The still the app shows as a video's poster. */
export const KEY_FRAME_IMAGE_PROPERTY_ID = KEY_FRAME_IMAGE_PROPERTY;

/** Supported by (RELATION) → participant space entity arguing "yes". */
export const DEBATE_SUPPORTED_BY_PROPERTY_ID = 'd19fad5651364a7f8309daf5c7bf99dd';
/** Opposed by (RELATION) → participant space entity arguing "no". */
export const DEBATE_OPPOSED_BY_PROPERTY_ID = 'c57de77c3eee4e7ba0d2258d18aab11c';

/**
 * Participants (RELATION) → both participants, regardless of side.
 *
 * Supported by / Opposed by already name everyone in a debate, but they answer "who argued which
 * way" and so cannot be filtered as one set: a data block of "debates I was in" would have to union
 * two relations and know which side to look on. This is the side-agnostic membership.
 *
 * `SystemIds.PARTICIPANTS_PROPERTY` rather than a debates-specific id, deliberately — a query for
 * the canonical property finds these debates alongside anything else that uses it, which is the
 * point of a shared ontology. A private id would have needed every consumer to learn about it.
 */
export const DEBATE_PARTICIPANTS_PROPERTY_ID = SystemIds.PARTICIPANTS_PROPERTY; // 0b9b1a35…

/**
 * Vote (TYPE) — one viewer's pick of who won a debate. Lives in the voter's personal
 * space and is auto-published there, the same way comments are.
 */
export const VOTE_TYPE_ID = '4e7fde53712f4e489e83e7f4e15de964';

/** Debates (RELATION) → Debate. Which debate a Vote is about. */
export const VOTE_DEBATES_PROPERTY_ID = 'b96bf701a399430da072f5e910cdeda9';

/** Vote (RELATION) → the chosen winner's personal-space system entity. */
export const VOTE_WINNER_PROPERTY_ID = 'bcbbc60a72fd433d841725ce62ce85f5';

/** Canonical geo-sdk ids reused by the debate ontology (verified equal to the spec). */
export const NAME_PROPERTY_ID = SystemIds.NAME_PROPERTY; // a126ca53…
export const TYPES_PROPERTY_ID = SystemIds.TYPES_PROPERTY; // 8f151ba4…
export const VIDEO_TYPE_ID = SystemIds.VIDEO_TYPE; // d7a4817c… (matches spec)
export const VIDEO_URL_PROPERTY_ID = SystemIds.VIDEO_URL_PROPERTY; // 33da2ef5…
export const IMAGE_TYPE_ID = SystemIds.IMAGE_TYPE; // ba4e4146…
/**
 * The unified IPFS URL property. Despite the name it carries the `ipfs://` URI for Video entities
 * as well as Images. Media resolution reads this property first.
 */
export const IMAGE_URL_PROPERTY_ID = SystemIds.IMAGE_URL_PROPERTY; // 8a743832…
/**
 * The canonical link property ("Web URL"). Debate media entities carry their durable geo-chat
 * content URL here instead of an IPFS pin. It is also a general-purpose link, so it is only read
 * as a media URL on entities already typed Image/Video, and never promotes a renderable type.
 */
export const WEB_URL_PROPERTY_ID = ContentIds.WEB_URL_PROPERTY; // 412ff593…
export const BLOCKS_PROPERTY_ID = SystemIds.BLOCKS; // beaba5cb…
export const TEXT_BLOCK_TYPE_ID = SystemIds.TEXT_BLOCK; // 76474f2f…
export const MARKDOWN_CONTENT_PROPERTY_ID = SystemIds.MARKDOWN_CONTENT; // e3e363d1… (matches spec)
export const AUTHORS_PROPERTY_ID = '91a9e2f6e51a48f7997661de8561b690'; // ContentIds.AUTHORS_PROPERTY (matches spec)
export const SOURCES_PROPERTY_ID = '49c5d5e1679a4dbdbfd33f618f227c94'; // ContentIds.SOURCES_PROPERTY (matches spec)

/**
 * When a claim was said, in milliseconds from the start of the debate timeline — the same origin
 * the player's scrubber and `turn_durations_ms` use.
 *
 * These live on the *relation entity* of the transcript block → claim relation, not on the claim:
 * one claim can be stated in two different turns, and each statement has its own moment. The
 * relation entity is also typed `Selector` and pointed at `Debate videos`, which is the graph's
 * existing shape for "this relation points at a span of its target" — the same one `Reply to` uses
 * to anchor a comment to a range of text.
 *
 * Both properties already existed in the Geo ontology space, unused, declared as Integer. Nothing
 * was minted for this. Note the API serialises Integer values as strings.
 */
export const CLAIM_START_OFFSET_PROPERTY_ID = 'a1d1cb557b184238ba0ec78ba7f289fb';
export const CLAIM_END_OFFSET_PROPERTY_ID = '79a677b597f84ca8a1cf24eef7837b61';

/**
 * How much a claim carries its debate: the probability, judged by extraction-api's
 * `claims.score_highlights` over the whole transcript, that the debate's claim list would
 * misrepresent the debate without it. 0–1, compared within one debate; the player uses it to
 * show the few claims that matter rather than every one.
 *
 * Lives on the same block → claim relation entity as the offsets, for the same reason: it is a
 * fact about this claim *in this debate*, and a claim reused across debates can carry a
 * different score in each. Float, in the Geo root space; created by Preston on 2026-10-02 as
 * "Quality score" and renamed "Highlight score" on 2026-10-05.
 */
export const CLAIM_HIGHLIGHT_SCORE_PROPERTY_ID = '580ba596988144a79716cd38a891319b';

/**
 * The three axis scores `claims.score_highlights` returns in the same request as the highlight
 * score, each a position on a four-level scale from 0 to 1: how directly the claim bears on the
 * debated claim (Relevance), whether it stands as a faithful, single, self-contained statement
 * (Quality), and how likely a general audience is to split on it (Controversy). Written on the
 * same block → claim relation entity as the highlight score, for the same reason, and like it
 * compared within one debate rather than against a fixed cut-off. Float, in the Geo root space;
 * created on 2026-10-09.
 */
export const CLAIM_RELEVANCE_SCORE_PROPERTY_ID = '3bce8adfccf14579b7dc2e736a30f1a1';
export const CLAIM_QUALITY_SCORE_PROPERTY_ID = '8f766c854dce400d97101b5aa3850382';
export const CLAIM_CONTROVERSY_SCORE_PROPERTY_ID = '5d32dba2b7a64da3a754e10f0bdc021b';

/** The axis score properties with the `DebateClaimInput` / `TranscriptClaim` field each feeds. */
export const CLAIM_AXIS_SCORE_PROPERTY_IDS = {
  relevanceScore: CLAIM_RELEVANCE_SCORE_PROPERTY_ID,
  qualityScore: CLAIM_QUALITY_SCORE_PROPERTY_ID,
  controversyScore: CLAIM_CONTROVERSY_SCORE_PROPERTY_ID,
} as const;

export type ClaimAxisScoreField = keyof typeof CLAIM_AXIS_SCORE_PROPERTY_IDS;

/**
 * The typing that says a relation points at a *span* of its target rather than the whole of it.
 *
 * A relation entity carrying offsets is typed `Selector` and given a `Target property` naming the
 * property the span is measured in — `Debate videos` here, the same shape `Reply to` uses to anchor
 * a comment to a range of text. Both existed in the Geo ontology space already.
 */
export const SELECTOR_TYPE_ID = '813ca865db9b486490dec6764febaab3';
export const TARGET_PROPERTY_ID = 'e1788cdf9bae42e987b0d9791de09b31';
