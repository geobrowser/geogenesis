import { ContentIds, SystemIds } from '@geoprotocol/geo-sdk/lite';

import { KEY_FRAME_IMAGE_PROPERTY } from '~/core/constants';

/**
 * GRC-20 ontology for publishing a finished debate to the knowledge graph.
 *
 * IDs come from the "Debates ontology" spec. Where the spec reuses a canonical
 * geo-sdk id we re-export it from `SystemIds`/`ContentIds` (verified equal) rather
 * than hard-coding a second copy, so the two never drift.
 */

/** Debate (TYPE) — the top-level entity a published debate becomes. */
export const DEBATE_TYPE_ID = 'fd51f93520634617be397b672b23364c';

/** Transcript (TYPE) — holds the per-turn text blocks of a debate. */
export const TRANSCRIPT_TYPE_ID = '97042e6d9c7b4db5930c43d48debda84';

/** Debates page (TYPE) — the "All debates" landing page a Recent debates block links to. */
export const DEBATES_PAGE_TYPE_ID = 'dec3c8cae071482394f1dc4de11e7fb6';

/** Debate videos (RELATION) → Video. */
export const DEBATE_VIDEOS_PROPERTY_ID = 'c48dc314fa7148aeb967139160456f1d';

/** Claims (RELATION) → Claim. The claim the debate argued for/against. */
export const DEBATE_CLAIMS_PROPERTY_ID = 'e614cce1c4ce45868304fd1237119eb2';

/** Transcripts (RELATION) → Transcript. */
export const DEBATE_TRANSCRIPTS_PROPERTY_ID = 'c504c7d5c3374016a5f083e4b5a92911';

/** Key frame (RELATION) → Image. The still the app shows as a video's poster. */
/** The debate entity's social share card, generated once at publish time (GEO-2755). */
export const OG_IMAGE_PROPERTY_ID = '7abfeb2d147a464e8e26efdd26441189';
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
 * as well as Images. Everything that resolves media reads this property first, so entities
 * published before debate media moved off IPFS keep rendering byte-identically.
 */
export const IMAGE_URL_PROPERTY_ID = SystemIds.IMAGE_URL_PROPERTY; // 8a743832…
/**
 * The canonical URL-typed link property ("Web URL"). Debate media entities carry their durable
 * geo-chat content URL here instead of pinning to IPFS (`IMAGE_URL_PROPERTY`, the "IPFS URL"),
 * which is what lets published media be permanently deleted. `RelationDtoLive` falls back to this
 * property for Image/Video-typed entities, so media referenced by it renders identically.
 *
 * It is a general-purpose canonical link, so it must only ever be read as a *fallback* on an
 * entity already known to be media. Never promote a renderable type or scan values blankly on it:
 * an ordinary entity's `Web URL` source link would turn into a broken image.
 */
export const WEB_URL_PROPERTY_ID = ContentIds.WEB_URL_PROPERTY; // 412ff593…
export const BLOCKS_PROPERTY_ID = SystemIds.BLOCKS; // beaba5cb…
export const TEXT_BLOCK_TYPE_ID = SystemIds.TEXT_BLOCK; // 76474f2f…
export const MARKDOWN_CONTENT_PROPERTY_ID = SystemIds.MARKDOWN_CONTENT; // e3e363d1… (matches spec)
export const AUTHORS_PROPERTY_ID = '91a9e2f6e51a48f7997661de8561b690'; // ContentIds.AUTHORS_PROPERTY (matches spec)
export const SOURCES_PROPERTY_ID = '49c5d5e1679a4dbdbfd33f618f227c94'; // ContentIds.SOURCES_PROPERTY (matches spec)
