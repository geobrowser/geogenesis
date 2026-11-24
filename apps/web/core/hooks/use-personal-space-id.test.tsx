import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

import * as React from 'react';

import { Effect } from 'effect';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { markPersonalProfilePublished, personalSpacePollInterval, usePersonalSpaceId } from './use-personal-space-id';

const ADDRESS = '0x5D6d0E45D76D360AB4F94941CE9a005b0AEa2ebD';
const SPACE_ID = 'd4bee0928fb5405baba3b1513f085835';
const TOPIC_ID = '5cc83bb5b39540b3922f9a8664bf6831';

const getSpaceByAddress = vi.fn();

vi.mock('~/core/io/queries', () => ({
  getSpaceByAddress: (address: string) => getSpaceByAddress(address),
}));

vi.mock('~/core/wallet/account-readiness', () => ({
  useAccountReadiness: () => ({ state: 'identified', address: ADDRESS }),
}));

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  getSpaceByAddress.mockReset();
  window.localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('usePersonalSpaceId', () => {
  it('reports a registered space', async () => {
    getSpaceByAddress.mockReturnValue(Effect.succeed({ id: SPACE_ID }));

    const { result } = renderHook(() => usePersonalSpaceId(), { wrapper });

    await waitFor(() => expect(result.current.isRegistered).toBe(true));
    expect(result.current.personalSpaceId).toBe(SPACE_ID);
  });

  it('reports a registered personal space with no profile as needing one', async () => {
    // hi@techfren.net, 2026-10-14: registration landed, the profile publish never did.
    // The account counted as registered, so onboarding never came back for it.
    getSpaceByAddress.mockReturnValue(Effect.succeed({ id: SPACE_ID, type: 'PERSONAL', hasProfile: false }));

    const { result } = renderHook(() => usePersonalSpaceId(), { wrapper });

    await waitFor(() => expect(result.current.isRegistered).toBe(true));
    expect(result.current.needsProfile).toBe(true);
  });

  it('does not ask for a profile the space already has', async () => {
    getSpaceByAddress.mockReturnValue(
      Effect.succeed({ id: SPACE_ID, type: 'PERSONAL', topicId: TOPIC_ID, hasProfile: true, entity: { id: TOPIC_ID } })
    );

    const { result } = renderHook(() => usePersonalSpaceId(), { wrapper });

    await waitFor(() => expect(result.current.isRegistered).toBe(true));
    expect(result.current.needsProfile).toBe(false);
    expect(result.current.personalEntityId).toBe(TOPIC_ID);
  });

  it('finds the person entity from the page while the index has no topic for the space', async () => {
    // The indexer ignores the web's TOPIC_DECLARED, so `topicId` is null on most personal spaces
    // and the profile is only served as the page (GEO-3803).
    getSpaceByAddress.mockReturnValue(
      Effect.succeed({ id: SPACE_ID, type: 'PERSONAL', topicId: null, hasProfile: true, entity: { id: TOPIC_ID } })
    );

    const { result } = renderHook(() => usePersonalSpaceId(), { wrapper });

    await waitFor(() => expect(result.current.isRegistered).toBe(true));
    expect(result.current.personalEntityId).toBe(TOPIC_ID);
  });

  it('reports no person entity for a space with no profile', async () => {
    getSpaceByAddress.mockReturnValue(
      Effect.succeed({ id: SPACE_ID, type: 'PERSONAL', topicId: null, hasProfile: false, entity: { id: '' } })
    );

    const { result } = renderHook(() => usePersonalSpaceId(), { wrapper });

    await waitFor(() => expect(result.current.isRegistered).toBe(true));
    expect(result.current.personalEntityId).toBeNull();
  });

  it('trusts a profile this browser just published over an index that has not caught up', async () => {
    markPersonalProfilePublished(ADDRESS.toLowerCase());
    getSpaceByAddress.mockReturnValue(Effect.succeed({ id: SPACE_ID, type: 'PERSONAL', hasProfile: false }));

    const { result } = renderHook(() => usePersonalSpaceId(), { wrapper });

    await waitFor(() => expect(result.current.isRegistered).toBe(true));
    expect(result.current.needsProfile).toBe(false);
  });

  it('keeps polling until the space appears, then reports it', async () => {
    // The reported bug: registration lands on-chain seconds in, but the indexer
    // serves it later. Without polling the cached "not registered" stuck for the
    // full 5-minute staleTime — no personal-space chip, and every write refused —
    // and client navigation could not clear it, only a hard reload.
    getSpaceByAddress
      .mockReturnValueOnce(Effect.succeed(null))
      .mockReturnValueOnce(Effect.succeed(null))
      .mockReturnValue(Effect.succeed({ id: SPACE_ID }));

    const { result } = renderHook(() => usePersonalSpaceId(), { wrapper });

    await waitFor(() => expect(result.current.isFetched).toBe(true));
    expect(result.current.isRegistered).toBe(false);

    await waitFor(() => expect(result.current.isRegistered).toBe(true), { timeout: 15_000 });
    expect(result.current.personalSpaceId).toBe(SPACE_ID);
    expect(getSpaceByAddress.mock.calls.length).toBeGreaterThan(1);
  }, 20_000);

  it('stops polling once a space is found', async () => {
    getSpaceByAddress.mockReturnValue(Effect.succeed({ id: SPACE_ID }));

    const { result } = renderHook(() => usePersonalSpaceId(), { wrapper });
    await waitFor(() => expect(result.current.isRegistered).toBe(true));

    const callsWhenResolved = getSpaceByAddress.mock.calls.length;
    await new Promise(resolve => setTimeout(resolve, 4_000));

    // A space is never un-created, so the interval must end permanently rather
    // than keep a request running for every signed-in user forever.
    expect(getSpaceByAddress.mock.calls.length).toBe(callsWhenResolved);
  }, 10_000);
});

describe('personalSpacePollInterval', () => {
  it('stops polling once registered', () => {
    expect(
      personalSpacePollInterval({
        data: { isRegistered: true, personalSpaceId: SPACE_ID, personalEntityId: null },
        status: 'success',
        errorUpdateCount: 0,
      })
    ).toBe(false);
  });

  it('polls steadily for an account the index answered is unregistered', () => {
    expect(
      personalSpacePollInterval({
        data: { isRegistered: false, personalSpaceId: null, personalEntityId: null },
        status: 'success',
        errorUpdateCount: 3,
      })
    ).toBe(3_000);
  });

  it('backs off while the index keeps failing, up to a minute', () => {
    const failing = (errorUpdateCount: number) =>
      personalSpacePollInterval({ data: undefined, status: 'error', errorUpdateCount });
    expect(failing(1)).toBe(6_000);
    expect(failing(2)).toBe(12_000);
    expect(failing(10)).toBe(60_000);
  });
});

describe('usePersonalSpaceId answers', () => {
  it('reports no answer, rather than an unregistered account, while the index fails', async () => {
    getSpaceByAddress.mockReturnValue(Effect.fail(new Error('503')));

    const { result } = renderHook(() => usePersonalSpaceId(), { wrapper });

    await waitFor(() => expect(result.current.isFetched).toBe(true));
    expect(result.current.hasAnswer).toBe(false);
    expect(result.current.isRegistered).toBe(false);
  });

  it('reports an answer for an account the index shows as unregistered', async () => {
    getSpaceByAddress.mockReturnValue(Effect.succeed(null));

    const { result } = renderHook(() => usePersonalSpaceId(), { wrapper });

    await waitFor(() => expect(result.current.hasAnswer).toBe(true));
    expect(result.current.isRegistered).toBe(false);
  });
});
