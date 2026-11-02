import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SPACE_CHAT_COPY, SpaceChatPanel } from './space-chat-panel';
import { SPACE_CHAT_VIEW_COPY } from './space-chat-view';

const SPACE = '0243bd171b651379954685365870e6a6';

const mocks = vi.hoisted(() => ({
  authenticated: false,
  canPost: false,
  pending: false,
  access: { isMember: false, isEditor: false, canEdit: false, isLoading: false },
  join: vi.fn(),
  joinStatus: 'idle' as 'idle' | 'pending' | 'success' | 'error',
  refetchRooms: vi.fn(),
}));

vi.mock('~/core/debates/hooks', () => ({ useGeoChatAuth: () => ({ authenticated: mocks.authenticated }) }));
vi.mock('~/core/debates/use-current-geo-chat-user-id', () => ({
  useCurrentGeoChatUserId: () => (mocks.authenticated ? 'viewer' : null),
}));
vi.mock('~/core/hooks/use-space', () => ({ useSpace: () => ({ space: { entity: { name: 'Geo' } } }) }));
vi.mock('~/core/hooks/use-join-space', () => ({
  useJoinSpace: () => ({ join: mocks.join, status: mocks.joinStatus, optimisticRequested: false }),
}));
vi.mock('~/core/hooks/use-pending-memberships', () => ({ useIsMembershipPending: () => mocks.pending }));
vi.mock('~/core/hooks/use-access-control', () => ({ useAccessControl: () => mocks.access }));
vi.mock('~/core/space-chat/people', () => ({
  useSpaceChatParticipants: () => [],
  useChatPeople: () => new Map(),
  unknownPerson: (id: string) => ({ id, name: id, avatarUrl: null, avatarSeed: id }),
}));
vi.mock('~/core/space-chat/hooks', () => ({
  useSpaceChatRooms: () => ({
    data: { supported: true, rooms: [] },
    isError: false,
    refetch: mocks.refetchRooms,
    memberRoom: { id: 'room', space_id: SPACE, kind: 'member', can_post: mocks.canPost, can_moderate: false },
  }),
  useSpaceChatRoom: () => ({
    state: { messages: [], nextBefore: null, pending: [] },
    status: 'ready',
    refetch: vi.fn(),
    loadingOlder: false,
    send: vi.fn(),
    edit: vi.fn(),
    remove: vi.fn(),
    react: vi.fn(),
  }),
}));

beforeEach(() => {
  mocks.authenticated = false;
  mocks.canPost = false;
  mocks.pending = false;
  mocks.access = { isMember: false, isEditor: false, canEdit: false, isLoading: false };
  mocks.joinStatus = 'idle';
  mocks.join.mockReset();
  mocks.refetchRooms.mockReset();
});
afterEach(cleanup);

const joinButton = () => screen.queryByRole('button', { name: SPACE_CHAT_VIEW_COPY.join });

describe('SpaceChatPanel composer', () => {
  it('offers a signed-out reader the join path', () => {
    render(<SpaceChatPanel spaceId={SPACE} />);
    expect(screen.getByText(SPACE_CHAT_COPY.join('Geo'))).toBeInTheDocument();
    fireEvent.click(joinButton()!);
    expect(mocks.join).toHaveBeenCalled();
  });

  it('offers a signed-in non-member the join path', () => {
    mocks.authenticated = true;
    render(<SpaceChatPanel spaceId={SPACE} />);
    expect(screen.getByText(SPACE_CHAT_COPY.join('Geo'))).toBeInTheDocument();
    expect(joinButton()).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('shows a pending request, then refetches the rooms when it resolves', () => {
    mocks.authenticated = true;
    mocks.pending = true;
    const { rerender } = render(<SpaceChatPanel spaceId={SPACE} />);
    expect(screen.getByText(SPACE_CHAT_VIEW_COPY.membershipPending)).toBeInTheDocument();
    expect(joinButton()).not.toBeInTheDocument();
    expect(mocks.refetchRooms).not.toHaveBeenCalled();

    mocks.pending = false;
    rerender(<SpaceChatPanel spaceId={SPACE} />);
    expect(mocks.refetchRooms).toHaveBeenCalled();
  });

  it('refetches the rooms on window focus while the viewer cannot post', () => {
    mocks.authenticated = true;
    render(<SpaceChatPanel spaceId={SPACE} />);
    act(() => void window.dispatchEvent(new Event('focus')));
    expect(mocks.refetchRooms).toHaveBeenCalledTimes(1);
  });

  it('tells a member geo-chat has not synced yet that posting opens soon', () => {
    mocks.authenticated = true;
    mocks.access = { isMember: true, isEditor: false, canEdit: false, isLoading: false };
    render(<SpaceChatPanel spaceId={SPACE} />);
    expect(screen.getByText(SPACE_CHAT_COPY.joining)).toBeInTheDocument();
    expect(joinButton()).not.toBeInTheDocument();
    expect(mocks.refetchRooms).toHaveBeenCalled();
  });

  it('gives a member who can post the composer', () => {
    mocks.authenticated = true;
    mocks.canPost = true;
    mocks.access = { isMember: true, isEditor: false, canEdit: false, isLoading: false };
    render(<SpaceChatPanel spaceId={SPACE} />);
    expect(screen.getByRole('textbox')).toBeInTheDocument();
    expect(joinButton()).not.toBeInTheDocument();
    act(() => void window.dispatchEvent(new Event('focus')));
    expect(mocks.refetchRooms).not.toHaveBeenCalled();
  });
});
