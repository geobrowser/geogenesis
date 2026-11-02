import { describe, expect, it } from 'vitest';

import type { DebateClaim } from '../api';
import { claimRowGroups, placedAnswersReady, placedClaimKey, rowsByPlacedClaim } from './tagged-claim-entry';

const A = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const B = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const C1 = 'c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1';
const C2 = 'c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2';

describe('claimRowGroups', () => {
  it('groups by space in a stable order, once per claim, without ids geo-chat refuses', () => {
    expect(
      claimRowGroups([
        { spaceId: B, claimId: C1 },
        { spaceId: A, claimId: C2 },
        { spaceId: B, claimId: C1 },
        { spaceId: B, claimId: 'not-an-id' },
      ])
    ).toEqual([
      { spaceId: A, claimIds: [C2] },
      { spaceId: B, claimIds: [C1] },
    ]);
  });
});

describe('rowsByPlacedClaim', () => {
  it('finds a row by space and claim, whichever spelling either side used', () => {
    const row = { space_id: 'AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA', claim_entity_id: C1 } as DebateClaim;
    const rows = rowsByPlacedClaim([row]);
    expect(rows.get(placedClaimKey({ spaceId: A, claimId: C1 }))).toBe(row);
    expect(rows.get(placedClaimKey({ spaceId: B, claimId: C1 }))).toBeUndefined();
  });
});

describe('placedAnswersReady', () => {
  it('is ready signed out, and signed in only once the account and that space have answered', () => {
    const unresolved = new Set([B]);
    expect(placedAnswersReady({ authenticated: false, accountKey: null }, unresolved, B)).toBe(true);
    expect(placedAnswersReady({ authenticated: true, accountKey: null }, unresolved, A)).toBe(false);
    expect(placedAnswersReady({ authenticated: true, accountKey: 'k' }, unresolved, A)).toBe(true);
    expect(placedAnswersReady({ authenticated: true, accountKey: 'k' }, unresolved, B)).toBe(false);
  });
});
