import { Kind, type OperationDefinitionNode } from 'graphql';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CLAIM_TYPE_ID } from '~/core/claims/ontology';
import { DEBATE_TYPE_ID } from '~/core/debates/ontology';

import { fetchTopicFeedFacetCounts } from './topic-feed-facets';

const mocks = vi.hoisted(() => ({
  calls: [] as Array<{ operation: string | undefined; variables: Record<string, any> }>,
}));

vi.mock('~/core/io/graphql-client', async () => {
  const { Effect } = await import('effect');
  return {
    graphql: ({ query, decoder, variables }: Record<string, any>) => {
      const operation = query.definitions.find(
        (definition: OperationDefinitionNode) => definition.kind === Kind.OPERATION_DEFINITION
      ) as OperationDefinitionNode | undefined;
      mocks.calls.push({ operation: operation?.name?.value, variables });

      if (operation?.name?.value === 'RelationFacetByFilter') {
        return Effect.succeed(
          decoder({
            relationsConnection: {
              groupedAggregates: [
                { keys: ['aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'], distinctCount: { fromEntityId: '3' } },
              ],
            },
          })
        );
      }

      return Effect.succeed(decoder({ topic0: { totalCount: 2 }, topic1: { totalCount: 1 } }));
    },
  };
});

const browse = {
  featured: [{ id: '11111111111111111111111111111111', name: 'Featured', image: null }],
  editorOf: [],
  memberOf: [],
  documentationImage: null,
  personalSpaceId: null,
};

beforeEach(() => {
  mocks.calls = [];
});

describe('fetchTopicFeedFacetCounts', () => {
  it('adds direct entities to distinct Debates counted through their debated Claims', async () => {
    const counts = await fetchTopicFeedFacetCounts({
      browse,
      topicId: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      selectedTopicIds: [],
      candidateTopicIds: ['aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'cccccccccccccccccccccccccccccccc'],
      typeIds: [CLAIM_TYPE_ID, DEBATE_TYPE_ID],
    });

    expect(counts).toEqual({
      aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa: 5,
      cccccccccccccccccccccccccccccccc: 1,
    });
    expect(mocks.calls.map(call => call.operation)).toEqual(['RelationFacetByFilter', 'TopicFeedDebateFacets']);

    const debateFilter = mocks.calls[1]?.variables.filter0;
    const candidateTopicMatch = debateFilter.and[1].and[1];
    expect(candidateTopicMatch.or[1].and[1].relations.some.toEntity.relations.some.toEntityId.is).toBe(
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    );
  });

  it('does not run Debate counts when Debate is excluded by the type filter', async () => {
    const counts = await fetchTopicFeedFacetCounts({
      browse,
      topicId: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      selectedTopicIds: [],
      candidateTopicIds: ['aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'],
      typeIds: [CLAIM_TYPE_ID],
    });

    expect(counts).toEqual({ aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa: 3 });
    expect(mocks.calls.map(call => call.operation)).toEqual(['RelationFacetByFilter']);
  });
});
