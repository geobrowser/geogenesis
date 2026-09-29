import { CLAIM_TYPE_ID } from '~/core/claims/ontology';
import { DEBATE_TYPE_ID } from '~/core/debates/ontology';

export const NEWS_STORY_TYPE_ID = 'e550fe517e904b2c8fffdf13408f5634';
export const EPISODE_TYPE_ID = '972d201ad78045689e01543f67b26bee';
export const TWEET_TYPE_ID = 'd6f0506def324d8e9de4976b986e78ec';
export const PAPER_TYPE_ID = '5e24fb52856c4189a9716af4387b1b89';

/**
 * Every entity type the shared feed classifier knows (Geo ontology IDs, hyphenless for GraphQL
 * variables). `explore-diversity` derives its classification priority from this list, and the Topic
 * feed runs through that classifier too — so this list is not Explore's whitelist, and News story
 * stays on it even though Explore no longer serves news stories. Removing it here would reclassify
 * a Claim-and-News-story entity as a Claim in the Topic feed's mix.
 */
export const FEED_ENTITY_TYPES = [
  { id: NEWS_STORY_TYPE_ID, label: 'News story' },
  { id: DEBATE_TYPE_ID, label: 'Debate' },
  { id: CLAIM_TYPE_ID, label: 'Claim' },
  { id: EPISODE_TYPE_ID, label: 'Episode' },
  { id: 'f3d4461486b74d2583d89709c9d84f65', label: 'Post' },
  { id: TWEET_TYPE_ID, label: 'Tweet' },
  { id: '4d876b81787e41fcab5d075d4da66a3f', label: 'Event' },
  { id: PAPER_TYPE_ID, label: 'Paper' },
  { id: '7ed45f2bc48b419e8e4664d5ff680b0d', label: 'Person' },
  { id: '484a18c5030a499cb0f2ef588ff16d50', label: 'Project' },
  { id: '150db6defe2344f0805afa57502e2c32', label: 'Ranking block' },
  { id: '0419ca20118b4cdb84dfdb9ed73b50c2', label: 'Community call event' },
] as const;

export const FEED_ENTITY_TYPE_IDS = FEED_ENTITY_TYPES.map(type => type.id);

/**
 * Entity types the Explore feed will serve: every feed type except News story.
 *
 * `sanitizeExploreTypeIds` sorts every selection into this order, so it is the single source of
 * order. Leaving News story off means a `typeIds` parameter naming it (an old client, a kept link)
 * is sanitized away rather than served.
 */
export const EXPLORE_ENTITY_TYPES = FEED_ENTITY_TYPES.filter(type => type.id !== NEWS_STORY_TYPE_ID);

export const EXPLORE_ENTITY_TYPE_IDS = EXPLORE_ENTITY_TYPES.map(type => type.id);

/**
 * What Explore serves. There is no types menu any more, so this is the whole feed rather than an
 * opening selection: `/api/explore/feed` reads a missing `typeIds` parameter as these.
 *
 * Derived from `EXPLORE_ENTITY_TYPES` by membership so it stays in that list's order — the feed
 * compares selections as joined keys, and the same types in another order would look like a
 * different selection.
 */
const DEFAULT_SELECTED_TYPE_IDS: ReadonlySet<string> = new Set([DEBATE_TYPE_ID, CLAIM_TYPE_ID]);

export const DEFAULT_EXPLORE_TYPE_IDS = EXPLORE_ENTITY_TYPES.filter(type => DEFAULT_SELECTED_TYPE_IDS.has(type.id)).map(
  type => type.id
);

export const EXPLORE_ENTITY_NAME_PROPERTY_ID = 'a126ca530c8e48d5b88882c734c38935';
export const EXPLORE_ENTITY_DESCRIPTION_PROPERTY_ID = '9b1f76ff9711404c861e59dc3fa7d037';
export const EXPLORE_COVER_PROPERTY_ID = '34f535072e6b42c5a84443981a77cfa2';
export const EXPLORE_AVATAR_PROPERTY_ID = '1155befffad549b7a2e0da4777b8792c';

export const EXPLORE_PAGE_SIZE = 22;
