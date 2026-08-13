import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

import type { ReactNode } from 'react';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Debate } from '../api';
import { clearEnteringDebate, useEnteringDebateId } from '../debate-entry-intent';
import { useAcceptDebateRequest, useClaimReadiness } from './hooks';

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  acceptDebateRequest: vi.fn(),
  joinDebateQueue: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock('../api', async importOriginal => {
  const actual = await importOriginal<typeof import('../api')>();
  return { ...actual, acceptDebateRequest: mocks.acceptDebateRequest, joinDebateQueue: mocks.joinDebateQueue };
});

vi.mock('../hooks', async importOriginal => {
  const actual = await importOriginal<typeof import('../hooks')>();
  return {
    ...actual,
    useGeoChatAuth: () => ({ accountKey: 'user-a', authenticated: true, getPrivyIdentityToken: vi.fn() }),
  };
});

vi.mock('../debate-gateway', () => ({ useDebateGatewayScope: vi.fn() }));

const debate = {
  id: 'debate-1',
  status: 'ready',
  claim: { id: 'claim-row-1', space_id: 'space-1', claim_entity_id: 'claim-1', claim: 'A claim', description: null },
  participants: [],
} as unknown as Debate;

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  mocks.push.mockReset();
  mocks.acceptDebateRequest.mockReset();
  mocks.joinDebateQueue.mockReset();
  clearEnteringDebate();
});

describe('useAcceptDebateRequest', () => {
  // GEO-2514 removed the match prompt that used to stand between accepting and the ready room, so
  // accepting has to walk this tab in itself. Nothing else would.
  it('walks the accepting tab into the debate room', async () => {
    mocks.acceptDebateRequest.mockResolvedValue({ request: { id: 'request-1' }, debate });

    const { result } = renderHook(() => useAcceptDebateRequest(), { wrapper });
    result.current.mutate({ requestId: 'request-1' });

    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/space/space-1/debates/debate-1'));
  });

  // The room route outlasts the activity refetch this mutation also kicks off, so the coordinator
  // needs to know this tab is on its way in — otherwise it prompts it to join what it is entering.
  it('claims the debate it is entering before it starts routing', async () => {
    mocks.acceptDebateRequest.mockResolvedValue({ request: { id: 'request-1' }, debate });
    const { result: intent } = renderHook(() => useEnteringDebateId());

    const { result } = renderHook(() => useAcceptDebateRequest(), { wrapper });
    result.current.mutate({ requestId: 'request-1' });

    await waitFor(() => expect(intent.current).toBe('debate-1'));
  });

  it('stays put when acceptance produced no debate', async () => {
    mocks.acceptDebateRequest.mockResolvedValue({ request: { id: 'request-1' }, debate: null });

    const { result } = renderHook(() => useAcceptDebateRequest(), { wrapper });
    result.current.mutate({ requestId: 'request-1' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mocks.push).not.toHaveBeenCalled();
  });
});

describe('useClaimReadiness', () => {
  // Readiness is keyed (space, claim) server-side and the Claims tab is cross-space, so the same
  // claim entity can hold two rows with different readiness.
  it('moves only the switch for the space it was told about', async () => {
    mocks.joinDebateQueue.mockResolvedValue({ claim: { id: 'claim-row-1' }, match: null });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const key = ['debates', 'account', 'user-a', 'matchmaking-claims', { filter: 'all' }];
    queryClient.setQueryData(key, {
      pages: [
        {
          claims: [
            { claim: { space_id: 'space-1', claim_entity_id: 'claim-1' }, viewer_debate_ready: false },
            { claim: { space_id: 'space-2', claim_entity_id: 'claim-1' }, viewer_debate_ready: false },
          ],
        },
      ],
    });

    const { result } = renderHook(() => useClaimReadiness(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      ),
    });
    result.current.mutate({ spaceId: 'space-1', claimId: 'claim-1', ready: true });

    await waitFor(() => {
      const claims = (queryClient.getQueryData(key) as { pages: { claims: { viewer_debate_ready: boolean }[] }[] })
        .pages[0]!.claims;
      expect(claims[0]!.viewer_debate_ready).toBe(true);
      expect(claims[1]!.viewer_debate_ready).toBe(false);
    });
  });

  // The rematch picker reads readiness from the per-space claims family, which keys the ids on the
  // entry rather than nesting them under `claim`. Missing it left that toggle unmoved on click.
  it('moves the switch in the per-space claims family too', async () => {
    mocks.joinDebateQueue.mockResolvedValue({ claim: { id: 'claim-row-1' }, match: null });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const key = ['debates', 'claims', 'space-1', ['claim-1']];
    queryClient.setQueryData(key, {
      claims: [
        { space_id: 'space-1', claim_entity_id: 'claim-1', viewer_debate_ready: false },
        { space_id: 'space-2', claim_entity_id: 'claim-1', viewer_debate_ready: false },
      ],
    });

    const { result } = renderHook(() => useClaimReadiness(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      ),
    });
    result.current.mutate({ spaceId: 'space-1', claimId: 'claim-1', ready: true });

    await waitFor(() => {
      const claims = (queryClient.getQueryData(key) as { claims: { viewer_debate_ready: boolean }[] }).claims;
      expect(claims[0]!.viewer_debate_ready).toBe(true);
      // Same claim entity in another space keeps its own switch.
      expect(claims[1]!.viewer_debate_ready).toBe(false);
    });
  });
});
