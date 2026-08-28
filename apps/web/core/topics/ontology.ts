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
