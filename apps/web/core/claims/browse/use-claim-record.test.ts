import { describe, expect, it, vi } from 'vitest';

import { CLAIM_TYPE_ID } from '~/core/claims/ontology';
import { SOURCES_PROPERTY_ID } from '~/core/debates/ontology';

import {
  CLAIM_RECORD_PAGE_SIZE,
  bestRecordRows,
  claimsExtractedFromDebatesWhere,
  completeRecordQueryPlan,
  refetchFailedRecordQueries,
  retryFailedRecordStage,
  rankedRecordPage,
  relatedClaimIds,
} from './use-claim-record';

describe('completeRecordQueryPlan', () => {
  it('keeps Overview bounded to the summary query', () => {
    expect(completeRecordQueryPlan(null)).toEqual({
      loadClaims: false,
      loadDebates: false,
      loadRelatedClaims: false,
      loadDirectDebates: false,
      loadExtractedClaims: false,
      loadRelatedDebates: false,
    });
  });

  it('loads extracted claims but not related debates for the Related claims tab', () => {
    expect(completeRecordQueryPlan('claims')).toMatchObject({
      loadClaims: true,
      loadDebates: false,
      loadExtractedClaims: true,
      loadRelatedDebates: false,
    });
  });

  it('loads related debates but not extracted claims for the Debates tab', () => {
    expect(completeRecordQueryPlan('debates')).toMatchObject({
      loadClaims: false,
      loadDebates: true,
      loadExtractedClaims: false,
      loadRelatedDebates: true,
    });
  });
});

describe('refetchFailedRecordQueries', () => {
  it('retries every failed discovery stage without re-requesting successful stages', async () => {
    const successfulRefetch = vi.fn(async () => undefined);
    const failedTopicRefetch = vi.fn(async () => undefined);
    const failedDebateRefetch = vi.fn(async () => undefined);

    await refetchFailedRecordQueries([
      { error: null, refetch: successfulRefetch },
      { error: new Error('topic lookup failed'), refetch: failedTopicRefetch },
      { error: new Error('debate lookup failed'), refetch: failedDebateRefetch },
    ]);

    expect(successfulRefetch).not.toHaveBeenCalled();
    expect(failedTopicRefetch).toHaveBeenCalledTimes(1);
    expect(failedDebateRefetch).toHaveBeenCalledTimes(1);
  });
});

describe('retryFailedRecordStage', () => {
  it('retries the earliest failed stage instead of advancing pagination', () => {
    const refetchIds = vi.fn();
    const refetchScores = vi.fn();
    const refetchRows = vi.fn();

    expect(
      retryFailedRecordStage({
        idsError: true,
        scoresError: true,
        rowsError: true,
        refetchIds,
        refetchScores,
        refetchRows,
      })
    ).toBe(true);
    expect(refetchIds).toHaveBeenCalledTimes(1);
    expect(refetchScores).not.toHaveBeenCalled();
    expect(refetchRows).not.toHaveBeenCalled();

    refetchIds.mockClear();
    expect(
      retryFailedRecordStage({
        idsError: false,
        scoresError: true,
        rowsError: true,
        refetchIds,
        refetchScores,
        refetchRows,
      })
    ).toBe(true);
    expect(refetchIds).not.toHaveBeenCalled();
    expect(refetchScores).toHaveBeenCalledTimes(1);
    expect(refetchRows).not.toHaveBeenCalled();

    refetchScores.mockClear();
    expect(
      retryFailedRecordStage({
        idsError: false,
        scoresError: false,
        rowsError: true,
        refetchIds,
        refetchScores,
        refetchRows,
      })
    ).toBe(true);
    expect(refetchIds).not.toHaveBeenCalled();
    expect(refetchScores).not.toHaveBeenCalled();
    expect(refetchRows).toHaveBeenCalledTimes(1);
  });

  it('allows pagination to advance when no stage failed', () => {
    expect(
      retryFailedRecordStage({
        idsError: false,
        scoresError: false,
        rowsError: false,
        refetchIds: vi.fn(),
        refetchScores: vi.fn(),
        refetchRows: vi.fn(),
      })
    ).toBe(false);
  });
});

describe('bestRecordRows', () => {
  const claimA = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  const claimB = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
  const rows = [{ entityId: claimA }, { entityId: claimB }];

  it('orders a complete record by ranking score', () => {
    expect(bestRecordRows(rows, new Map([[claimB, 2]]), false)).toEqual([{ entityId: claimB }, { entityId: claimA }]);
  });

  it('withholds an unranked fallback when the fixed Best lookup fails', () => {
    expect(bestRecordRows(rows, new Map(), true)).toEqual([]);
  });
});

describe('rankedRecordPage', () => {
  const ids = Array.from({ length: CLAIM_RECORD_PAGE_SIZE + 5 }, (_, index) => index.toString(16).padStart(32, '0'));
  const rankings = new Map(ids.map((id, index) => [id, index]));

  it('hydrates only the first bounded Best-ranked page', () => {
    const page = rankedRecordPage(ids, rankings, false, CLAIM_RECORD_PAGE_SIZE);

    expect(page.ids).toHaveLength(CLAIM_RECORD_PAGE_SIZE);
    expect(page.ids[0]).toBe(ids.at(-1));
    expect(page.hasNextPage).toBe(true);
  });

  it('reveals later ids without changing the complete ranking', () => {
    const page = rankedRecordPage(ids, rankings, false, CLAIM_RECORD_PAGE_SIZE * 2);

    expect(page.ids).toHaveLength(ids.length);
    expect(page.ids[0]).toBe(ids.at(-1));
    expect(page.hasNextPage).toBe(false);
  });

  it('does not hydrate fallback-order ids after a ranking failure', () => {
    expect(rankedRecordPage(ids, new Map(), true, CLAIM_RECORD_PAGE_SIZE)).toEqual({
      ids: [],
      hasNextPage: false,
    });
  });
});

describe('relatedClaimIds', () => {
  it('drops the source before counting its related claims', () => {
    const ids = relatedClaimIds('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', [
      { id: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', name: 'The source claim' },
    ]);

    expect(ids).toEqual([]);
    expect(ids).toHaveLength(0);
  });

  it('keeps named and unnamed neighbours after the source in query order', () => {
    const ids = relatedClaimIds('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', [
      { id: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', name: 'First neighbour' },
      { id: 'cccccccccccccccccccccccccccccccc', name: null },
      { id: 'dddddddddddddddddddddddddddddddd', name: 'Second neighbour' },
    ]);

    expect(ids).toEqual([
      'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      'cccccccccccccccccccccccccccccccc',
      'dddddddddddddddddddddddddddddddd',
    ]);
  });

  it('unions unnamed extracted claims with topic-related claims and dedupes normalized ids', () => {
    const ids = relatedClaimIds(
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      [{ id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', name: 'Topic neighbour' }],
      [
        { id: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', name: 'Same extracted claim' },
        { id: 'cccccccccccccccccccccccccccccccc', name: null },
        { id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', name: 'Current claim' },
      ]
    );

    expect(ids).toEqual(['bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', 'cccccccccccccccccccccccccccccccc']);
  });
});

describe('claimsExtractedFromDebatesWhere', () => {
  it('finds every claim sourced from a direct debate in the current space', () => {
    expect(claimsExtractedFromDebatesWhere('space-1', ['debate-1', 'debate-2'])).toEqual({
      types: [{ id: { equals: CLAIM_TYPE_ID } }],
      spaces: [{ equals: 'space-1' }],
      relations: [
        {
          typeOf: { id: { equals: SOURCES_PROPERTY_ID } },
          toEntity: { id: { in: ['debate-1', 'debate-2'] } },
          space: { equals: 'space-1' },
        },
      ],
    });
  });
});
