import '@testing-library/jest-dom/vitest';
import { cleanup, render } from '@testing-library/react';

import { Provider, createStore } from 'jotai';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ScheduledDebateRequest } from '../api';

const mocks = vi.hoisted(() => ({
  enabled: true,
  requests: [] as ScheduledDebateRequest[],
  queried: vi.fn(),
}));

vi.mock('~/core/state/feature-flags', async importOriginal => ({
  ...(await importOriginal<typeof import('~/core/state/feature-flags')>()),
  usePeerAvailabilityEnabled: () => mocks.enabled,
}));

vi.mock('./scheduling-hooks', () => ({
  useScheduledDebates: (enabled: boolean) => {
    mocks.queried(enabled);
    return { data: { requests: mocks.requests } };
  },
}));

const { scheduledAwaitingCount, scheduledAwaitingCountAtom } = await import('./scheduled-awaiting');
const { ScheduledRequestsWatcher } = await import('./scheduled-requests-watcher');

const request = (overrides: Partial<ScheduledDebateRequest> = {}): ScheduledDebateRequest => ({
  request_id: 'request-1',
  status: 'pending',
  scheduled_start_at: '2026-09-25T13:00:00Z',
  scheduled_end_at: '2026-09-25T13:30:00Z',
  invited_by_user_id: 'user-them',
  created_by_admin: false,
  proposed_by_user_id: 'user-them',
  reschedule_count: 0,
  room_id: null,
  participants: [],
  viewer_must_answer: true,
  ...overrides,
});

afterEach(() => {
  cleanup();
  mocks.enabled = true;
  mocks.requests = [];
  mocks.queried.mockReset();
});

describe('scheduledAwaitingCount', () => {
  it('counts only pending requests the viewer has to answer', () => {
    expect(
      scheduledAwaitingCount([
        request(),
        request({ request_id: 'theirs', viewer_must_answer: false }),
        request({ request_id: 'booked', status: 'accepted', room_id: 'room-1', viewer_must_answer: false }),
        request({ request_id: 'gone', status: 'expired' }),
      ])
    ).toBe(1);
  });
});

describe('ScheduledRequestsWatcher', () => {
  const mount = () => {
    const store = createStore();
    const view = render(
      <Provider store={store}>
        <ScheduledRequestsWatcher />
      </Provider>
    );
    return { store, view };
  };

  it('asks for nothing without scheduling', () => {
    mocks.enabled = false;
    mocks.requests = [request()];
    const { store } = mount();

    expect(mocks.queried).not.toHaveBeenCalled();
    expect(store.get(scheduledAwaitingCountAtom)).toBe(0);
  });

  it('publishes the count for the badges', () => {
    mocks.requests = [request(), request({ request_id: 'second' })];
    const { store } = mount();

    expect(store.get(scheduledAwaitingCountAtom)).toBe(2);
  });

  // A number left behind after scheduling goes away is a badge no tab can explain.
  it('clears the count when it stops watching', () => {
    mocks.requests = [request()];
    const { store, view } = mount();
    expect(store.get(scheduledAwaitingCountAtom)).toBe(1);

    view.unmount();

    expect(store.get(scheduledAwaitingCountAtom)).toBe(0);
  });
});
