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
  { id: CLAIM_TYPE_ID, label: 'Claim', pluralLabel: 'claims', color: 'var(--color-green)', summaryOrder: 1 },
  { id: DEBATE_TYPE_ID, label: 'Debate', pluralLabel: 'debates', color: 'var(--color-purple)', summaryOrder: 0 },
  {
    id: NEWS_STORY_TYPE_ID,
    label: 'News story',
    pluralLabel: 'news stories',
    color: 'var(--color-orange)',
    summaryOrder: 2,
  },
  {
    id: EPISODE_TYPE_ID,
    label: 'Episode',
    pluralLabel: 'episodes',
    color: 'var(--color-ctaPrimary)',
    summaryOrder: 3,
  },
  { id: POST_TYPE_ID, label: 'Post', pluralLabel: 'posts', color: 'var(--color-pink)', summaryOrder: 4 },
  { id: TWEET_TYPE_ID, label: 'Tweet', pluralLabel: 'tweets', color: 'var(--color-red-01)', summaryOrder: 5 },
  {
    id: OFFICIAL_DOCUMENT_TYPE_ID,
    label: 'Official document',
    pluralLabel: 'official documents',
    color: 'var(--color-grey-05)',
    summaryOrder: 6,
  },
  {
    id: ARTICLE_TYPE_ID,
    label: 'Article',
    pluralLabel: 'articles',
    color: 'var(--color-link)',
    summaryOrder: 7,
  },
  {
    id: PAPER_TYPE_ID,
    label: 'Paper',
    pluralLabel: 'papers',
    color: 'var(--color-grey-03)',
    summaryOrder: 8,
  },
  { id: QUOTE_TYPE_ID, label: 'Quote', pluralLabel: 'quotes', color: 'var(--color-ctaHover)', summaryOrder: 9 },
  {
    id: DATASET_TYPE_ID,
    label: 'Dataset',
    pluralLabel: 'datasets',
    color: 'var(--color-successTertiary)',
    summaryOrder: 10,
  },
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
