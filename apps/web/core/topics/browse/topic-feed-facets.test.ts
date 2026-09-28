import { Kind, type OperationDefinitionNode } from 'graphql';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CLAIM_TYPE_ID } from '~/core/claims/ontology';
import { DEBATE_TYPE_ID } from '~/core/debates/ontology';

import { NEWS_STORY_TYPE_ID } from '../ontology';
import {
  emptyTopicFeedCompositionCounts,
  fetchTopicFeedCompositionCounts,
  fetchTopicFeedFacets,
} from './topic-feed-facets';

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
      if (operation?.name?.value === 'ExploreCompleteIndex') {
        const requestedTypeIds = variables.typeIds.in as string[];
        const nodes = requestedTypeIds.includes(DEBATE_TYPE_ID)
          ? [{ id: 'debate-1', typeIds: [DEBATE_TYPE_ID], rankingScore: '5', createdAt: '5' }]
          : [
              { id: 'claim-1', typeIds: [CLAIM_TYPE_ID], rankingScore: '4', createdAt: '4' },
              { id: 'claim-news', typeIds: [CLAIM_TYPE_ID, NEWS_STORY_TYPE_ID], rankingScore: null, createdAt: '3' },
            ];
        return Effect.succeed(decoder({ entitiesConnection: { nodes, pageInfo: { hasNextPage: false } } }));
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

  it('uses the complete feed population for Best facets too', async () => {
    const topics = await fetchTopicFeedFacets({
      spaceIds,
      topicId: PAGE_TOPIC,
      selectedTopicIds: [TOPIC_A],
      typeIds: [CLAIM_TYPE_ID, DEBATE_TYPE_ID],
    });

    expect(topics).toEqual([
      { id: TOPIC_A, name: 'Alignment', count: 5 },
      { id: TOPIC_C, name: 'Governance', count: 1 },
    ]);
    expect(mocks.calls.map(call => call.operation)).toEqual(['RelationFacetByFilter', 'TopicFeedDebateTopics']);
  });
});

describe('fetchTopicFeedCompositionCounts', () => {
  it('counts every selected type from the same compact population the feed orders', async () => {
    const expected = emptyTopicFeedCompositionCounts();
    expected.typeCounts[CLAIM_TYPE_ID] = 2;
    expected.typeCounts[DEBATE_TYPE_ID] = 1;
    expected.typeCounts[NEWS_STORY_TYPE_ID] = 1;

    await expect(fetchTopicFeedCompositionCounts({ spaceIds, topicId: PAGE_TOPIC })).resolves.toEqual(expected);

    const populationCalls = mocks.calls.filter(call => call.operation === 'ExploreCompleteIndex');
    expect(populationCalls).toHaveLength(2);
    expect(populationCalls.flatMap(call => call.variables.typeIds.in)).toEqual(
      expect.arrayContaining([CLAIM_TYPE_ID, DEBATE_TYPE_ID, NEWS_STORY_TYPE_ID])
    );
    for (const { variables } of populationCalls) {
      expect(variables.spaceIds).toEqual({ in: spaceIds });
      expect(variables.filter.and).toEqual(
        expect.arrayContaining([expect.objectContaining({ and: expect.any(Array) })])
      );
    }
  });
});
