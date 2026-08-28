import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';

import * as React from 'react';

import { Effect } from 'effect';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { INTERESTED_IN_RELATION_TYPE_ID } from '~/core/constants';

import { useInterestedBountyIds, useInterestedInBounty } from './use-interested-in-bounty';

const PERSONAL_SPACE_ID = 'personal-space-id';

const mocks = vi.hoisted(() => ({
  personalSpaceId: 'personal-space-id' as string | null,
  isRegistered: true,
  setRelation: vi.fn(),
  deleteRelation: vi.fn(),
  publishFails: false,
  makeProposal: vi.fn(),
  relationsByToEntityIds: vi.fn(),
}));

vi.mock('~/core/hooks/use-personal-space-id', () => ({
  usePersonalSpaceId: () => ({ personalSpaceId: mocks.personalSpaceId, isRegistered: mocks.isRegistered }),
}));

vi.mock('~/core/sync/use-mutate', () => ({
  useMutate: () => ({
    storage: { relations: { set: mocks.setRelation, delete: mocks.deleteRelation } },
  }),
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
  mocks.publishFails = false;
  mocks.setRelation.mockReset();
  mocks.deleteRelation.mockReset();
  mocks.makeProposal.mockReset();
  mocks.relationsByToEntityIds.mockReset();
  mocks.relationsByToEntityIds.mockReturnValue(Effect.succeed([]));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useInterestedInBounty', () => {
  it('writes the relation from the personal space system entity', async () => {
    const { result } = renderHook(() => useInterestedInBounty(), { wrapper });

    await act(async () => {
      await result.current.registerInterest(interestArgs);
    });

    const relation = mocks.setRelation.mock.calls[0][0];
    expect(relation.fromEntity.id).toBe(PERSONAL_SPACE_ID);
    expect(relation.toEntity.id).toBe('bounty-1');
    expect(relation.spaceId).toBe(PERSONAL_SPACE_ID);
    expect(relation.toSpaceId).toBe('bounty-space');
    expect(relation.type.id).toBe(INTERESTED_IN_RELATION_TYPE_ID);
  });

  it('keeps the relation when the publish succeeds', async () => {
    const { result } = renderHook(() => useInterestedInBounty(), { wrapper });

    await act(async () => {
      await result.current.registerInterest(interestArgs);
    });

    expect(mocks.setRelation).toHaveBeenCalledTimes(1);
    expect(mocks.deleteRelation).not.toHaveBeenCalled();
  });

  it('rolls the relation back when the publish fails', async () => {
    mocks.publishFails = true;
    const { result } = renderHook(() => useInterestedInBounty(), { wrapper });

    await act(async () => {
      await result.current.registerInterest(interestArgs);
    });

    const written = mocks.setRelation.mock.calls[0][0];
    expect(mocks.deleteRelation).toHaveBeenCalledWith(written);
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

    expect(mocks.setRelation).not.toHaveBeenCalled();
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

  it('collects the bounty ids the viewer already registered interest in', async () => {
    mocks.relationsByToEntityIds.mockReturnValue(
      Effect.succeed([{ toEntityId: 'bounty-1' }, { toEntityId: 'bounty-3' }])
    );

    const { result } = renderHook(() => useInterestedBountyIds(['bounty-1', 'bounty-2', 'bounty-3']), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect([...result.current.interestedIds].sort()).toEqual(['bounty-1', 'bounty-3']);
  });

  it('scopes the query to the personal space and the interested-in relation type', async () => {
    const { result } = renderHook(() => useInterestedBountyIds(['bounty-1']), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(mocks.relationsByToEntityIds).toHaveBeenCalledWith(
      ['bounty-1'],
      INTERESTED_IN_RELATION_TYPE_ID,
      PERSONAL_SPACE_ID
    );
  });

  it('stays idle without a personal space', () => {
    mocks.personalSpaceId = null;
    const { result } = renderHook(() => useInterestedBountyIds(['bounty-1']), { wrapper });

    expect(result.current.isLoading).toBe(false);
    expect(mocks.relationsByToEntityIds).not.toHaveBeenCalled();
  });
});
