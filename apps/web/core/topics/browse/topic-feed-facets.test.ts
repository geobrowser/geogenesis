import { Kind, type OperationDefinitionNode } from 'graphql';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CLAIM_TYPE_ID } from '~/core/claims/ontology';
import { DEBATE_TYPE_ID } from '~/core/debates/ontology';

import { fetchTopicFeedCompositionCounts, fetchTopicFeedFacets } from './topic-feed-facets';

const TOPIC_A = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const PAGE_TOPIC = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const TOPIC_C = 'cccccccccccccccccccccccccccccccc';

const mocks = vi.hoisted(() => ({
  calls: [] as Array<{ operation: string | undefined; variables: Record<string, any> }>,
}));

vi.mock('~/core/io/queries', async () => {
  const { Effect } = await import('effect');
  return {
    getEntityNames: (ids: string[]) =>
      Effect.succeed(ids.map(id => ({ id, name: id === TOPIC_A ? 'Alignment' : 'Governance' }))),
  };
});

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
                { keys: [TOPIC_A], distinctCount: { fromEntityId: '3' } },
                { keys: [PAGE_TOPIC], distinctCount: { fromEntityId: '8' } },
              ],
            },
          })
        );
      }
      if (operation?.name?.value === 'TopicFeedDebateTopics') {
        return Effect.succeed(
          decoder({
            entitiesConnection: {
              nodes: [
                {
                  id: 'debate-1',
                  relationsList: [
                    { toEntity: { relationsList: [{ toEntity: { id: TOPIC_A } }] } },
                    {
                      toEntity: {
                        relationsList: [{ toEntity: { id: TOPIC_A } }, { toEntity: { id: TOPIC_C } }],
                      },
                    },
                  ],
                },
                {
                  id: 'debate-2',
                  relationsList: [{ toEntity: { relationsList: [{ toEntity: { id: TOPIC_A } }] } }],
                },
              ],
              pageInfo: { hasNextPage: false, endCursor: null },
            },
          })
        );
      }
      if (operation?.name?.value === 'TopicFeedComposition') {
        return Effect.succeed(
          decoder({ claims: { totalCount: 1 }, debates: { totalCount: 2 }, news: { totalCount: 3 } })
        );
      }
      throw new Error(`Unexpected operation ${operation?.name?.value}`);
    },
  };
});

const spaceIds = ['11111111111111111111111111111111'];

beforeEach(() => {
  mocks.calls = [];
});

describe('fetchTopicFeedFacets', () => {
  it('facets only the feed population and counts each Debate once per inherited Claim Topic', async () => {
    const topics = await fetchTopicFeedFacets({
      spaceIds,
      topicId: PAGE_TOPIC,
      selectedTopicIds: [],
      typeIds: [CLAIM_TYPE_ID, DEBATE_TYPE_ID],
    });

    expect(topics).toEqual([
      { id: TOPIC_A, name: 'Alignment', count: 5 },
      { id: TOPIC_C, name: 'Governance', count: 1 },
    ]);
    expect(mocks.calls.map(call => call.operation)).toEqual(['RelationFacetByFilter', 'TopicFeedDebateTopics']);
  });

  it('does not traverse Debate claims when Debate is excluded by the type filter', async () => {
    await fetchTopicFeedFacets({
      spaceIds,
      topicId: PAGE_TOPIC,
      selectedTopicIds: [],
      typeIds: [CLAIM_TYPE_ID],
    });

    expect(mocks.calls.map(call => call.operation)).toEqual(['RelationFacetByFilter']);
  });
});

describe('fetchTopicFeedCompositionCounts', () => {
  it('counts unique feed-eligible entities with the same Topic and visible-space filters', async () => {
    await expect(fetchTopicFeedCompositionCounts({ spaceIds, topicId: PAGE_TOPIC })).resolves.toEqual({
      claims: 1,
      debates: 2,
      news: 3,
    });

    const variables = mocks.calls[0]?.variables;
    for (const filter of [variables.claims, variables.debates, variables.news]) {
      const feedScope = filter.and[0];
      expect(feedScope.spaceIds.overlaps).toEqual(['11111111111111111111111111111111']);
      expect(feedScope.values.some.text).toEqual({ isNull: false, isNot: '' });
    }
  });
});
