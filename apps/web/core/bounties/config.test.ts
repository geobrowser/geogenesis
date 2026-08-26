import { describe, expect, it } from 'vitest';

import { computeBountiesEnabledForNetwork, isBountyEntity } from './config';

describe('computeBountiesEnabledForNetwork', () => {
  it('is a pure network gate: on for testnet, off for mainnet', () => {
    expect(computeBountiesEnabledForNetwork(true)).toBe(true);
    expect(computeBountiesEnabledForNetwork(false)).toBe(false);
  });
});

describe('isBountyEntity', () => {
  it('matches the Bounty type id in dashed or dashless form, and nothing else', () => {
    expect(isBountyEntity([{ id: '808af0ba-4f5c-4a5b-a0f8-95c8c5b1f8d2' }])).toBe(
      isBountyEntity([{ id: '808af0ba4f5c4a5ba0f895c8c5b1f8d2' }])
    );
    expect(isBountyEntity([{ id: 'ffffffffffffffffffffffffffffffff' }])).toBe(false);
    expect(isBountyEntity(undefined)).toBe(false);
  });
});
