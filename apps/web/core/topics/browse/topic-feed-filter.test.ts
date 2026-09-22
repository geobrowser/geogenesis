import { describe, expect, it } from 'vitest';

import { TOPICS_PROPERTY_ID } from '~/core/claims/ontology';
import { DEBATE_CLAIMS_PROPERTY_ID, DEBATE_TYPE_ID } from '~/core/debates/ontology';

import { topicFeedFilter } from './topic-feed-filter';

describe('topicFeedFilter', () => {
  it('matches direct topic relations and debates through their claim', () => {
    const filter = topicFeedFilter('topic-1');
    const match = filter.and?.[0];

    expect(match).toEqual({
      or: [
        {
          and: [
            { not: { typeIds: { overlaps: [DEBATE_TYPE_ID] } } },
            {
              relations: {
                some: { typeId: { is: TOPICS_PROPERTY_ID }, toEntityId: { is: 'topic-1' } },
              },
            },
          ],
        },
        {
          and: [
            { typeIds: { overlaps: [DEBATE_TYPE_ID] } },
            {
              relations: {
                some: {
                  typeId: { is: DEBATE_CLAIMS_PROPERTY_ID },
                  toEntity: {
                    relations: {
                      some: { typeId: { is: TOPICS_PROPERTY_ID }, toEntityId: { is: 'topic-1' } },
                    },
                  },
                },
              },
            },
          ],
        },
      ],
    });
  });

  it('requires every selected topic in addition to the page topic', () => {
    expect(topicFeedFilter('topic-1', ['topic-2', 'topic-3']).and).toHaveLength(3);
  });

  it('does not duplicate the page topic when it is selected', () => {
    expect(topicFeedFilter('topic-1', ['topic-1']).and).toHaveLength(1);
  });

  it('deduplicates repeated additional topics', () => {
    expect(topicFeedFilter('topic-1', ['topic-2', 'topic-2']).and).toHaveLength(2);
  });
});
