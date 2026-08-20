import { describe, expect, it } from 'vitest';

import { computeBountiesEnabledForNetwork } from './config';

describe('computeBountiesEnabledForNetwork', () => {
  it('is a pure network gate: on for testnet, off for mainnet', () => {
    expect(computeBountiesEnabledForNetwork(true)).toBe(true);
    expect(computeBountiesEnabledForNetwork(false)).toBe(false);
  });
});
