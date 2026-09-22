import { CLAIM_TYPE_ID } from '~/core/claims/ontology';
import { DEBATE_TYPE_ID } from '~/core/debates/ontology';

import {
  ARTICLE_TYPE_ID,
  DATASET_TYPE_ID,
  EPISODE_TYPE_ID,
  NEWS_STORY_TYPE_ID,
  OFFICIAL_DOCUMENT_TYPE_ID,
  PAPER_TYPE_ID,
  POST_TYPE_ID,
  QUOTE_TYPE_ID,
  TWEET_TYPE_ID,
} from '../ontology';

/** Claims, Debates, and every content type formerly represented by the Coverage tab. */
export const TOPIC_FEED_ENTITY_TYPES = [
  { id: CLAIM_TYPE_ID, label: 'Claim' },
  { id: DEBATE_TYPE_ID, label: 'Debate' },
  { id: NEWS_STORY_TYPE_ID, label: 'News story' },
  { id: EPISODE_TYPE_ID, label: 'Episode' },
  { id: POST_TYPE_ID, label: 'Post' },
  { id: TWEET_TYPE_ID, label: 'Tweet' },
  { id: OFFICIAL_DOCUMENT_TYPE_ID, label: 'Official document' },
  { id: ARTICLE_TYPE_ID, label: 'Article' },
  { id: PAPER_TYPE_ID, label: 'Paper' },
  { id: QUOTE_TYPE_ID, label: 'Quote' },
  { id: DATASET_TYPE_ID, label: 'Dataset' },
] as const;

export const TOPIC_FEED_ENTITY_TYPE_IDS = TOPIC_FEED_ENTITY_TYPES.map(type => type.id);

const canonicalIdByNormalizedId = new Map(
  TOPIC_FEED_ENTITY_TYPE_IDS.map(id => [id.replace(/-/g, '').toLowerCase(), id])
);

/** Missing means all Topic feed types; an empty value is the deliberate none-selected state. */
export function parseTopicFeedTypeIds(raw: string | null): string[] {
  if (raw === null) return [...TOPIC_FEED_ENTITY_TYPE_IDS];
  if (raw === '') return [];

  const selected = new Set(
    raw
      .split(',')
      .map(id => canonicalIdByNormalizedId.get(id.replace(/-/g, '').toLowerCase()))
      .filter((id): id is NonNullable<typeof id> => id !== undefined)
  );
  return TOPIC_FEED_ENTITY_TYPE_IDS.filter(id => selected.has(id));
}
