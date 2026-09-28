import { describe, expect, it } from 'vitest';

import { CLAIM_TYPE_ID } from '~/core/claims/ontology';
import { DEBATE_TYPE_ID } from '~/core/debates/ontology';

import { COVERAGE_TYPE_IDS } from '../ontology';
import { TOPIC_FEED_ENTITY_TYPE_IDS, parseTopicFeedTypeIds } from './topic-feed-types';

describe('Topic feed entity types', () => {
  it('combines Claims, Debates, and every former Coverage type', () => {
    expect(TOPIC_FEED_ENTITY_TYPE_IDS).toEqual(expect.arrayContaining([CLAIM_TYPE_ID, DEBATE_TYPE_ID]));
    expect(TOPIC_FEED_ENTITY_TYPE_IDS).toEqual(expect.arrayContaining(COVERAGE_TYPE_IDS));
  });

  it('defaults a missing filter to every Topic feed type', () => {
    expect(parseTopicFeedTypeIds(null)).toEqual(TOPIC_FEED_ENTITY_TYPE_IDS);
  });

  it('drops unknown types and preserves canonical menu order', () => {
    expect(parseTopicFeedTypeIds(`${DEBATE_TYPE_ID},unknown,${CLAIM_TYPE_ID}`)).toEqual([
      CLAIM_TYPE_ID,
      DEBATE_TYPE_ID,
    ]);
  });
});
