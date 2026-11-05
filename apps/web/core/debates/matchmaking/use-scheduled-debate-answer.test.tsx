import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import { Provider as JotaiProvider } from 'jotai';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useToast } from '~/core/hooks/use-toast';

import * as api from '../api';
import type { ScheduledDebateRequest, ScheduledDebateResponseResult } from '../api';
import { ScheduledRow } from './scheduled-debates-section';
import { stillWaitingOn, useScheduledDebateAnswer } from './use-scheduled-debate-answer';

vi.mock('~/core/analytics', () => ({ capture: vi.fn(), analyticsContextRevision: () => 0 }));
vi.mock('../hooks', async original => ({
  ...(await original<typeof import('../hooks')>()),
  useGeoChatAuth: () => ({ ready: true, authenticated: true, accountKey: 'acct', getPrivyIdentityToken: vi.fn() }),
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function deferred() {
  let resolve!: (result: ScheduledDebateResponseResult) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<ScheduledDebateResponseResult>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function request(id: string): ScheduledDebateRequest {
  return {
    request_id: id,
    status: 'pending',
    scheduled_start_at: '2099-10-24T18:00:00Z',
    scheduled_end_at: '2099-10-24T18:30:00Z',
    invited_by_user_id: 'peer',
    created_by_admin: false,
    proposed_by_user_id: 'peer',
    reschedule_count: 0,
    room_id: null,
    participants: [
      { user_id: 'me', accepted: false },
      { user_id: 'peer', accepted: true },
    ],
    viewer_must_answer: true,
  };
}

/** Like the Requests tab, both rows share one answer controller and mutation observer. */
function Requests() {
  const { answer, busy } = useScheduledDebateAnswer();
  return (
    <>
      {['A', 'B'].map(id => (
        <div key={id} data-testid={id}>
          <ScheduledRow
            request={request(id)}
            opponent={null}
            viewer={null}
            viewerId="me"
            busy={busy}
            onAnswer={answer}
            onReschedule={null}
          />
        </div>
      ))}
    </>
  );
}

describe('overlapping scheduled answers', () => {
  it.each([
    ['Accept', 'failure'],
    ['Decline', 'failure'],
    ['Accept', 'conflict'],
  ] as const)('allows retrying %s on the first request after its %s', async (label, outcome) => {
    const a = deferred();
    const b = deferred();
    // Use the real scheduling mutation: a callback-only mock would miss observer replacement.
    const respond = vi
      .spyOn(api, 'respondToScheduledDebate')
      .mockResolvedValue({ ...request('A'), outcome: 'recorded' })
      .mockImplementationOnce(() => a.promise)
      .mockImplementationOnce(() => b.promise);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <Requests />
      </QueryClientProvider>
    );
    const button = (id: string) => within(screen.getByTestId(id)).getByRole('button', { name: label });
    // Two presses can land before the mutation's pending render disables the second row.
    act(() => {
      fireEvent.click(button('A'));
      fireEvent.click(button('B'));
    });
    await waitFor(() => expect(respond).toHaveBeenCalledTimes(2));
    await act(async () => {
      if (outcome === 'failure') a.reject(new Error('Temporary failure'));
      else
        a.resolve({
          outcome: 'conflict',
          conflicting_request_id: 'other',
          conflicting_start_at: '2099-10-24T18:00:00Z',
          conflicting_end_at: '2099-10-24T18:30:00Z',
        });
    });
    await act(async () => {
      b.resolve({ ...request('B'), outcome: 'recorded' });
    });
    await waitFor(() => expect(button('A')).toBeEnabled());
    fireEvent.click(button('A'));
    await waitFor(() => expect(respond.mock.calls.filter(([id]) => id === 'A')).toHaveLength(2));
  });
});

// GEO-3589: accepting a Geo-team match the other debater hasn't answered books nothing yet.
function adminMatch(status: ScheduledDebateRequest['status'], otherAccepted: boolean | null): ScheduledDebateRequest {
  return {
    ...request('M'),
    status,
    invited_by_user_id: null,
    created_by_admin: true,
    proposed_by_user_id: null,
    participants: [
      { user_id: 'me', accepted: true },
      { user_id: 'peer', accepted: otherAccepted, display_name: 'Alex Rivera' },
    ],
    viewer_must_answer: false,
  };
}

describe('stillWaitingOn', () => {
  it('names the debater a pending acceptance is waiting on', () => {
    expect(stillWaitingOn(adminMatch('pending', null))).toBe('Alex Rivera');
  });

  it('is null once the acceptance booked the debate', () => {
    expect(stillWaitingOn(adminMatch('accepted', true))).toBeNull();
  });
});

function AcceptAndShowToast() {
  const { answer } = useScheduledDebateAnswer();
  const [toast] = useToast();
  return (
    <>
      <button type="button" onClick={() => answer('M', true)}>
        Accept
      </button>
      <div data-testid="toast">{toast}</div>
    </>
  );
}

describe('the toast after accepting', () => {
  it.each([
    ['a Geo-team match still waiting on the other debater', adminMatch('pending', null), true],
    ['a debate the acceptance booked', adminMatch('accepted', true), false],
  ])('on %s', async (_, result, toasts) => {
    vi.spyOn(api, 'respondToScheduledDebate').mockResolvedValue({ ...result, outcome: 'recorded' });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    // A store of its own: the toast atom otherwise carries one case's toast into the next.
    render(
      <JotaiProvider>
        <QueryClientProvider client={client}>
          <AcceptAndShowToast />
        </QueryClientProvider>
      </JotaiProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Accept' }));

    await waitFor(() => expect(api.respondToScheduledDebate).toHaveBeenCalled());
    if (toasts) {
      await waitFor(() =>
        expect(screen.getByTestId('toast')).toHaveTextContent(
          'Accepted. We’ll add it to your calendar once Alex Rivera accepts.'
        )
      );
    } else {
      await act(async () => {});
      expect(screen.getByTestId('toast')).toBeEmptyDOMElement();
    }
  });
});
