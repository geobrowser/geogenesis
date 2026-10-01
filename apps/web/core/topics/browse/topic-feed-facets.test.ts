import { Kind, type OperationDefinitionNode } from 'graphql';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CLAIM_TYPE_ID, TOPICS_PROPERTY_ID } from '~/core/claims/ontology';
import { DEBATE_TYPE_ID } from '~/core/debates/ontology';
import { claimsRequireDebateTagFilter } from '~/core/explore/explore-debate-tag-filter';

import { NEWS_STORY_TYPE_ID } from '../ontology';
import {
  clearSpaceTopicCaches,
  emptyTopicFeedCompositionCounts,
  fetchSpaceTopicCompositionCounts,
  fetchSpaceTopicFeedFacets,
  fetchTopicFeedCompositionCounts,
  fetchTopicFeedFacets,
} from './topic-feed-facets';
import { topicFeedFilter, topicsRelationFilter } from './topic-feed-filter';
import { TOPIC_FEED_ENTITY_TYPE_IDS } from './topic-feed-types';

const TOPIC_A = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const PAGE_TOPIC = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const TOPIC_C = 'cccccccccccccccccccccccccccccccc';

const mocks = vi.hoisted(() => ({
  calls: [] as Array<{ operation: string | undefined; variables: Record<string, any> }>,
  /** gaia's grouped type counts, or `fail` for an API without them. */
  typeCounts: 'fail' as 'fail' | Array<{ typeId: string; entityCount: string | number }>,
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
      if (operation?.name?.value === 'ExploreRelationIndex') {
        const nodes = [
          { id: 'debate-1', typeIds: [DEBATE_TYPE_ID], rankingScore: '5', createdAt: '5' },
          { id: 'claim-1', typeIds: [CLAIM_TYPE_ID], rankingScore: '4', createdAt: '4' },
          {
            id: 'claim-news',
            typeIds: [CLAIM_TYPE_ID, CLAIM_TYPE_ID, NEWS_STORY_TYPE_ID],
            rankingScore: null,
            createdAt: '3',
          },
        ];
        return Effect.succeed(
          decoder({
            relationsConnection: { nodes: nodes.map(fromEntity => ({ fromEntity })), pageInfo: { hasNextPage: false } },
          })
        );
      }
      if (operation?.name?.value === 'TopicFeedTypeCounts') {
        if (mocks.typeCounts === 'fail') throw new Error('Cannot query field "topicFeedTypeCounts"');
        return Effect.succeed(decoder({ topicFeedTypeCounts: mocks.typeCounts }));
      }
      if (operation?.name?.value === 'SpaceTopicFeedTypeCounts') {
        return Effect.succeed(
          decoder({ t0: { totalCount: '888' }, t1: { totalCount: 35 }, t2: null, t3: { totalCount: 'nope' } })
        );
      }
      throw new Error(`Unexpected operation ${operation?.name?.value}`);
    },
  };
});

const spaceIds = ['11111111111111111111111111111111'];

beforeEach(() => {
  mocks.calls = [];
  mocks.typeCounts = 'fail';
  clearSpaceTopicCaches();
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
  it("reads gaia's grouped counts for the page topic, absent types as zero", async () => {
    mocks.typeCounts = [
      { typeId: CLAIM_TYPE_ID, entityCount: '7854' },
      { typeId: DEBATE_TYPE_ID, entityCount: 12 },
    ];
    const expected = emptyTopicFeedCompositionCounts();
    expected.typeCounts[CLAIM_TYPE_ID] = 7854;
    expected.typeCounts[DEBATE_TYPE_ID] = 12;

    await expect(fetchTopicFeedCompositionCounts({ spaceIds, topicId: PAGE_TOPIC })).resolves.toEqual(expected);

    expect(mocks.calls.map(call => call.operation)).toEqual(['TopicFeedTypeCounts']);
    expect(mocks.calls[0]?.variables).toEqual({
      topicIds: [PAGE_TOPIC],
      typeIds: TOPIC_FEED_ENTITY_TYPE_IDS,
      spaceIds,
      matchAll: true,
      debateTaggedClaims: false,
    });
  });

  it('counts the compact population the feed falls back to when the grouped count fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const expected = emptyTopicFeedCompositionCounts();
    expected.typeCounts[CLAIM_TYPE_ID] = 2;
    expected.typeCounts[DEBATE_TYPE_ID] = 1;
    expected.typeCounts[NEWS_STORY_TYPE_ID] = 1;

    await expect(fetchTopicFeedCompositionCounts({ spaceIds, topicId: PAGE_TOPIC })).resolves.toEqual(expected);

    const populationCalls = mocks.calls.filter(call => call.operation === 'ExploreRelationIndex');
    expect(populationCalls).toHaveLength(1);
    const fromEntity = populationCalls[0]?.variables.filter.and[1].fromEntity;
    expect(fromEntity.and[0]).toMatchObject({
      spaceIds: { overlaps: spaceIds },
      typeIds: { overlaps: expect.arrayContaining([CLAIM_TYPE_ID, DEBATE_TYPE_ID, NEWS_STORY_TYPE_ID]) },
    });
    expect(fromEntity.and[1]).toEqual(topicFeedFilter(PAGE_TOPIC));
    warn.mockRestore();
  });
});

describe('fetchSpaceTopicFeedFacets', () => {
  const spaceId = spaceIds[0];

  it("facets everything in the space, leaving out the space's own topic", async () => {
    const topics = await fetchSpaceTopicFeedFacets({
      spaceId,
      spaceTopicId: PAGE_TOPIC,
      selectedTopicIds: [],
      typeIds: [CLAIM_TYPE_ID, DEBATE_TYPE_ID],
    });

    expect(topics).toEqual([
      { id: TOPIC_A, name: 'Alignment', count: 5 },
      { id: TOPIC_C, name: 'Governance', count: 1 },
    ]);
    // No Topics predicate: with nothing selected the population is the space alone. The claims in
    // it are gated on the Debate tag, as the feed is.
    const fromEntity = mocks.calls[0]?.variables.filter.fromEntity;
    expect(fromEntity.and).toBeUndefined();
    expect(fromEntity).toMatchObject({
      spaceIds: { overlaps: [spaceId] },
      ...claimsRequireDebateTagFilter([spaceId]),
    });
  });

  it('narrows to the selected topics', async () => {
    await fetchSpaceTopicFeedFacets({
      spaceId,
      spaceTopicId: PAGE_TOPIC,
      selectedTopicIds: [TOPIC_A],
      typeIds: [CLAIM_TYPE_ID],
    });

    expect(mocks.calls[0]?.variables.filter.fromEntity.and[1]).toEqual(topicsRelationFilter([TOPIC_A]));
  });

  it('shares one aggregate between identical requests, whatever order their ids arrive in', async () => {
    const request = { spaceId, spaceTopicId: PAGE_TOPIC, selectedTopicIds: [TOPIC_A, TOPIC_C] };
    await fetchSpaceTopicFeedFacets({ ...request, typeIds: [CLAIM_TYPE_ID, DEBATE_TYPE_ID] });
    await fetchSpaceTopicFeedFacets({
      ...request,
      selectedTopicIds: [TOPIC_C, TOPIC_A],
      typeIds: [DEBATE_TYPE_ID, CLAIM_TYPE_ID],
    });
    expect(mocks.calls.filter(call => call.operation === 'RelationFacetByFilter')).toHaveLength(1);

    await fetchSpaceTopicFeedFacets({ ...request, typeIds: [CLAIM_TYPE_ID] });
    expect(mocks.calls.filter(call => call.operation === 'RelationFacetByFilter')).toHaveLength(2);
  });

  it('skips an empty type selection', async () => {
    await expect(
      fetchSpaceTopicFeedFacets({ spaceId, spaceTopicId: PAGE_TOPIC, selectedTopicIds: [], typeIds: [] })
    ).resolves.toEqual([]);
    expect(mocks.calls).toHaveLength(0);
  });
});

describe('fetchSpaceTopicCompositionCounts', () => {
  it('maps each aliased count back to its type, reading a missing or unparseable count as zero', async () => {
    const expected = emptyTopicFeedCompositionCounts();
    expected.typeCounts[TOPIC_FEED_ENTITY_TYPE_IDS[0]] = 888;
    expected.typeCounts[TOPIC_FEED_ENTITY_TYPE_IDS[1]] = 35;

    await expect(fetchSpaceTopicCompositionCounts({ spaceId: spaceIds[0] })).resolves.toEqual(expected);
    expect(mocks.calls).toHaveLength(1);
    expect(mocks.calls[0]?.variables).toMatchObject({
      spaceIds: { in: spaceIds },
      filter: claimsRequireDebateTagFilter(spaceIds),
    });
  });

  it('runs the count query once for concurrent visitors to the same space', async () => {
    await Promise.all([
      fetchSpaceTopicCompositionCounts({ spaceId: spaceIds[0] }),
      fetchSpaceTopicCompositionCounts({ spaceId: spaceIds[0] }),
    ]);

    expect(mocks.calls).toHaveLength(1);
  });
});
