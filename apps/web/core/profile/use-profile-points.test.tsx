import { renderHook } from '@testing-library/react';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const gates = vi.hoisted(() => ({ isTestnet: true, flag: true }));

vi.mock('~/core/sdk/geo-network', () => ({
  get IS_TESTNET() {
    return gates.isTestnet;
  },
}));
vi.mock('~/core/state/feature-flags', () => ({ useFeatureFlag: () => gates.flag }));

const { useProfilePointsEnabled } = await import('./use-profile-points');

beforeEach(() => {
  gates.isTestnet = true;
  gates.flag = true;
});

describe('useProfilePointsEnabled', () => {
  it('is on for a personal space on testnet with the flag on', () => {
    expect(renderHook(() => useProfilePointsEnabled('PERSONAL')).result.current).toBe(true);
  });

  it('is off while the flag is off', () => {
    gates.flag = false;
    expect(renderHook(() => useProfilePointsEnabled('PERSONAL')).result.current).toBe(false);
  });

  it('is off on mainnet whatever the flag says', () => {
    gates.isTestnet = false;
    expect(renderHook(() => useProfilePointsEnabled('PERSONAL')).result.current).toBe(false);
  });

  it('is off for a DAO space, since points belong to people', () => {
    expect(renderHook(() => useProfilePointsEnabled('DAO')).result.current).toBe(false);
  });
});
