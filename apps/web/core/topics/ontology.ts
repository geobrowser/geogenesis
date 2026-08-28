/**
 * Properties a topic page reads that aren't already named elsewhere in `core/`.
 *
 * `Topics`, `Subtopics`, the curated tag and the Topic type itself live in `core/claims/ontology.ts`
 * and `core/constants.ts` — this only adds what the page needs beyond them.
 */

/** Hosts (RELATION) → Person. An episode's regular presenters. */
export const HOSTS_PROPERTY_ID = 'c72d9abbbca84e86b7e8b71e91d2b37e';

/** Guests (RELATION) → Person. Who appeared on an episode. */
export const GUESTS_PROPERTY_ID = 'cb60a1a66fb548c9b936200c5c271330';

/**
 * Subtopics, as a second property.
 *
 * `SUBTOPIC_RELATION_TYPE_ID` in `core/constants.ts` is the named one. This id carries a near-
 * identical set — measured on `U.S. elections`, 14 relations under the named property and 13 under
 * this one, pointing at almost the same topics — and its property entity has no name at all.
 *
 * Read alongside the named property and merged, so navigation doesn't silently depend on which of
 * the two a given topic happens to have been written with. The duplication is an ontology problem
 * rather than a client one and is flagged on GEO-2722; when it is resolved this should go.
 */
export const UNNAMED_SUBTOPIC_PROPERTY_ID = '4b5bbddf32b247bab0a6dbbab27f457d';

/**
 * Content types counted in the composition strip.
 *
 * Only the buckets worth naming: measured across topics these are the ones that reach double
 * figures, and everything else — articles, official documents, papers, datasets, organizations —
 * runs to one or two links on any given topic and is counted as a remainder instead.
 */
export const EPISODE_TYPE_ID = '972d201ad78045689e01543f67b26bee';
export const NEWS_STORY_TYPE_ID = 'e550fe517e904b2c8fffdf13408f5634';
export const TWEET_TYPE_ID = 'd6f0506def324d8e9de4976b986e78ec';
export const POST_TYPE_ID = 'f3d4461486b74d2583d89709c9d84f65';
