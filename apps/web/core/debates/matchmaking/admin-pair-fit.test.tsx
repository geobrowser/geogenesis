import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

import type { ReactNode } from 'react';

import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ overlaps: vi.fn() }));

vi.mock('../api', () => ({ adminScheduleOverlaps: mocks.overlaps, getGeoChatSession: vi.fn() }));
vi.mock('../hooks', () => ({
  debateQueryNetworkOptions: {},
  useGeoChatAuth: () => ({ accountKey: 'admin', authenticated: true, getPrivyIdentityToken: vi.fn() }),
}));

const { useAdminSharedFreeSlots } = await import('./admin-pair-fit');

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  // The hook answers an empty map while loading too, so a test of "empty" waits for the answer.
  const settled = () => waitFor(() => expect(client.getQueryCache().getAll()[0]?.state.status).toBe('success'));
  return { wrapper, settled };
}

const candidate = (userId: string, slots: number) => ({
  with: userId,
  both_have_schedules: slots > 0,
  with_timezone: '',
  slots: Array.from({ length: slots }, () => ({ start: '', end: '' })),
  truncated: false,
});

describe('useAdminSharedFreeSlots', () => {
  it('counts the half-hours each candidate shares with debater 1', async () => {
    mocks.overlaps.mockResolvedValueOnce({
      viewer_timezone: 'Europe/Madrid',
      viewer_has_schedule: true,
      candidates: [candidate('ana', 3), candidate('raj', 0)],
    });
    const { wrapper, settled } = setup();
    const { result } = renderHook(() => useAdminSharedFreeSlots('sam', ['ana', 'raj']), { wrapper });

    await settled();
    expect(result.current.get('ana')).toBe(3);
    expect(result.current.get('raj')).toBe(0);
  });

  it('leaves everyone unknown, not sharing nothing, when debater 1 has no schedule', async () => {
    mocks.overlaps.mockResolvedValueOnce({
      viewer_timezone: '',
      viewer_has_schedule: false,
      candidates: [candidate('ana', 0), candidate('raj', 0)],
    });
    const { wrapper, settled } = setup();
    const { result } = renderHook(() => useAdminSharedFreeSlots('sam', ['ana', 'raj']), { wrapper });

    await settled();
    expect(result.current.size).toBe(0);
  });
});
