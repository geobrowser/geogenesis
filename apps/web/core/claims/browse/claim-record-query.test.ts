import { print } from 'graphql';
import { describe, expect, it } from 'vitest';

import { CLAIM_TYPE_ID, TOPICS_PROPERTY_ID } from '~/core/claims/ontology';
import { DEBATE_CLAIMS_PROPERTY_ID, DEBATE_TYPE_ID, SOURCES_PROPERTY_ID } from '~/core/debates/ontology';

import {
  claimRecordClaimsDocument,
  claimRecordCountsDocument,
  claimRecordDebatesDocument,
  claimRecordFilters,
  decodeClaimRecordCounts,
  mergeRankedRecordEntities,
  nextClaimRecordClaimsPageParam,
} from './claim-record-query';

const CLAIM_ID = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const SPACE_ID = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const TOPIC_ID = 'cccccccccccccccccccccccccccccccc';

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
    expect(claims).toContain('orderBy: [RANKING_SCORE_DESC, UPDATED_AT_DESC, ID_ASC]');
    expect(claims).toContain('@skip(if: $skipTopicClaims)');
    expect(claims).toContain('@skip(if: $skipExtractedClaims)');
    expect(debates).toContain('debates: entitiesConnection');
    expect(debates).toContain('orderBy: [RANKING_SCORE_DESC, UPDATED_AT_DESC, ID_ASC]');
    expect(counts.match(/distinctCount/g)).toHaveLength(2);
    expect(counts.match(/fromEntityId/g)).toHaveLength(2);
  });

  it('scopes both related-claim paths to the space and excludes the current claim', () => {
    const filters = claimRecordFilters({ claimId: CLAIM_ID, spaceId: SPACE_ID, topicIds: [TOPIC_ID] });

    expect(filters.topicClaims).toEqual({
      id: { isNot: CLAIM_ID },
      relations: {
        some: {
          typeId: { is: TOPICS_PROPERTY_ID },
          spaceId: { is: SPACE_ID },
          toEntityId: { in: [TOPIC_ID] },
        },
      },
    });
    expect(filters.extractedClaims).toEqual({
      id: { isNot: CLAIM_ID },
      relations: {
        some: {
          typeId: { is: SOURCES_PROPERTY_ID },
          spaceId: { is: SPACE_ID },
          toEntity: {
            typeIds: { overlaps: [DEBATE_TYPE_ID] },
            spaceIds: { overlaps: [SPACE_ID] },
            relations: {
              some: {
                typeId: { is: DEBATE_CLAIMS_PROPERTY_ID },
                spaceId: { is: SPACE_ID },
                toEntityId: { is: CLAIM_ID },
              },
            },
          },
        },
      },
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
  });

  it('omits only the topic branch when there are no topics', () => {
    const filters = claimRecordFilters({ claimId: CLAIM_ID, spaceId: SPACE_ID, topicIds: [] });

    expect(filters.hasTopics).toBe(false);
    expect(filters.claimRelations.or).toHaveLength(1);
    expect(filters.claimRelations.or?.[0]).toMatchObject({ typeId: { is: SOURCES_PROPERTY_ID } });
    expect(filters.debates.relations?.some?.toEntity).toEqual({ id: { is: CLAIM_ID } });
    expect(filters.debateRelations.toEntity).toEqual({ id: { is: CLAIM_ID } });
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

    expect(mergeRankedRecordEntities(topic, extracted).map(entity => entity.id)).toEqual([
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

    expect(mergeRankedRecordEntities(rows).map(entity => entity.id)).toEqual([
      'cccccccccccccccccccccccccccccccc',
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
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
