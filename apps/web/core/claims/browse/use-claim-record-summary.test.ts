import { print } from 'graphql';
import { describe, expect, it } from 'vitest';

import { TOPICS_PROPERTY_ID } from '~/core/claims/ontology';

import {
  claimRecordSummaryDocument,
  claimRecordSummaryFilters,
  decodeClaimRecordSummary,
} from './use-claim-record-summary';

describe('claim record summary query', () => {
  it('asks the server for exact totals and only one bounded Best page', () => {
    const source = print(claimRecordSummaryDocument);

    // Two record totals plus the Explore projection's per-card comment count.
    expect(source.match(/totalCount/g)).toHaveLength(3);
    expect(source.match(/first: \$first/g)).toHaveLength(2);
    expect(source.match(/orderBy: \[RANKING_SCORE_DESC\]/g)).toHaveLength(2);
    expect(source).not.toContain('$after');
    expect(source).toContain('relatedClaims: entitiesConnection');
    expect(source).toContain('debates: entitiesConnection');
    expect(source.match(/\.\.\.ClaimRecordSummaryEntity @include\(if: \$hydrateRows\)/g)).toHaveLength(2);
  });

  it('omits the topic branch when a claim has no topics', () => {
    const filters = claimRecordSummaryFilters({ claimId: 'claim-1', spaceId: 'space-1', topicIds: [] });

    expect(JSON.stringify(filters)).not.toContain(TOPICS_PROPERTY_ID);
    expect(filters.relatedClaimsFilter).toMatchObject({ id: { isNot: 'claim-1' } });
  });

  it('shares the topic-and-Debate-tag definition between claim and debate summaries', () => {
    const filters = claimRecordSummaryFilters({ claimId: 'claim-1', spaceId: 'space-1', topicIds: ['topic-1'] });
    const serialized = JSON.stringify(filters);

    expect(serialized.match(new RegExp(TOPICS_PROPERTY_ID, 'g'))).toHaveLength(2);
    expect(serialized.match(/topic-1/g)).toHaveLength(2);
  });

  it('keeps server totals while normalizing duplicate page ids defensively', () => {
    expect(
      decodeClaimRecordSummary({
        relatedClaims: {
          totalCount: 2,
          nodes: [
            { id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' },
            { id: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
            { id: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' },
          ],
        },
        debates: { totalCount: 1, nodes: [{ id: 'cccccccccccccccccccccccccccccccc' }, null] },
      })
    ).toEqual({
      relatedClaimIds: ['aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'],
      debateIds: ['cccccccccccccccccccccccccccccccc'],
      claimRows: [],
      debateRows: [],
      claimsTotal: 2,
      debatesTotal: 1,
    });
  });

  it('rejects a missing count instead of presenting a false zero', () => {
    expect(() =>
      decodeClaimRecordSummary({
        relatedClaims: { nodes: [] },
        debates: { totalCount: 0, nodes: [] },
      })
    ).toThrow('invalid related claims count');
  });
});
