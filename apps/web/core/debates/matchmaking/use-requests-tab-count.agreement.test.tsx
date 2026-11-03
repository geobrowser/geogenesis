import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

import * as React from 'react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { DebateActivity } from '../api';
import { invite } from './requests-fixtures';

/**
 * The navbar's badge and the panel's Requests count over one real query cache (GEO-3463), with only
 * geo-chat stubbed. The unit suite mocks the scheduled read, which is how a badge that went stale
 * once the panel closed passed it: what goes stale is react-query skipping a disabled observer.
 */

const api = vi.hoisted(() => ({ requests: [] as unknown[] }));

vi.mock('../api', async importOriginal => ({
  ...(await importOriginal<typeof import('../api')>()),
  listScheduledDebates: () => Promise.resolve({ requests: api.requests, availability_requests: [] }),
}));
vi.mock('../hooks', async importOriginal => ({
  ...(await importOriginal<typeof import('../hooks')>()),
  useGeoChatAuth: () => ({
    ready: true,
    authenticated: true,
    accountKey: 'account-me',
    getPrivyIdentityToken: () => Promise.resolve('token'),
  }),
}));
vi.mock('../use-current-geo-chat-user-id', () => ({ useCurrentGeoChatUserId: () => 'user-me' }));

const { useRequestsTabCount } = await import('./use-requests-tab-count');
const { debateQueryKeys } = await import('../hooks');

afterEach(() => {
  api.requests = [];
});

const activityAwaiting = (count: number) => ({ scheduled_awaiting_answer_count: count }) as DebateActivity;

describe('the navbar badge and the panel count', () => {
  it('agree after an invite arrives with the panel closed, and again when it reopens', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const panelCount = (activity: DebateActivity, activityUpdatedAt: number) =>
      renderHook(() => useRequestsTabCount({ authenticated: true, activity, activityUpdatedAt, requests: undefined }), {
        wrapper,
      });
    const useNavbarCount = (props: { activity: DebateActivity; activityUpdatedAt: number; panelOpen: boolean }) =>
      useRequestsTabCount({
        authenticated: true,
        activity: props.activity,
        activityUpdatedAt: props.activityUpdatedAt,
        requests: undefined,
        fetchScheduled: props.panelOpen,
      });

    // The panel open on one invite to answer, and activity read before the list landed.
    api.requests = [invite('s1', true)];
    const navbar = renderHook(useNavbarCount, {
      wrapper,
      initialProps: { activity: activityAwaiting(1), activityUpdatedAt: Date.now() - 60_000, panelOpen: true },
    });
    const panel = panelCount(activityAwaiting(1), Date.now() - 60_000);
    await waitFor(() => expect(panel.result.current).toBe(1));
    expect(navbar.result.current).toBe(1);

    // The panel closes. A second invite arrives: the gateway refreshes the list, but only active
    // observers refetch, and the navbar's is disabled now. Activity, which it does read, says 2.
    panel.unmount();
    navbar.rerender({ activity: activityAwaiting(1), activityUpdatedAt: Date.now() - 60_000, panelOpen: false });
    api.requests = [invite('s1', true), invite('s2', true)];
    await client.invalidateQueries({ queryKey: debateQueryKeys.scheduledDebates('account-me'), refetchType: 'active' });
    navbar.rerender({ activity: activityAwaiting(2), activityUpdatedAt: Date.now() + 1, panelOpen: false });
    expect(navbar.result.current).toBe(2);

    // Reopened, the panel reads the list again, and both count from it.
    navbar.rerender({ activity: activityAwaiting(2), activityUpdatedAt: Date.now() + 1, panelOpen: true });
    const reopened = panelCount(activityAwaiting(2), Date.now() + 1);
    await waitFor(() => expect(reopened.result.current).toBe(2));
    expect(navbar.result.current).toBe(2);
  });
});
