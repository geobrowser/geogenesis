import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

import * as React from 'react';

import { describe, expect, it, vi } from 'vitest';

import { GeoChatRequestError } from '../api';
import { debateQueryKeys } from '../hooks';
import { mostSplitFirst, useDebateLobbyClaims, useRefreshLobbyClaimsOnRefusal } from './lobby-room-claims-hooks';

const getClaims = vi.hoisted(() => vi.fn());

vi.mock('../api', async importOriginal => ({
  ...(await importOriginal<typeof import('../api')>()),
  getDebateLobbyClaims: getClaims,
}));

vi.mock('../hooks', async importOriginal => ({
  ...(await importOriginal<typeof import('../hooks')>()),
  useGeoChatAuth: () => ({ ready: true, authenticated: true, accountKey: 'acct', getPrivyIdentityToken: vi.fn() }),
}));

function setup() {
  const queryClient = new QueryClient();
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
  const { result } = renderHook(() => useRefreshLobbyClaimsOnRefusal('0192-abc'), {
    wrapper: ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  });
  return { refresh: result.current, invalidate };
}

describe('useRefreshLobbyClaimsOnRefusal', () => {
  it.each(['no_candidates_in_lobby', 'lobby_not_present'])('refetches the list on %s', code => {
    const { refresh, invalidate } = setup();
    refresh(new GeoChatRequestError('refused', code, 409));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: debateQueryKeys.lobbyClaims('acct', '0192-abc') });
  });

  it('leaves the list alone on other failures', () => {
    const { refresh, invalidate } = setup();
    refresh(new GeoChatRequestError('respond first', 'intent_missing', 409));
    refresh(new Error('offline'));
    expect(invalidate).not.toHaveBeenCalled();
  });
});

describe('useDebateLobbyClaims', () => {
  it('retries a failed read rather than leaving the list empty', async () => {
    getClaims
      .mockRejectedValueOnce(new GeoChatRequestError('busy', 'unavailable', 503))
      .mockResolvedValueOnce({ lobby_id: '0192abc', source: 'room', claims: [] });
    const queryClient = new QueryClient();
    const { result } = renderHook(() => useDebateLobbyClaims('0192-abc'), {
      wrapper: ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      ),
    });

    await waitFor(() => expect(result.current.data?.source).toBe('room'), { timeout: 5000 });
    expect(getClaims).toHaveBeenCalledTimes(2);
  });
});

describe('useDebateLobbyClaims for named claims (GEO-3775)', () => {
  const hex = (n: number) => n.toString(16).padStart(32, '0');
  const side = (position: boolean, total: number) => ({
    position,
    position_label: position ? 'Agree' : 'Disagree',
    total_in_room: total,
    requestable_count: 0,
    participants: [],
  });
  const row = (id: string, agree: number, disagree: number) => ({
    claim: { id, space_id: 's1', claim_entity_id: id, claim: `Claim ${id}`, description: null },
    positions: [side(true, agree), side(false, disagree)],
  });

  it('reads every named claim by id in batches, never the room’s top 50, most split first', async () => {
    getClaims.mockReset();
    getClaims.mockImplementation(
      async (_lobby: string, _token: unknown, _account: unknown, _signal: unknown, ids?: string[]) => ({
        lobby_id: '0192abc',
        source: 'room',
        // One claim per batch, each split more than the batch before it.
        claims: ids ? [row(ids[0], ids[0] === hex(1) ? 1 : ids[0] === hex(51) ? 2 : 3, 2)] : [],
        disagreements: null,
      })
    );
    const ids = Array.from({ length: 120 }, (_, index) => hex(index + 1));
    const queryClient = new QueryClient();
    const { result } = renderHook(() => useDebateLobbyClaims('0192-abc', true, ids), {
      wrapper: ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      ),
    });

    await waitFor(() => expect(result.current.data?.claims).toHaveLength(3));
    const reads = getClaims.mock.calls.map(call => call[4] as string[] | undefined);
    expect(reads.map(read => read?.length)).toEqual([50, 50, 20]);
    expect(reads.flat()).toEqual(ids);
    expect(result.current.data?.claims.map(claim => claim.claim.id)).toEqual([hex(101), hex(51), hex(1)]);
    // A filtered read carries no counts: empty, for the agenda filter to count from the rows.
    expect(result.current.data?.disagreements).toEqual([]);
  });
});

describe('mostSplitFirst (GEO-3775)', () => {
  const side = (position: boolean, total: number) => ({
    position,
    position_label: position ? 'Agree' : 'Disagree',
    total_in_room: total,
    requestable_count: 0,
    participants: [],
  });
  const row = (id: string, agree: number, disagree: number, viewer: boolean | null = null) =>
    ({
      claim: { id, space_id: 's1', claim_entity_id: id, claim: `Claim ${id}`, description: null },
      viewer_response: viewer === null ? null : { position: viewer, position_label: viewer ? 'Agree' : 'Disagree' },
      positions: [side(true, agree), side(false, disagree)],
    }) as unknown as Parameters<typeof mostSplitFirst>[0][number];

  it('counts the viewer on their own side, as geo-chat ranks the room', () => {
    // Others: A 2/2 (4 pairs), B 1/3 (3). With the viewer agreeing on B it is 2/3 (6), first in geo-chat.
    const order = mostSplitFirst([row('a', 2, 2), row('b', 1, 3, true)]).map(entry => entry.claim.id);
    expect(order).toEqual(['b', 'a']);
  });
});
