import { act, renderHook } from '@testing-library/react';

import { Effect } from 'effect';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useProposeVotingSettings } from './use-propose-voting-settings';

const mocks = vi.hoisted(() => ({
  accountArrives: Promise.resolve(null) as Promise<unknown>,
  sendUserOperation: vi.fn(async () => '0xhash'),
}));

vi.mock('./cached-write-identity', () => ({ awaitSigningAccount: () => mocks.accountArrives }));
vi.mock('./use-smart-account', () => ({ useSmartAccount: () => ({ smartAccount: null }) }));
vi.mock('./use-personal-space-id', () => ({ usePersonalSpaceId: () => ({ personalSpaceId: 'a'.repeat(32) }) }));
vi.mock('~/core/sdk/geo-client', () => ({
  geo: { daoSpaces: { proposeUpdateVotingSettings: () => ({ to: '0xto', calldata: '0xdata' }) } },
}));
vi.mock('~/core/telemetry/effect-runtime', () => ({
  runEffectEither: (effect: Effect.Effect<unknown, unknown>) => Effect.runPromise(Effect.either(effect)),
}));

const ARGS = { spaceId: 'b'.repeat(32), votingSettings: {} as never };

beforeEach(() => {
  mocks.sendUserOperation.mockClear();
});

describe('useProposeVotingSettings', () => {
  it('is pending while it waits for the account', async () => {
    let arrive!: (account: unknown) => void;
    mocks.accountArrives = new Promise(resolve => (arrive = resolve));
    const { result } = renderHook(() => useProposeVotingSettings());

    let proposing!: Promise<unknown>;
    act(() => {
      proposing = result.current.propose(ARGS);
    });
    expect(result.current.isPending).toBe(true);

    await act(async () => {
      arrive({ account: { address: '0xabc' }, sendUserOperation: mocks.sendUserOperation });
      await proposing;
    });

    expect(result.current.isPending).toBe(false);
    expect(mocks.sendUserOperation).toHaveBeenCalledOnce();
  });

  it('stops being pending when the account could not be loaded', async () => {
    mocks.accountArrives = Promise.resolve(null);
    const { result } = renderHook(() => useProposeVotingSettings());

    await act(async () => {
      await expect(result.current.propose(ARGS)).rejects.toThrow('wallet is not connected');
    });

    expect(result.current.isPending).toBe(false);
  });
});
