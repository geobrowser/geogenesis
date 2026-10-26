import { print } from 'graphql';
import { describe, expect, it } from 'vitest';

import { CLAIM_TYPE_ID, TOPICS_PROPERTY_ID } from '~/core/claims/ontology';
import { SOURCES_PROPERTY_ID } from '~/core/debates/ontology';
import { EntitiesOrderBy } from '~/core/gql/graphql';

import {
  claimRecordClaimsDocument,
  claimRecordCountsDocument,
  claimRecordDebatesDocument,
  claimRecordFilters,
  claimRecordOrderBy,
  decodeClaimRecordCandidates,
  decodeClaimRecordClaims,
  decodeClaimRecordCounts,
  decodeClaimRecordDirectDebates,
  mergeSortedRecordEntities,
  nextClaimRecordClaimsPageParam,
} from './claim-record-query';

const CLAIM_ID = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const SPACE_ID = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const TOPIC_ID = 'cccccccccccccccccccccccccccccccc';
const DEBATE_ID = 'dddddddddddddddddddddddddddddddd';

describe('claim record GraphQL', () => {
  it('uses bounded, server-ranked entity pages and distinct union counts', () => {
    const claims = print(claimRecordClaimsDocument);
    const debates = print(claimRecordDebatesDocument);
    const counts = print(claimRecordCountsDocument);

    expect(claims).toContain('topicClaims: entitiesConnection');
    expect(claims).toContain('extractedClaims: entitiesConnection');
    expect(claims).toContain('first: $first');
    expect(claims).toContain('after: $topicAfter');
    expect(claims).toContain('after: $extractedAfter');
    expect(claims).toContain('orderBy: $orderBy');
    expect(claims).toContain('relatedClaimsTop: entitiesOrderedByPropertyConnection');
    expect(claims).toMatch(/relatedClaimsTop: entitiesOrderedByPropertyConnection\([\s\S]*?filter: \$relatedFilter/);
    expect(claims).toMatch(/relatedClaimsTop: entitiesOrderedByPropertyConnection\([\s\S]*?entityIds: \$entityIds/);
    expect(claims).not.toContain('topicClaimsTop: entitiesOrderedByPropertyConnection');
    expect(claims).not.toContain('extractedClaimsTop: entitiesOrderedByPropertyConnection');
    expect(claims).toContain('@skip(if: $skipTopicClaims)');
    expect(claims).toContain('@skip(if: $skipExtractedClaims)');
    expect(claims.match(/matchingRelations: relationsList/g)).toHaveLength(3);
    expect(debates).toContain('debates: entitiesConnection');
    expect(debates).toContain('orderBy: $orderBy');
    expect(debates).toContain('debatesTop: entitiesOrderedByPropertyConnection');
    expect(claims).not.toContain('scoreValues');
    expect(debates).not.toContain('scoreValues');
    expect(debates.match(/matchingRelations: relationsList/g)).toHaveLength(2);
    expect(counts.match(/distinctCount/g)).toHaveLength(2);
    expect(counts.match(/fromEntityId/g)).toHaveLength(2);
  });

  it('uses Best by default and exposes the exact server orders for Best and New', () => {
    expect(claimRecordOrderBy('best')).toEqual([
      EntitiesOrderBy.RankingScoreDesc,
      EntitiesOrderBy.UpdatedAtDesc,
      EntitiesOrderBy.IdAsc,
    ]);
    expect(claimRecordOrderBy('new')).toEqual([EntitiesOrderBy.CreatedAtDesc, EntitiesOrderBy.IdAsc]);
  });

  it('scopes both related-claim paths to the space and excludes the current claim', () => {
    const filters = claimRecordFilters({
      claimId: CLAIM_ID,
      directDebates: { [SPACE_ID]: [DEBATE_ID] },
      spaceIds: [SPACE_ID],
      topicIds: [TOPIC_ID],
      filterTopicIds: [],
    });

    expect(filters.topicClaims).toEqual({
      or: [
        {
          id: { isNot: CLAIM_ID },
          typeIds: { overlaps: [CLAIM_TYPE_ID] },
          spaceIds: { overlaps: [SPACE_ID] },
          and: [
            {
              relations: {
                some: {
                  typeId: { is: TOPICS_PROPERTY_ID },
                  spaceId: { is: SPACE_ID },
                  toEntityId: { in: [TOPIC_ID] },
                },
              },
            },
          ],
        },
      ],
    });
    expect(filters.extractedClaims).toEqual({
      or: [
        {
          id: { isNot: CLAIM_ID },
          typeIds: { overlaps: [CLAIM_TYPE_ID] },
          spaceIds: { overlaps: [SPACE_ID] },
          and: [
            {
              relations: {
                some: {
                  typeId: { is: SOURCES_PROPERTY_ID },
                  spaceId: { is: SPACE_ID },
                  toEntityId: { in: [DEBATE_ID] },
                },
              },
            },
          ],
        },
      ],
    });
    expect(filters.relatedClaims).toEqual({
      or: [
        {
          id: { isNot: CLAIM_ID },
          typeIds: { overlaps: [CLAIM_TYPE_ID] },
          spaceIds: { overlaps: [SPACE_ID] },
          or: [
            {
              relations: {
                some: {
                  typeId: { is: TOPICS_PROPERTY_ID },
                  spaceId: { is: SPACE_ID },
                  toEntityId: { in: [TOPIC_ID] },
                },
              },
            },
            {
              relations: {
                some: {
                  typeId: { is: SOURCES_PROPERTY_ID },
                  spaceId: { is: SPACE_ID },
                  toEntityId: { in: [DEBATE_ID] },
                },
              },
            },
          ],
        },
      ],
    });

    expect(filters.claimRelations.or).toHaveLength(2);
    expect(filters.claimRelations.or?.[0]).toMatchObject({
      typeId: { is: TOPICS_PROPERTY_ID },
      spaceId: { is: SPACE_ID },
      toEntityId: { in: [TOPIC_ID] },
      fromEntity: {
        id: { isNot: CLAIM_ID },
        typeIds: { overlaps: [CLAIM_TYPE_ID] },
        spaceIds: { overlaps: [SPACE_ID] },
      },
    });
    expect(filters.claimRelations.or?.[1]).toMatchObject({
      typeId: { is: SOURCES_PROPERTY_ID },
      spaceId: { is: SPACE_ID },
      fromEntity: { id: { isNot: CLAIM_ID } },
    });
    expect(filters.claimTopicRelations).toEqual({
      or: [
        {
          typeId: { is: TOPICS_PROPERTY_ID },
          spaceId: { is: SPACE_ID },
          fromEntity: {
            id: { isNot: CLAIM_ID },
            typeIds: { overlaps: [CLAIM_TYPE_ID] },
            spaceIds: { overlaps: [SPACE_ID] },
            or: [
              {
                relations: {
                  some: {
                    typeId: { is: TOPICS_PROPERTY_ID },
                    spaceId: { is: SPACE_ID },
                    toEntityId: { in: [TOPIC_ID] },
                  },
                },
              },
              {
                relations: {
                  some: {
                    typeId: { is: SOURCES_PROPERTY_ID },
                    spaceId: { is: SPACE_ID },
                    toEntityId: { in: [DEBATE_ID] },
                  },
                },
              },
            ],
          },
        },
      ],
    });
  });

  it('matches extracted claims by resolved debate ids, per space', () => {
    const otherSpace = 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
    const filters = claimRecordFilters({
      claimId: CLAIM_ID,
      spaceIds: [SPACE_ID, otherSpace],
      topicIds: [],
      filterTopicIds: [],
      directDebates: { [SPACE_ID]: [DEBATE_ID] },
    });

    expect(filters.claimRelations.or?.map(branch => branch.toEntityId)).toEqual([
      { in: [DEBATE_ID] },
      // A space without a direct debate matches nothing on this path rather than every debate.
      { in: [] },
    ]);
    expect(JSON.stringify(filters)).not.toContain('"toEntity":{"typeIds"');
  });

  it('bounds the Topics facet by candidate ids only when they were resolved', () => {
    const base = { claimId: CLAIM_ID, spaceIds: [SPACE_ID], topicIds: [TOPIC_ID], filterTopicIds: [] };
    const bounded = claimRecordFilters({ ...base, directDebates: {}, candidateClaimIds: ['f'.repeat(32)] });
    const unbounded = claimRecordFilters({ ...base, directDebates: {}, candidateClaimIds: null });

    expect(bounded.claimTopicRelations.or?.[0].fromEntityId).toEqual({ in: ['f'.repeat(32)] });
    expect(bounded.claimTopicRelations.or?.[0].fromEntity).toEqual(unbounded.claimTopicRelations.or?.[0].fromEntity);
    expect(unbounded.claimTopicRelations.or?.[0].fromEntityId).toBeUndefined();
    // Candidates narrow only the facet; the counts and pages keep their own predicates.
    expect(bounded.claimRelations).toEqual(unbounded.claimRelations);
  });

  it('decodes direct debates by space and drops candidates past the limit', () => {
    expect(
      decodeClaimRecordDirectDebates({
        relationsConnection: {
          nodes: [
            { fromEntityId: 'dddddddd-dddd-dddd-dddd-dddddddddddd', spaceId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' },
            { fromEntityId: DEBATE_ID, spaceId: SPACE_ID },
            null,
          ],
        },
      })
    ).toEqual({ [SPACE_ID]: [DEBATE_ID] });

    const page = (hasNextPage: boolean, ids: string[]) => ({
      pageInfo: { hasNextPage },
      nodes: ids.map(fromEntityId => ({ fromEntityId })),
    });
    expect(decodeClaimRecordCandidates({ topic: page(false, ['b', 'a']), extracted: page(false, ['a']) })).toEqual([
      'a',
      'b',
    ]);
    expect(decodeClaimRecordCandidates({ topic: page(true, ['a']), extracted: page(false, []) })).toBeNull();
    expect(decodeClaimRecordCandidates({ topic: page(false, []), extracted: page(true, ['a']) })).toBeNull();
  });

  it('omits only the topic branch when there are no topics', () => {
    const filters = claimRecordFilters({
      claimId: CLAIM_ID,
      directDebates: { [SPACE_ID]: [DEBATE_ID] },
      spaceIds: [SPACE_ID],
      topicIds: [],
      filterTopicIds: [],
    });

    expect(filters.hasTopics).toBe(false);
    expect(filters.relatedClaims.or?.[0]?.or).toBeUndefined();
    expect(filters.relatedClaims.or?.[0]?.and).toHaveLength(1);
    expect(filters.relatedClaims.or?.[0]?.and?.[0]).toMatchObject({
      relations: { some: { typeId: { is: SOURCES_PROPERTY_ID } } },
    });
    expect(filters.claimRelations.or).toHaveLength(1);
    expect(filters.claimRelations.or?.[0]).toMatchObject({ typeId: { is: SOURCES_PROPERTY_ID } });
    expect(filters.debates.relations?.some?.toEntity).toEqual({ id: { is: CLAIM_ID } });
    expect(filters.debateRelations.toEntity).toEqual({ id: { is: CLAIM_ID } });
  });

  it('drops the empty extracted branch so a topic-only record has no union to plan around', () => {
    const filters = claimRecordFilters({
      claimId: CLAIM_ID,
      directDebates: {},
      spaceIds: [SPACE_ID],
      topicIds: [TOPIC_ID],
      filterTopicIds: [],
    });

    expect(filters.relatedClaims.or?.[0]?.or).toBeUndefined();
    expect(JSON.stringify(filters.relatedClaims)).not.toContain(SOURCES_PROPERTY_ID);
    expect(filters.claimRelations.or).toHaveLength(1);
    expect(filters.claimRelations.or?.[0]).toMatchObject({ toEntityId: { in: [TOPIC_ID] } });
    expect(JSON.stringify(filters.claimTopicRelations)).not.toContain(SOURCES_PROPERTY_ID);
  });

  it('keeps Debates scoped to the viewed claim even when Related claims has topics', () => {
    const filters = claimRecordFilters({
      claimId: CLAIM_ID,
      directDebates: { [SPACE_ID]: [DEBATE_ID] },
      spaceIds: [SPACE_ID],
      topicIds: [TOPIC_ID],
      filterTopicIds: [],
    });

    expect(filters.debates.relations?.some?.toEntity).toEqual({ id: { is: CLAIM_ID } });
    expect(filters.debateRelations.toEntity).toEqual({ id: { is: CLAIM_ID } });
  });

  it('decodes the spaces whose relations actually matched the record filter', () => {
    const secondSpace = 'dddddddddddddddddddddddddddddddd';
    const page = decodeClaimRecordClaims({
      topicClaims: {
        nodes: [
          {
            id: 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
            name: 'A related claim',
            description: null,
            spaceIds: [SPACE_ID, secondSpace],
            createdAt: '1788802463',
            backlinks: { totalCount: 0 },
            types: [],
            valuesList: [],
            relationsList: [],
            matchingRelations: [{ spaceId: secondSpace }, { spaceId: secondSpace }],
            rankingScore: 10,
            scoreValues: [],
            updatedAt: '2026-01-01T00:00:00Z',
          },
        ],
        pageInfo: { endCursor: null, hasNextPage: false },
      },
    });

    expect(page.topicClaims.entities[0]?.matchingSpaceIds).toEqual([secondSpace]);
  });

  it('decodes the combined server-ranked Top connection as the Related claims page', () => {
    const page = decodeClaimRecordClaims({
      relatedClaimsTop: {
        nodes: [
          {
            id: 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
            name: 'A top related claim',
            description: null,
            spaceIds: [SPACE_ID],
            createdAt: '1788802463',
            backlinks: { totalCount: 0 },
            types: [],
            valuesList: [],
            relationsList: [],
            matchingRelations: [{ spaceId: SPACE_ID }],
            rankingScore: 10,
            updatedAt: '2026-01-01T00:00:00Z',
          },
        ],
        pageInfo: { endCursor: 'next', hasNextPage: true },
      },
    });

    expect(page.topicClaims.entities.map(entity => entity.id)).toEqual(['eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee']);
    expect(page.topicClaims).toMatchObject({ endCursor: 'next', hasNextPage: true });
    expect(page.extractedClaims.entities).toEqual([]);
  });

  it('requires every selected topic in the same selected space', () => {
    const secondSpace = 'dddddddddddddddddddddddddddddddd';
    const secondTopic = 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
    const filters = claimRecordFilters({
      claimId: CLAIM_ID,
      directDebates: { [SPACE_ID]: [DEBATE_ID] },
      spaceIds: [SPACE_ID, secondSpace],
      topicIds: [TOPIC_ID],
      filterTopicIds: [TOPIC_ID, secondTopic],
    });

    const branches = filters.topicClaims.or ?? [];
    expect(branches).toHaveLength(2);
    expect(branches[0]).toMatchObject({
      spaceIds: { overlaps: [SPACE_ID] },
      and: [
        { relations: { some: { spaceId: { is: SPACE_ID }, toEntityId: { in: [TOPIC_ID] } } } },
        { relations: { some: { spaceId: { is: SPACE_ID }, toEntityId: { is: TOPIC_ID } } } },
        { relations: { some: { spaceId: { is: SPACE_ID }, toEntityId: { is: secondTopic } } } },
      ],
    });
    expect(branches[1]).toMatchObject({ spaceIds: { overlaps: [secondSpace] } });

    // The topic facet uses the same-space union population and includes every active topic, so
    // each count is the number of complete Related claims matches rather than a loaded-page tally.
    expect(filters.claimTopicRelations.or).toHaveLength(2);
    expect(filters.claimTopicRelations.or?.[0]).toMatchObject({
      typeId: { is: TOPICS_PROPERTY_ID },
      spaceId: { is: SPACE_ID },
      fromEntity: {
        spaceIds: { overlaps: [SPACE_ID] },
        and: [
          { relations: { some: { spaceId: { is: SPACE_ID }, toEntityId: { is: TOPIC_ID } } } },
          { relations: { some: { spaceId: { is: SPACE_ID }, toEntityId: { is: secondTopic } } } },
        ],
      },
    });
  });

  it('decodes exact distinct counts without mistaking malformed data for a result', () => {
    expect(
      decodeClaimRecordCounts({
        claims: { aggregates: { distinctCount: { fromEntityId: '42' } } },
        debates: { aggregates: { distinctCount: { fromEntityId: '7' } } },
      })
    ).toEqual({ claims: 42, debates: 7 });

    expect(() =>
      decodeClaimRecordCounts({ claims: { aggregates: { distinctCount: { fromEntityId: 'not-a-count' } } } })
    ).toThrow('claim record count');
  });
});

describe('claim record ranked union', () => {
  it('dedupes claims found through both paths before applying global Best order', () => {
    const topic = [
      { id: '11111111111111111111111111111111', rankingScore: 4, updatedAt: '2026-01-01T00:00:00Z' },
      { id: '22222222222222222222222222222222', rankingScore: 2, updatedAt: '2026-03-01T00:00:00Z' },
    ];
    const extracted = [
      { id: '22222222-2222-2222-2222-222222222222', rankingScore: 2, updatedAt: '2026-03-01T00:00:00Z' },
      { id: '33333333333333333333333333333333', rankingScore: 9, updatedAt: '2025-01-01T00:00:00Z' },
    ];

    expect(mergeSortedRecordEntities('best', topic, extracted).map(entity => entity.id)).toEqual([
      '33333333333333333333333333333333',
      '11111111111111111111111111111111',
      '22222222222222222222222222222222',
    ]);
  });

  it('puts unscored claims after scored claims and gives ties a deterministic order', () => {
    const rows = [
      { id: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', rankingScore: null, updatedAt: '2026-01-01T00:00:00Z' },
      { id: 'cccccccccccccccccccccccccccccccc', rankingScore: 1, updatedAt: '2026-01-01T00:00:00Z' },
      { id: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', rankingScore: null, updatedAt: '2026-02-01T00:00:00Z' },
    ];

    expect(mergeSortedRecordEntities('best', rows).map(entity => entity.id)).toEqual([
      'cccccccccccccccccccccccccccccccc',
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    ]);
  });

  it('preserves server-ranked Top order and merges New by its server sort values', () => {
    const rows = [
      {
        id: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        rankingScore: 100,
        score: 1,
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
      {
        id: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        rankingScore: 1,
        score: 9,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
    ];

    expect(mergeSortedRecordEntities('top', rows).map(entity => entity.id)).toEqual([
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    ]);
    expect(mergeSortedRecordEntities('new', rows).map(entity => entity.id)).toEqual([
      'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    ]);
  });

  it('continues each source with its own cursor and stops completed sources', () => {
    expect(
      nextClaimRecordClaimsPageParam({
        topicClaims: { entities: [], endCursor: 'topic-next', hasNextPage: true },
        extractedClaims: { entities: [], endCursor: null, hasNextPage: false },
      })
    ).toEqual({ topicAfter: 'topic-next', extractedAfter: null, skipTopicClaims: false, skipExtractedClaims: true });

    expect(
      nextClaimRecordClaimsPageParam({
        topicClaims: { entities: [], endCursor: null, hasNextPage: false },
        extractedClaims: { entities: [], endCursor: null, hasNextPage: false },
      })
    ).toBeUndefined();
  });
});
