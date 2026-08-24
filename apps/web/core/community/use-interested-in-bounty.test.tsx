import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';

import * as React from 'react';

import { Effect } from 'effect';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { INTERESTED_IN_RELATION_TYPE_ID } from '~/core/constants';

import { useInterestedBountyIds, useInterestedInBounty } from './use-interested-in-bounty';

const PERSONAL_SPACE_ID = 'aaaa0000000000000000000000000001';
const PERSON_ENTITY_ID = 'bbbb0000000000000000000000000002';

const mocks = vi.hoisted(() => ({
  personalSpaceId: 'aaaa0000000000000000000000000001' as string | null,
  isRegistered: true,
  profile: { id: 'bbbb0000000000000000000000000002', spaceId: 'aaaa0000000000000000000000000001', name: 'Alice' } as {
    id: string;
    spaceId: string;
    name: string | null;
  } | null,
  publishFails: false,
  makeProposal: vi.fn(),
  relationsByToEntityIds: vi.fn(),
}));

vi.mock('~/core/hooks/use-personal-space-id', () => ({
  usePersonalSpaceId: () => ({ personalSpaceId: mocks.personalSpaceId, isRegistered: mocks.isRegistered }),
}));

vi.mock('~/core/hooks/use-smart-account', () => ({
  useSmartAccount: () => ({ smartAccount: { account: { address: '0xabc' } }, isLoading: false }),
}));

vi.mock('~/core/hooks/use-geo-profile', () => ({
  useGeoProfile: () => ({ profile: mocks.profile, isLoading: false, isFetched: true }),
}));

vi.mock('~/core/hooks/use-publish', () => ({
  usePublish: () => ({
    makeProposal: async (args: { onSuccess?: () => void; onError?: () => void }) => {
      mocks.makeProposal(args);
      if (mocks.publishFails) args.onError?.();
      else args.onSuccess?.();
    },
  }),
}));

vi.mock('~/core/io/queries', () => ({
  getRelationsByToEntityIds: (...args: unknown[]) => mocks.relationsByToEntityIds(...args),
}));

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const interestArgs = { bountyId: 'bounty-1', bountyName: 'Write docs', bountySpaceId: 'bounty-space' };

beforeEach(() => {
  mocks.personalSpaceId = PERSONAL_SPACE_ID;
  mocks.isRegistered = true;
  mocks.profile = { id: PERSON_ENTITY_ID, spaceId: PERSONAL_SPACE_ID, name: 'Alice' };
  mocks.publishFails = false;
  mocks.makeProposal.mockReset();
  mocks.relationsByToEntityIds.mockReset();
  mocks.relationsByToEntityIds.mockReturnValue(Effect.succeed([]));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useInterestedInBounty', () => {
  // The standardized geogenesis shape: personal-space system entity → bounty,
  // published into the personal space, with the bounty's space as toSpaceId.
  it('writes the relation from the personal-space entity into the personal space, with toSpaceId', async () => {
    const { result } = renderHook(() => useInterestedInBounty(), { wrapper });

    await act(async () => {
      await result.current.registerInterest(interestArgs);
    });

    const args = mocks.makeProposal.mock.calls[0][0];
    expect(args.spaceId).toBe(PERSONAL_SPACE_ID);
    expect(args.relations).toHaveLength(1);
    const relation = args.relations[0];
    expect(relation.fromEntity.id).toBe(PERSONAL_SPACE_ID);
    expect(relation.toEntity.id).toBe('bounty-1');
    expect(relation.spaceId).toBe(PERSONAL_SPACE_ID);
    expect(relation.toSpaceId).toBe('bounty-space');
    expect(relation.type.id).toBe(INTERESTED_IN_RELATION_TYPE_ID);
  });

  it('ignores a second registration for a bounty already submitted', async () => {
    const { result } = renderHook(() => useInterestedInBounty(), { wrapper });

    await act(async () => {
      await result.current.registerInterest(interestArgs);
      await result.current.registerInterest(interestArgs);
    });

    expect(mocks.makeProposal).toHaveBeenCalledTimes(1);
  });

  it('allows a retry after a failed publish', async () => {
    mocks.publishFails = true;
    const { result } = renderHook(() => useInterestedInBounty(), { wrapper });

    await act(async () => {
      await result.current.registerInterest(interestArgs);
    });

    mocks.publishFails = false;

    await act(async () => {
      await result.current.registerInterest(interestArgs);
    });

    expect(mocks.makeProposal).toHaveBeenCalledTimes(2);
  });

  it('does nothing without a registered personal space', async () => {
    mocks.isRegistered = false;
    const { result } = renderHook(() => useInterestedInBounty(), { wrapper });

    expect(result.current.canRegisterInterest).toBe(false);

    await act(async () => {
      await result.current.registerInterest(interestArgs);
    });

    expect(mocks.makeProposal).not.toHaveBeenCalled();
  });
});

describe('useInterestedBountyIds', () => {
  it('reports loading until the first fetch settles', async () => {
    const { result } = renderHook(() => useInterestedBountyIds(['bounty-1']), { wrapper });

    // Before the query resolves every bounty looks un-registered
    expect(result.current.isLoading).toBe(true);
    expect(result.current.interestedIds.size).toBe(0);

    await waitFor(() => expect(result.current.isLoading).toBe(false));
  });

  it('collects the viewer\'s bounty ids across row shapes, ignoring other curators', async () => {
    mocks.relationsByToEntityIds.mockReturnValue(
      Effect.succeed([
        // Current shape: authored in the viewer's personal space.
        { toEntityId: 'bounty-1', spaceId: PERSONAL_SPACE_ID, fromEntityId: PERSONAL_SPACE_ID },
        // Legacy geogenesis shape: the viewer's space entity, written into the bounty's DAO space.
        { toEntityId: 'bounty-3', spaceId: 'dao-1', fromEntityId: PERSONAL_SPACE_ID },
        // Someone else's row — must not read as the viewer's interest.
        { toEntityId: 'bounty-2', spaceId: 'other-space', fromEntityId: 'other-person' },
      ])
    );

    const { result } = renderHook(() => useInterestedBountyIds(['bounty-1', 'bounty-2', 'bounty-3']), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect([...result.current.interestedIds].sort()).toEqual(['bounty-1', 'bounty-3']);
  });

  it('queries by relation type without a space scope (legacy rows live outside the personal space)', async () => {
    const { result } = renderHook(() => useInterestedBountyIds(['bounty-1']), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(mocks.relationsByToEntityIds).toHaveBeenCalledWith(['bounty-1'], INTERESTED_IN_RELATION_TYPE_ID);
  });

  it('stays idle without a personal space', () => {
    mocks.personalSpaceId = null;
    const { result } = renderHook(() => useInterestedBountyIds(['bounty-1']), { wrapper });

    expect(result.current.isLoading).toBe(false);
    expect(mocks.relationsByToEntityIds).not.toHaveBeenCalled();
  });
});
