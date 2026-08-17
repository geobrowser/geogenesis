import { QueryClient } from '@tanstack/react-query';

import { Effect } from 'effect';
import { atom } from 'jotai';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ensureSpaceMembership, resetAutoRequestedMemberships } from './request-space-membership';

const PERSONAL_SPACE_ID = 'd4bee0928fb5405baba3b1513f085835';
const DAO_SPACE_ID = '1234567890abcdef1234567890abcdef';
const OTHER_DAO_SPACE_ID = 'fedcba0987654321fedcba0987654321';

const mocks = vi.hoisted(() => ({
  activeMemberRequest: vi.fn(),
  canEdit: false,
  proposeRequestMembership: vi.fn<
    (args: { authorSpaceId: string; spaceId: string }) => { to: string; calldata: string }
  >(() => ({ to: '0x1234', calldata: '0xabcd' })),
  spaceType: 'DAO' as string,
}));

vi.mock('~/core/access/space-access', async importOriginal => {
  const actual = await importOriginal<typeof import('~/core/access/space-access')>();
  return {
    ...actual,
    getSpaceAccessById: () => Effect.succeed({ isEditor: false, isMember: mocks.canEdit, canEdit: mocks.canEdit }),
  };
});

vi.mock('~/core/io/queries', () => ({
  getSpace: (spaceId: string) => Effect.succeed({ id: spaceId, type: mocks.spaceType }),
}));

vi.mock('~/core/io/subgraph/fetch-proposed-members', () => ({
  fetchActiveMemberRequest: (...args: unknown[]) => mocks.activeMemberRequest(...args),
}));

vi.mock('~/core/sdk/geo-client', () => ({
  geo: { daoSpaces: { proposeRequestMembership: mocks.proposeRequestMembership } },
}));

// The real atom persists to localStorage, which jsdom doesn't reliably provide here.
vi.mock('~/core/state/requested-membership', () => ({
  requestedMembershipSpacesAtom: atom<unknown[]>([]),
  upsertRequestedMembershipSpace: (current: unknown[], space: unknown) => [...current, space],
}));

vi.mock('~/core/telemetry/effect-runtime', () => ({
  runEffectEither: (effect: Effect.Effect<unknown, unknown>) => Effect.runPromise(Effect.either(effect)),
}));

const tx = vi.fn<() => Effect.Effect<string, Error>>(() => Effect.succeed('0xtransaction'));

function run(spaceId: string | null = DAO_SPACE_ID, personalSpaceId: string | null = PERSONAL_SPACE_ID) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ensureSpaceMembership({ spaceId, personalSpaceId, tx, queryClient });
}

beforeEach(() => {
  resetAutoRequestedMemberships();
  mocks.activeMemberRequest.mockReset();
  mocks.activeMemberRequest.mockResolvedValue(null);
  mocks.proposeRequestMembership.mockClear();
  mocks.canEdit = false;
  mocks.spaceType = 'DAO';
  tx.mockReset();
  tx.mockReturnValue(Effect.succeed('0xtransaction'));
});

describe('ensureSpaceMembership', () => {
  it('requests membership of a DAO space the user has no access to', async () => {
    await expect(run()).resolves.toBe(false);

    expect(mocks.proposeRequestMembership).toHaveBeenCalledWith({
      authorSpaceId: PERSONAL_SPACE_ID,
      spaceId: DAO_SPACE_ID,
    });
    expect(tx).toHaveBeenCalledWith({ to: '0x1234', data: '0xabcd' });
  });

  it('does nothing when the user can already edit the space', async () => {
    mocks.canEdit = true;

    await expect(run()).resolves.toBe(true);

    expect(mocks.proposeRequestMembership).not.toHaveBeenCalled();
  });

  it('does not request membership of a personal space', async () => {
    mocks.spaceType = 'PERSONAL';

    await expect(run()).resolves.toBe(false);

    expect(mocks.proposeRequestMembership).not.toHaveBeenCalled();
  });

  it('skips the request while an earlier one is still under vote', async () => {
    mocks.activeMemberRequest.mockResolvedValue({ proposalId: 'proposal-1', isVotingEnded: false });

    await run();

    expect(mocks.proposeRequestMembership).not.toHaveBeenCalled();
  });

  it('re-requests when the previous request is stuck past its voting period', async () => {
    mocks.activeMemberRequest.mockResolvedValue({ proposalId: 'proposal-1', isVotingEnded: true });

    await run();

    expect(mocks.proposeRequestMembership).toHaveBeenCalledOnce();
  });

  it('requests once per space and account, however many times it is called', async () => {
    await run();
    await run();
    await run(OTHER_DAO_SPACE_ID);

    expect(mocks.proposeRequestMembership).toHaveBeenCalledTimes(2);
  });

  it('does nothing without a personal space or a target space', async () => {
    await expect(run(DAO_SPACE_ID, null)).resolves.toBe(false);
    await expect(run(null)).resolves.toBe(false);

    expect(mocks.proposeRequestMembership).not.toHaveBeenCalled();
  });

  it('swallows a failed request rather than breaking the action that triggered it', async () => {
    tx.mockReturnValue(Effect.fail(new Error('user rejected')));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(run()).resolves.toBe(false);

    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
