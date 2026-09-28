import { Kind, type OperationDefinitionNode } from 'graphql';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CLAIM_TYPE_ID, TOPICS_PROPERTY_ID } from '~/core/claims/ontology';
import { DEBATE_TYPE_ID } from '~/core/debates/ontology';

import { NEWS_STORY_TYPE_ID } from '../ontology';
import {
  emptyTopicFeedCompositionCounts,
  fetchTopicFeedCompositionCounts,
  fetchTopicFeedFacets,
} from './topic-feed-facets';
import { topicFeedFilter } from './topic-feed-filter';

const TOPIC_A = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const PAGE_TOPIC = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const OTHER_TYPE = 'dddddddddddddddddddddddddddddddd';
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
                { keys: [TOPIC_A], distinctCount: { fromEntityId: '5' } },
                { keys: [TOPIC_C], distinctCount: { fromEntityId: '1' } },
                { keys: [PAGE_TOPIC], distinctCount: { fromEntityId: '8' } },
              ],
            },
          })
        );
      }
      if (operation?.name?.value === 'ExploreCompleteIndex') {
        const nodes = [
          { id: 'other-type-entity', typeIds: [OTHER_TYPE], rankingScore: '6', createdAt: '6' },
          { id: 'debate-1', typeIds: [DEBATE_TYPE_ID], rankingScore: '5', createdAt: '5' },
          { id: 'claim-1', typeIds: [CLAIM_TYPE_ID], rankingScore: '4', createdAt: '4' },
          {
            id: 'claim-news',
            typeIds: [CLAIM_TYPE_ID, CLAIM_TYPE_ID, NEWS_STORY_TYPE_ID],
            rankingScore: null,
            createdAt: '3',
          },
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
  it('facets the mixed feed with a single distinct-entity aggregate', async () => {
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
    expect(mocks.calls.map(call => call.operation)).toEqual(['RelationFacetByFilter']);
  });

  it('does not restrict facets by type when no selection was supplied', async () => {
    await fetchTopicFeedFacets({ spaceIds, topicId: PAGE_TOPIC, selectedTopicIds: [] });
    expect(mocks.calls).toHaveLength(1);
    expect(mocks.calls[0]?.variables.filter.fromEntity.and[0]).not.toHaveProperty('typeIds');
  });

  it.each([[CLAIM_TYPE_ID], [DEBATE_TYPE_ID]])('applies the selected entity types: %j', async typeId => {
    await fetchTopicFeedFacets({
      spaceIds,
      topicId: PAGE_TOPIC,
      selectedTopicIds: [],
      typeIds: [typeId],
    });

    expect(mocks.calls).toHaveLength(1);
    expect(mocks.calls[0]?.variables.filter.fromEntity.and[0]).toMatchObject({
      typeIds: { overlaps: [typeId] },
      spaceIds: { overlaps: spaceIds },
    });
  });

  it.each([
    { spaceIds: [], typeIds: [DEBATE_TYPE_ID] },
    { spaceIds, typeIds: [] },
  ])('skips empty populations: %j', async scope => {
    await expect(fetchTopicFeedFacets({ ...scope, topicId: PAGE_TOPIC, selectedTopicIds: [] })).resolves.toEqual([]);
    expect(mocks.calls).toHaveLength(0);
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
    expect(mocks.calls.map(call => call.operation)).toEqual(['RelationFacetByFilter']);
    expect(mocks.calls[0]?.variables).toMatchObject({
      filter: {
        typeId: { is: TOPICS_PROPERTY_ID },
        fromEntity: {
          and: [
            { typeIds: { overlaps: [CLAIM_TYPE_ID, DEBATE_TYPE_ID] }, spaceIds: { overlaps: spaceIds } },
            topicFeedFilter(PAGE_TOPIC, [TOPIC_A]),
          ],
        },
      },
      groupBy: ['TO_ENTITY_ID'],
    });
  });
});

describe('fetchTopicFeedCompositionCounts', () => {
  it('counts every selected type from the same compact population the feed orders', async () => {
    const expected = emptyTopicFeedCompositionCounts();
    expected.typeCounts[CLAIM_TYPE_ID] = 2;
    expected.typeCounts[DEBATE_TYPE_ID] = 1;
    expected.typeCounts[NEWS_STORY_TYPE_ID] = 1;
    expected.typeCounts[OTHER_TYPE] = 1;
    expected.typeNames = { [OTHER_TYPE]: 'Governance' };

    await expect(fetchTopicFeedCompositionCounts({ spaceIds, topicId: PAGE_TOPIC })).resolves.toEqual(expected);

    const populationCalls = mocks.calls.filter(call => call.operation === 'ExploreCompleteIndex');
    expect(populationCalls).toHaveLength(1);
    for (const { variables } of populationCalls) {
      expect(variables.typeIds).toBeUndefined();
      expect(variables.spaceIds).toEqual({ in: spaceIds });
      expect(variables.filter.and).toEqual(
        expect.arrayContaining([expect.objectContaining({ and: expect.any(Array) })])
      );
    }
  });
});
