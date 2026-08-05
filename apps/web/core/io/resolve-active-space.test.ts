import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import * as Effect from 'effect/Effect';

import { resolveActiveSpace } from './queries';

const DEAD_SPACE_ID = '2416bbbc41ac4cb5aff9f569a103b0df';
const LIVE_SPACE_ID = '997f43342770848fbb7986299eeef56e';
const ADDRESS = '0x90D1Bc38f9DcA44842Eba8C6FF2296338098A7De';

const isSpaceActiveOnChain = vi.fn<(spaceId: string) => Promise<boolean>>();

// Mirrors the real duplicate: the same account indexed twice under different address
// casing, one row retired on-chain by overrideSpaceId and the other live.
vi.mock('~/core/sdk/geo-network', () => ({
  isSpaceActiveOnChain: (spaceId: string) => isSpaceActiveOnChain(spaceId),
}));

function makeRemoteSpace(id: string, address: string) {
  return {
    id,
    type: 'PERSONAL',
    address,
    topicId: null,
    members: { totalCount: 0 },
    membersList: [],
    editors: { totalCount: 0 },
    editorsList: [],
    page: {
      id: '00000000000000000000000000000003',
      name: 'Personal space',
      description: null,
      types: [],
      spaceIds: [id],
      valuesList: [],
      relationsList: [],
      updatedAt: '1712345678',
    },
  };
}

const deadRow = makeRemoteSpace(DEAD_SPACE_ID, ADDRESS);
const liveRow = makeRemoteSpace(LIVE_SPACE_ID, ADDRESS.toLowerCase());

beforeEach(() => {
  isSpaceActiveOnChain.mockReset();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('resolveActiveSpace', () => {
  it('returns null when the address has no indexed space', async () => {
    await expect(Effect.runPromise(resolveActiveSpace([], ADDRESS))).resolves.toBeNull();
    expect(isSpaceActiveOnChain).not.toHaveBeenCalled();
  });

  it('takes the only row without an on-chain probe', async () => {
    const space = await Effect.runPromise(resolveActiveSpace([liveRow], ADDRESS));

    expect(space?.id).toBe(LIVE_SPACE_ID);
    // The healthy path must not pay for an RPC round trip.
    expect(isSpaceActiveOnChain).not.toHaveBeenCalled();
  });

  it('picks the on-chain active space when the index returns a retired duplicate first', async () => {
    isSpaceActiveOnChain.mockImplementation(async id => id === LIVE_SPACE_ID);

    const space = await Effect.runPromise(resolveActiveSpace([deadRow, liveRow], ADDRESS));

    // Index order would have handed back the dead space and bricked every write.
    expect(space?.id).toBe(LIVE_SPACE_ID);
    expect(isSpaceActiveOnChain).toHaveBeenCalledTimes(2);
  });

  it('keeps the active space when it already sorts first', async () => {
    isSpaceActiveOnChain.mockImplementation(async id => id === LIVE_SPACE_ID);

    const space = await Effect.runPromise(resolveActiveSpace([liveRow, deadRow], ADDRESS));

    expect(space?.id).toBe(LIVE_SPACE_ID);
  });

  it('falls back to index order when neither row is active on-chain', async () => {
    isSpaceActiveOnChain.mockResolvedValue(false);

    const space = await Effect.runPromise(resolveActiveSpace([deadRow, liveRow], ADDRESS));

    expect(space?.id).toBe(DEAD_SPACE_ID);
  });

  it('falls back to index order when the probe throws', async () => {
    isSpaceActiveOnChain.mockRejectedValue(new Error('rpc down'));

    const space = await Effect.runPromise(resolveActiveSpace([deadRow, liveRow], ADDRESS));

    // Degrading to today's behavior is correct: an RPC outage must not block sign-in.
    expect(space?.id).toBe(DEAD_SPACE_ID);
  });
});
