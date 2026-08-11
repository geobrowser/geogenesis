import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

import type { ReactNode } from 'react';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Debate } from '../api';
import { useAcceptDebateRequest } from './hooks';

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  acceptDebateRequest: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock('../api', async importOriginal => {
  const actual = await importOriginal<typeof import('../api')>();
  return { ...actual, acceptDebateRequest: mocks.acceptDebateRequest };
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

  it('stays put when acceptance produced no debate', async () => {
    mocks.acceptDebateRequest.mockResolvedValue({ request: { id: 'request-1' }, debate: null });

    const { result } = renderHook(() => useAcceptDebateRequest(), { wrapper });
    result.current.mutate({ requestId: 'request-1' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mocks.push).not.toHaveBeenCalled();
  });
});
