import type { QueryClient } from '@tanstack/react-query';

import { Effect } from 'effect';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Space } from '~/core/io/dto/spaces';

// `vi.mock` is hoisted, so these run before the dispatcher imports them.
const requestSpaceMembership = vi.fn<(...args: unknown[]) => Promise<void>>(() => Promise.resolve());
vi.mock('~/core/access/request-space-membership', () => ({ requestSpaceMembership }));

const getSpaceAccessById = vi.fn(() => Effect.succeed({ isEditor: false, isMember: false, canEdit: false }));
vi.mock('~/core/access/space-access', async importOriginal => {
  const actual = await importOriginal<typeof import('~/core/access/space-access')>();
  return { ...actual, getSpaceAccessById: (...args: unknown[]) => getSpaceAccessById(...(args as [])) };
});

const fetchActiveMemberRequest = vi.fn<(...args: unknown[]) => Promise<{ isVotingEnded: boolean } | null>>(() =>
  Promise.resolve(null)
);
vi.mock('~/core/io/subgraph/fetch-proposed-members', () => ({ fetchActiveMemberRequest }));

vi.mock('~/core/io/queries', () => ({ getSpace: vi.fn(() => Effect.succeed(null)) }));

const { resolveJoinSpace } = await import('./join-space-dispatcher');

const SPACE_ID = 'c9f267dc1b7a4f3d8e2a5b6c7d8e9f01';
const PERSONAL_SPACE_ID = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';

// Only the fields resolveJoinSpace reads.
function daoSpace(overrides: Partial<Space> = {}): Space {
  return {
    id: SPACE_ID,
    type: 'DAO',
    entity: { name: 'Crypto', image: null },
    ...overrides,
  } as unknown as Space;
}

function deps(space: Space | null, overrides: Record<string, unknown> = {}) {
  const queryClient = {
    fetchQuery: vi.fn(() => (space === null ? Promise.reject(new Error('miss')) : Promise.resolve(space))),
  } as unknown as QueryClient;
  return {
    hasAccount: true,
    personalSpaceId: PERSONAL_SPACE_ID,
    isRegistered: true,
    queryClient,
    tx: vi.fn(() => Effect.succeed('0xhash')),
    ...overrides,
  } as Parameters<typeof resolveJoinSpace>[0];
}

describe('resolveJoinSpace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requestSpaceMembership.mockResolvedValue(undefined);
    getSpaceAccessById.mockReturnValue(Effect.succeed({ isEditor: false, isMember: false, canEdit: false }));
    fetchActiveMemberRequest.mockResolvedValue(null);
  });

  it('requests membership when every check passes', async () => {
    const result = await resolveJoinSpace(deps(daoSpace()), SPACE_ID);
    expect(result).toEqual({ ok: true, status: 'requested', spaceId: SPACE_ID, spaceName: 'Crypto' });
    expect(requestSpaceMembership).toHaveBeenCalledTimes(1);
  });

  it('accepts a dashed uuid and normalizes it', async () => {
    const dashed = 'c9f267dc-1b7a-4f3d-8e2a-5b6c7d8e9f01';
    const result = await resolveJoinSpace(deps(daoSpace()), dashed);
    expect(result).toMatchObject({ ok: true, spaceId: SPACE_ID });
  });

  // Each of these must stop before the transaction — a signature the user did
  // not ask for is the failure mode this tool has to be incapable of.
  describe('does not sign', () => {
    it('on a malformed space id', async () => {
      const result = await resolveJoinSpace(deps(daoSpace()), 'not-a-space');
      expect(result).toEqual({ ok: false, error: 'invalid_input', spaceId: 'not-a-space' });
      expect(requestSpaceMembership).not.toHaveBeenCalled();
    });

    it('when there is no account', async () => {
      const result = await resolveJoinSpace(deps(daoSpace(), { hasAccount: false }), SPACE_ID);
      expect(result).toMatchObject({ ok: false, error: 'not_signed_in' });
      expect(requestSpaceMembership).not.toHaveBeenCalled();
    });

    it('when the personal space is still unregistered', async () => {
      const result = await resolveJoinSpace(deps(daoSpace(), { isRegistered: false }), SPACE_ID);
      expect(result).toMatchObject({ ok: false, error: 'no_personal_space' });
      expect(requestSpaceMembership).not.toHaveBeenCalled();
    });

    it('when the space does not resolve', async () => {
      const result = await resolveJoinSpace(deps(null), SPACE_ID);
      expect(result).toMatchObject({ ok: false, error: 'space_not_found' });
      expect(requestSpaceMembership).not.toHaveBeenCalled();
    });

    it('on a personal space, which has no membership flow', async () => {
      const result = await resolveJoinSpace(deps(daoSpace({ type: 'PERSONAL' })), SPACE_ID);
      expect(result).toMatchObject({ ok: false, error: 'not_joinable', spaceName: 'Crypto' });
      expect(requestSpaceMembership).not.toHaveBeenCalled();
    });

    it('when the user is already a member', async () => {
      getSpaceAccessById.mockReturnValue(Effect.succeed({ isEditor: false, isMember: true, canEdit: true }));
      const result = await resolveJoinSpace(deps(daoSpace()), SPACE_ID);
      expect(result).toMatchObject({ ok: false, error: 'already_member' });
      expect(requestSpaceMembership).not.toHaveBeenCalled();
    });

    it('when a request is already up for a vote', async () => {
      fetchActiveMemberRequest.mockResolvedValue({ isVotingEnded: false });
      const result = await resolveJoinSpace(deps(daoSpace()), SPACE_ID);
      expect(result).toMatchObject({ ok: false, error: 'already_requested' });
      expect(requestSpaceMembership).not.toHaveBeenCalled();
    });
  });

  it('re-requests once a previous vote has ended, so a rejection is not permanent', async () => {
    fetchActiveMemberRequest.mockResolvedValue({ isVotingEnded: true });
    const result = await resolveJoinSpace(deps(daoSpace()), SPACE_ID);
    expect(result).toMatchObject({ ok: true, status: 'requested' });
    expect(requestSpaceMembership).toHaveBeenCalledTimes(1);
  });

  it('reports a failed transaction rather than throwing into the dispatcher', async () => {
    requestSpaceMembership.mockRejectedValue(new Error('tx reverted'));
    const result = await resolveJoinSpace(deps(daoSpace()), SPACE_ID);
    expect(result).toMatchObject({ ok: false, error: 'request_failed' });
  });
});
