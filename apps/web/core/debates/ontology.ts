import { SystemIds } from '@geoprotocol/geo-sdk/lite';

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

/** Debate videos (RELATION) → Video. */
export const DEBATE_VIDEOS_PROPERTY_ID = 'c48dc314fa7148aeb967139160456f1d';

/** Claims (RELATION) → Claim. The claim the debate argued for/against. */
export const DEBATE_CLAIMS_PROPERTY_ID = 'e614cce1c4ce45868304fd1237119eb2';

/** Transcripts (RELATION) → Transcript. */
export const DEBATE_TRANSCRIPTS_PROPERTY_ID = 'c504c7d5c3374016a5f083e4b5a92911';

// Supported by / Opposed by (participant → side) are deliberately omitted: the ontology spec left
// their property IDs blank, and we won't publish placeholder relations on-chain. Add them here once
// the canonical IDs exist; the participant's `position` is already carried through for that.

/** Canonical geo-sdk ids reused by the debate ontology (verified equal to the spec). */
export const NAME_PROPERTY_ID = SystemIds.NAME_PROPERTY; // a126ca53…
export const TYPES_PROPERTY_ID = SystemIds.TYPES_PROPERTY; // 8f151ba4…
export const VIDEO_TYPE_ID = SystemIds.VIDEO_TYPE; // d7a4817c… (matches spec)
export const VIDEO_URL_PROPERTY_ID = SystemIds.VIDEO_URL_PROPERTY; // 33da2ef5…
export const BLOCKS_PROPERTY_ID = SystemIds.BLOCKS; // beaba5cb…
export const TEXT_BLOCK_TYPE_ID = SystemIds.TEXT_BLOCK; // 76474f2f…
export const MARKDOWN_CONTENT_PROPERTY_ID = SystemIds.MARKDOWN_CONTENT; // e3e363d1… (matches spec)
export const AUTHORS_PROPERTY_ID = '91a9e2f6e51a48f7997661de8561b690'; // ContentIds.AUTHORS_PROPERTY (matches spec)
export const SOURCES_PROPERTY_ID = '49c5d5e1679a4dbdbfd33f618f227c94'; // ContentIds.SOURCES_PROPERTY (matches spec)
