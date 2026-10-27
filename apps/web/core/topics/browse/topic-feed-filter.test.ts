import { describe, expect, it } from 'vitest';

import { TOPICS_PROPERTY_ID } from '~/core/claims/ontology';

import { topicFeedFilter, topicsRelationFilter } from './topic-feed-filter';

describe('topicFeedFilter', () => {
  it('matches every entity type directly through Topics, including Debates', () => {
    expect(topicFeedFilter('topic-1')).toEqual({
      and: [{ relations: { some: { typeId: { is: TOPICS_PROPERTY_ID }, toEntityId: { is: 'topic-1' } } } }],
    });
  });

  it('requires every selected topic in addition to the page topic', () => {
    expect(topicFeedFilter('topic-1', ['topic-2', 'topic-3']).and).toEqual(
      ['topic-1', 'topic-2', 'topic-3'].map(id => ({
        relations: { some: { typeId: { is: TOPICS_PROPERTY_ID }, toEntityId: { is: id } } },
      }))
    );
  });

  it('deduplicates the page topic and repeated additional topics regardless of UUID spelling', () => {
    expect(
      topicFeedFilter('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', [
        'AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA',
        'topic-2',
        'topic-2',
      ]).and
    ).toHaveLength(2);
  });
});

describe('topicsRelationFilter', () => {
  it('is no filter at all when no topic is selected, so a space feed shows everything in it', () => {
    expect(topicsRelationFilter([])).toBeUndefined();
  });

  it('requires every selected topic', () => {
    expect(topicsRelationFilter(['topic-2', 'topic-3'])?.and).toHaveLength(2);
  });
});
