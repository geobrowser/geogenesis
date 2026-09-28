import { describe, expect, it } from 'vitest';

import { CLAIM_TYPE_ID } from '~/core/claims/ontology';
import { DEBATE_TYPE_ID } from '~/core/debates/ontology';

import { COVERAGE_TYPE_IDS } from '../ontology';
import { TOPIC_FEED_ENTITY_TYPE_IDS, parseTopicFeedTypeIds, topicFeedTypeOptions } from './topic-feed-types';

describe('Topic feed entity types', () => {
  it('combines Claims, Debates, and every former Coverage type', () => {
    expect(TOPIC_FEED_ENTITY_TYPE_IDS).toEqual(expect.arrayContaining([CLAIM_TYPE_ID, DEBATE_TYPE_ID]));
    expect(TOPIC_FEED_ENTITY_TYPE_IDS).toEqual(expect.arrayContaining(COVERAGE_TYPE_IDS));
  });

  it('leaves a missing filter unrestricted', () => {
    expect(parseTopicFeedTypeIds(null)).toBeUndefined();
    expect(parseTopicFeedTypeIds('')).toEqual([]);
  });

  it('accepts arbitrary valid types and drops invalid IDs', () => {
    expect(
      parseTopicFeedTypeIds(`${DEBATE_TYPE_ID},unknown,aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa,${CLAIM_TYPE_ID}`)
    ).toEqual([DEBATE_TYPE_ID, 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', CLAIM_TYPE_ID]);
  });
  it('derives named options for types outside the old fixed list', () => {
    const id = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    expect(topicFeedTypeOptions({ [id]: 4, [CLAIM_TYPE_ID]: 0 }, { [id]: 'Person' })).toEqual([
      { id, label: 'Person', pluralLabel: 'people', color: 'var(--color-grey-05)', summaryOrder: 11 },
    ]);
  });
});
