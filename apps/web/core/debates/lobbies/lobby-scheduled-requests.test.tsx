import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ScheduledDebateRequest } from '../api';
import type { LobbyPageView } from './lobby-view';

const mocks = vi.hoisted(() => ({ requests: [] as ScheduledDebateRequest[], respond: vi.fn(), schedule: vi.fn() }));
vi.mock('../rooms/scheduling-hooks', () => ({
  useScheduledDebates: () => ({ data: { requests: mocks.requests } }),
  useRespondToScheduledDebate: () => ({ mutate: mocks.respond, isPending: false }),
}));
vi.mock('../use-current-geo-chat-user-id', () => ({ useCurrentGeoChatUserId: () => 'me' }));
vi.mock('../matchmaking/use-geo-chat-user-summaries', () => ({ useGeoChatUserSummaries: () => [] }));
vi.mock('./lobby-schedule', () => ({ useLobbySchedule: () => mocks.schedule }));

const { LobbyScheduledRequests } = await import('./lobby-scheduled-requests');
const lobby = {
  members: [{ user_id: 'peer', profile_space_id: 'space-peer', display_name: 'Maya', avatar_cid: null }],
} as LobbyPageView;
function request(overrides: Partial<ScheduledDebateRequest> = {}): ScheduledDebateRequest {
  return {
    request_id: 'invite',
    status: 'pending',
    scheduled_start_at: '2026-10-24T18:00:00Z',
    scheduled_end_at: '2026-10-24T18:30:00Z',
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
    ...overrides,
  };
}
beforeEach(() => {
  vi.setSystemTime(new Date('2026-10-22T12:00:00Z'));
  mocks.requests = [];
  vi.clearAllMocks();
  mocks.respond.mockReset();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('scheduled invitations in the lobby', () => {
  it('shows an arriving request on a live list update, with the existing card and three answers', () => {
    const view = render(<LobbyScheduledRequests lobby={lobby} />);
    expect(screen.queryByRole('complementary')).toBeNull();
    mocks.requests = [request()];
    view.rerender(<LobbyScheduledRequests lobby={lobby} />);
    expect(screen.getByText('Maya asked you to debate later')).toBeInTheDocument();
    expect(screen.getByText('Waiting on your answer · Expires at start')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Accept' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Decline' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Choose different time' })).toBeInTheDocument();
  });
  it.each([
    ['Accept', true],
    ['Decline', false],
  ] as const)('answers %s through the existing mutation with lobby attribution', (label, accepted) => {
    mocks.requests = [request()];
    render(<LobbyScheduledRequests lobby={lobby} />);
    fireEvent.click(screen.getByRole('button', { name: label }));
    expect(mocks.respond).toHaveBeenCalledWith({ requestId: 'invite', accepted, surface: 'lobby' }, expect.anything());
  });
  it('dismisses without answering and shows the request again when its time changes', () => {
    mocks.requests = [request()];
    const view = render(<LobbyScheduledRequests lobby={lobby} />);
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss scheduled request from Maya' }));
    expect(screen.queryByRole('complementary')).toBeNull();
    expect(mocks.respond).not.toHaveBeenCalled();
    expect(mocks.requests[0].status).toBe('pending');
    mocks.requests = [request({ scheduled_start_at: '2026-10-25T18:00:00Z', reschedule_count: 1 })];
    view.rerender(<LobbyScheduledRequests lobby={lobby} />);
    expect(screen.getByRole('button', { name: 'Accept' })).toBeInTheDocument();
  });
  it('opens a counterproposal for this request with no answer sent', () => {
    mocks.requests = [request()];
    render(<LobbyScheduledRequests lobby={lobby} />);
    fireEvent.click(screen.getByRole('button', { name: 'Choose different time' }));
    expect(mocks.schedule).toHaveBeenCalledWith({
      userId: 'peer',
      name: 'Maya',
      requestId: 'invite',
      entry: 'lobby_new_time',
    });
    expect(mocks.respond).not.toHaveBeenCalled();
  });
  it('keeps a conflicting acceptance visible with a useful error', () => {
    mocks.respond.mockImplementation((_variables, options) =>
      options.onSuccess({ outcome: 'conflict', conflicting_start_at: '2026-10-24T18:00:00Z' })
    );
    mocks.requests = [request()];
    render(<LobbyScheduledRequests lobby={lobby} />);
    fireEvent.click(screen.getByRole('button', { name: 'Accept' }));
    expect(screen.getByRole('alert')).toHaveTextContent('That clashes with a debate');
    expect(screen.getByRole('button', { name: 'Choose different time' })).toBeInTheDocument();
  });

  it('omits expired, outgoing and answered requests', () => {
    mocks.requests = [
      request({ scheduled_start_at: '2026-10-21T18:00:00Z' }),
      request({ viewer_must_answer: false }),
      request({ status: 'declined' }),
    ];
    render(<LobbyScheduledRequests lobby={lobby} />);
    expect(screen.queryByRole('complementary')).toBeNull();
  });
});
