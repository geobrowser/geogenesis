import { describe, expect, it } from 'vitest';

import { CLAIM_TYPE_ID } from '~/core/claims/ontology';
import { SOURCES_PROPERTY_ID } from '~/core/debates/ontology';

import {
  CLAIM_RECORD_PAGE_SIZE,
  bestRecordRows,
  claimsExtractedFromDebatesWhere,
  rankedRecordPage,
  relatedClaimIds,
} from './use-claim-record';

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

  it('keeps named neighbours after the source in query order', () => {
    const ids = relatedClaimIds('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', [
      { id: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', name: 'First neighbour' },
      { id: 'cccccccccccccccccccccccccccccccc', name: null },
      { id: 'dddddddddddddddddddddddddddddddd', name: 'Second neighbour' },
    ]);

    expect(ids).toEqual(['bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', 'dddddddddddddddddddddddddddddddd']);
  });

  it('unions extracted claims with topic-related claims and dedupes normalized ids', () => {
    const ids = relatedClaimIds(
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      [{ id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', name: 'Topic neighbour' }],
      [
        { id: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', name: 'Same extracted claim' },
        { id: 'cccccccccccccccccccccccccccccccc', name: 'Extracted fact' },
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
