import { describe, expect, it } from 'vitest';

import { CLAIM_TYPE_ID } from '~/core/claims/ontology';
import { SOURCES_PROPERTY_ID } from '~/core/debates/ontology';

import { bestRecordRows, claimsExtractedFromDebatesWhere, relatedClaimIds } from './use-claim-record';

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
