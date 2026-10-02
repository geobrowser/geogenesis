import { beforeEach, describe, expect, it } from 'vitest';

import { readLocallyDebatedClaimIds, recordPairDebatedClaim } from './use-pair-debated-claims';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 1, 18, 0);

describe('the local record of claims a pair debated', () => {
  beforeEach(() => localStorage.clear());

  it('reads back what was recorded, from either side of the pair', () => {
    recordPairDebatedClaim('space-a', 'space-b', 'claim-1', NOW);

    expect(readLocallyDebatedClaimIds('space-a', 'space-b', NOW)).toEqual(['claim1']);
    expect(readLocallyDebatedClaimIds('space-b', 'space-a', NOW)).toEqual(['claim1']);
  });

  it('keeps each pair to itself', () => {
    recordPairDebatedClaim('space-a', 'space-b', 'claim-1', NOW);

    expect(readLocallyDebatedClaimIds('space-a', 'space-c', NOW)).toEqual([]);
  });

  it('treats both spellings of an id as one', () => {
    recordPairDebatedClaim(
      '019fedae-72b6-7ab2-927a-df044d57c566',
      'space-b',
      '019fedb1-0c41-7f3e-9a11-2c7d5e8b4419',
      NOW
    );
    recordPairDebatedClaim('019fedae72b67ab2927adf044d57c566', 'space-b', '019fedb10c417f3e9a112c7d5e8b4419', NOW);

    expect(readLocallyDebatedClaimIds('019fedae72b67ab2927adf044d57c566', 'space-b', NOW)).toEqual([
      '019fedb10c417f3e9a112c7d5e8b4419',
    ]);
  });

  // The graph has had it for days by then.
  it('forgets a claim after a week', () => {
    recordPairDebatedClaim('space-a', 'space-b', 'claim-1', NOW);

    expect(readLocallyDebatedClaimIds('space-a', 'space-b', NOW + 6 * DAY)).toEqual(['claim1']);
    expect(readLocallyDebatedClaimIds('space-a', 'space-b', NOW + 8 * DAY)).toEqual([]);
  });

  it('drops expired entries from every pair when it writes', () => {
    recordPairDebatedClaim('space-a', 'space-b', 'claim-1', NOW);
    recordPairDebatedClaim('space-c', 'space-d', 'claim-2', NOW + 8 * DAY);

    expect(localStorage.getItem('geogenesis.debates.pair-debated-claims.v1')).not.toContain('claim1');
  });

  it('survives storage holding something it did not write', () => {
    localStorage.setItem('geogenesis.debates.pair-debated-claims.v1', '{not json');

    expect(readLocallyDebatedClaimIds('space-a', 'space-b', NOW)).toEqual([]);
    recordPairDebatedClaim('space-a', 'space-b', 'claim-1', NOW);
    expect(readLocallyDebatedClaimIds('space-a', 'space-b', NOW)).toEqual(['claim1']);
  });
});
