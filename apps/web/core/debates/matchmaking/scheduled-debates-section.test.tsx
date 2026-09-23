import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import * as React from 'react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ScheduledDebateRequest, UpcomingDebateRoom } from '~/core/debates/api';

const mocks = vi.hoisted(() => ({
  respond: vi.fn(),
  pending: false,
}));

vi.mock('~/core/debates/rooms/scheduling-hooks', () => ({
  useRespondToScheduledDebate: () => ({ mutate: mocks.respond, isPending: mocks.pending }),
}));

const { ScheduledDebatesSection } = await import('./scheduled-debates-section');

const request = (overrides: Partial<ScheduledDebateRequest> = {}): ScheduledDebateRequest => ({
  request_id: 'request-1',
  status: 'pending',
  scheduled_start_at: '2026-09-24T13:00:00Z',
  scheduled_end_at: '2026-09-24T13:30:00Z',
  invited_by_user_id: 'user-them',
  created_by_admin: false,
  proposed_by_user_id: 'user-them',
  reschedule_count: 0,
  room_id: null,
  participants: [],
  viewer_must_answer: true,
  ...overrides,
});

const room = (overrides: Partial<UpcomingDebateRoom> = {}): UpcomingDebateRoom => ({
  room_id: 'room-1',
  starts_at: '2026-09-24T13:00:00Z',
  opens_at: '2026-09-24T12:50:00Z',
  joinable: true,
  due: false,
  others_present: false,
  ...overrides,
});

const setup = (content: { answerable?: ScheduledDebateRequest[]; upcoming?: UpcomingDebateRoom[] }) => ({
  user: userEvent.setup(),
  ...render(
    <ScheduledDebatesSection content={{ answerable: content.answerable ?? [], upcoming: content.upcoming ?? [] }} />
  ),
});

afterEach(() => {
  cleanup();
  mocks.respond = vi.fn();
  mocks.pending = false;
});

describe('answering in the tab', () => {
  it('renders nothing when there is nothing scheduled', () => {
    const { container } = setup({});
    expect(container).toBeEmptyDOMElement();
  });

  // The whole point of the tab: accepting without going to find an email.
  it('accepts a request pointed at the viewer', async () => {
    const { user } = setup({ answerable: [request()] });

    await user.click(screen.getByRole('button', { name: 'Accept' }));

    expect(mocks.respond).toHaveBeenCalledTimes(1);
    expect(mocks.respond.mock.calls[0][0]).toEqual({ requestId: 'request-1', accepted: true });
  });

  it('offers no answer on one the viewer is not holding up', () => {
    setup({ answerable: [request({ viewer_must_answer: false })] });

    expect(screen.getByText('Waiting on their answer')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Accept' })).not.toBeInTheDocument();
  });

  it('reports a clash, which is a refusal rather than a failure', async () => {
    mocks.respond = vi.fn((_vars, options) =>
      options.onSuccess({ outcome: 'conflict', conflicting_start_at: '2026-09-24T13:00:00Z' })
    );
    const { user } = setup({ answerable: [request()] });

    await user.click(screen.getByRole('button', { name: 'Accept' }));

    expect(screen.getByText(/That clashes with a debate at/)).toBeInTheDocument();
  });

  it('reports a rejected answer rather than looking inert', async () => {
    mocks.respond = vi.fn((_vars, options) => options.onError(new Error('Already answered.')));
    const { user } = setup({ answerable: [request()] });

    await user.click(screen.getByRole('button', { name: 'Decline' }));

    expect(screen.getByText('Already answered.')).toBeInTheDocument();
  });
});

describe('joining from the tab', () => {
  // GEO-2940: the tab is the reliable route, so it carries what the popup carries.
  it('offers the way in, and says who is already there', () => {
    setup({ upcoming: [room({ others_present: true, due: true })] });

    expect(screen.getByText('Your opponent is waiting for you now')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Join debate' })).toHaveAttribute('href', '/debate/room-1');
  });

  it('says when a shut room opens rather than offering a dead link', () => {
    setup({ upcoming: [room({ joinable: false })] });

    expect(screen.getByText(/^Opens at/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Join debate' })).not.toBeInTheDocument();
  });
});
