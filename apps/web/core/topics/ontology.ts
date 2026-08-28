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
export const OFFICIAL_DOCUMENT_TYPE_ID = '15cf40cf321758ef3a4150347b805c21';
export const TWEET_TYPE_ID = 'd6f0506def324d8e9de4976b986e78ec';
export const POST_TYPE_ID = 'f3d4461486b74d2583d89709c9d84f65';
export const QUOTE_TYPE_ID = '043a171c69184dc3a7dbb8471ca6fcc2';
export const DATASET_TYPE_ID = '0c4babfb43893486af827341bbf32e09';
export const ARTICLE_TYPE_ID = 'a2a5ed0cacef46b1835de457956ce915';
export const PAPER_TYPE_ID = '5e24fb52856c4189a9716af4387b1b89';

/**
 * What Coverage lists: things *published about* a topic.
 *
 * An allowlist rather than an exclusion, because the alternative doesn't work. Excluding claims by
 * type left `Claim relation` behind — the largest carrier of `Topics` in the graph, 830 of a
 * 2,000-relation sample — so two in five coverage rows were claim plumbing. And the entities query
 * takes types to include, with no negation to translate server-side, so filtering had to happen
 * after the page arrived and left pages short or empty.
 *
 * Deliberately out: `Claim` and `Claim relation` have their own section; `Podcast` is a show rather
 * than an episode, so it belongs to the source not the coverage; `Topic` is the subtopic list; and
 * the long tail of `Token`, `Organization`, `Protocol`, `Person`, `Audit`, `Contract`, `Project`
 * and the rest are subjects *in* a domain rather than writing *about* it.
 *
 * The cost of an allowlist is that a content type added later stays invisible until its id lands
 * here. Worth it against showing hundreds of rows nobody wants, but it is a maintenance point.
 */
export const COVERAGE_TYPE_IDS = [
  EPISODE_TYPE_ID,
  NEWS_STORY_TYPE_ID,
  OFFICIAL_DOCUMENT_TYPE_ID,
  TWEET_TYPE_ID,
  POST_TYPE_ID,
  QUOTE_TYPE_ID,
  DATASET_TYPE_ID,
  ARTICLE_TYPE_ID,
  PAPER_TYPE_ID,
];
