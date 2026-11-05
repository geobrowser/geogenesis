import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MEMBER_RECHECK_MS, SPACE_CHAT_COPY, SpaceChatPanel } from './space-chat-panel';
import { SPACE_CHAT_VIEW_COPY } from './space-chat-view';

const SPACE = '0243bd171b651379954685365870e6a6';

const mocks = vi.hoisted(() => ({
  ready: true,
  authenticated: false,
  settingUp: false,
  canPost: false,
  canModerate: false,
  pending: false,
  access: { isMember: false, isEditor: false, canEdit: false, isLoading: false },
  join: vi.fn(),
  signIn: vi.fn(),
  joinStatus: 'idle' as 'idle' | 'pending' | 'success' | 'error',
  refetchRooms: vi.fn(),
  messages: [] as unknown[],
}));

vi.mock('~/core/debates/hooks', () => ({
  useGeoChatAuth: () => ({ ready: mocks.ready, authenticated: mocks.authenticated }),
}));
vi.mock('~/core/debates/use-current-geo-chat-user-id', () => ({
  useCurrentGeoChatUserId: () => (mocks.authenticated ? 'viewer' : null),
}));
vi.mock('~/core/hooks/use-space', () => ({ useSpace: () => ({ space: { entity: { name: 'Geo' } } }) }));
vi.mock('~/core/hooks/use-join-space', () => ({
  useJoinSpace: () => ({ join: mocks.join, status: mocks.joinStatus, optimisticRequested: false }),
}));
vi.mock('~/core/hooks/use-privy-sign-in', () => ({ usePrivySignIn: () => mocks.signIn }));
vi.mock('~/core/hooks/use-pending-memberships', () => ({ useIsMembershipPending: () => mocks.pending }));
vi.mock('~/core/hooks/use-access-control', () => ({ useAccessControl: () => mocks.access }));
vi.mock('~/core/space-chat/people', () => ({
  useSpaceChatParticipants: () => [],
  useChatPeople: () => new Map(),
  unknownPerson: (id: string) => ({ id, name: id, avatarUrl: null, avatarSeed: id }),
}));
vi.mock('~/core/space-chat/hooks', () => ({
  useSpaceChatAuth: () => ({ ready: mocks.ready, auth: null, settingUp: mocks.settingUp }),
  useSpaceChatRooms: () => ({
    data: { supported: true, rooms: [] },
    isError: false,
    refetch: mocks.refetchRooms,
    memberRoom: {
      id: 'room',
      space_id: SPACE,
      kind: 'member',
      can_post: mocks.canPost,
      can_moderate: mocks.canModerate,
    },
  }),
  useSpaceChatRoom: () => ({
    state: { messages: mocks.messages, nextBefore: null, pending: [] },
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
  mocks.ready = true;
  mocks.authenticated = false;
  mocks.settingUp = false;
  mocks.canPost = false;
  mocks.canModerate = false;
  mocks.messages = [];
  mocks.pending = false;
  mocks.access = { isMember: false, isEditor: false, canEdit: false, isLoading: false };
  mocks.joinStatus = 'idle';
  mocks.join.mockReset();
  mocks.signIn.mockReset();
  mocks.refetchRooms.mockReset();
});
afterEach(cleanup);

const joinButton = () => screen.queryByRole('button', { name: SPACE_CHAT_VIEW_COPY.join });

describe('SpaceChatPanel composer', () => {
  it('offers a signed-out reader Log in', () => {
    render(<SpaceChatPanel spaceId={SPACE} />);
    expect(screen.getByText('Log in and join Geo to chat.')).toBeInTheDocument();
    expect(joinButton()).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: SPACE_CHAT_VIEW_COPY.logIn }));
    expect(mocks.signIn).toHaveBeenCalled();
    expect(mocks.join).not.toHaveBeenCalled();
  });

  it('offers no prompt until sign-in has resolved', () => {
    mocks.ready = false;
    render(<SpaceChatPanel spaceId={SPACE} />);
    expect(screen.queryByRole('button', { name: SPACE_CHAT_VIEW_COPY.logIn })).not.toBeInTheDocument();
    expect(screen.queryByText('Log in and join Geo to chat.')).not.toBeInTheDocument();
    expect(joinButton()).not.toBeInTheDocument();
  });

  it('offers a signed-in non-member Join space', () => {
    mocks.authenticated = true;
    render(<SpaceChatPanel spaceId={SPACE} />);
    expect(screen.getByText('Members of Geo can post here. Anyone can read.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: SPACE_CHAT_VIEW_COPY.logIn })).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    fireEvent.click(joinButton()!);
    expect(mocks.join).toHaveBeenCalled();
  });

  it.each([
    ['pending', SPACE_CHAT_VIEW_COPY.join, true],
    ['success', SPACE_CHAT_VIEW_COPY.membershipRequested, true],
    ['error', SPACE_CHAT_VIEW_COPY.joinRetry, false],
  ] as const)('labels Join space while the request is %s', (status, name, disabled) => {
    mocks.authenticated = true;
    mocks.joinStatus = status;
    render(<SpaceChatPanel spaceId={SPACE} />);
    const button = screen.getByRole('button', { name });
    if (disabled) expect(button).toBeDisabled();
    else expect(button).toBeEnabled();
  });

  it('names no space when its name is unknown', () => {
    expect(SPACE_CHAT_COPY.signedOut(null)).toBe('Log in and join this space to chat.');
    expect(SPACE_CHAT_COPY.nonMember(null)).toBe('Members of this space can post here. Anyone can read.');
  });

  it('shows a pending request, then refetches the rooms when it resolves', () => {
    mocks.authenticated = true;
    mocks.pending = true;
    const { rerender } = render(<SpaceChatPanel spaceId={SPACE} />);
    expect(screen.getByRole('button', { name: SPACE_CHAT_VIEW_COPY.membershipRequested })).toBeDisabled();
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

  describe('a member geo-chat has not synced yet', () => {
    const member = () => {
      mocks.authenticated = true;
      mocks.access = { isMember: true, isEditor: false, canEdit: false, isLoading: false };
    };
    const after = (ms: number) => act(() => void vi.advanceTimersByTime(ms));
    beforeEach(() => void vi.useFakeTimers());
    afterEach(() => void vi.useRealTimers());

    it('is re-checked at 15s, 30s, then every 60s, and no more after the last step', () => {
      member();
      render(<SpaceChatPanel spaceId={SPACE} />);
      mocks.refetchRooms.mockClear();
      after(14_999);
      expect(mocks.refetchRooms).toHaveBeenCalledTimes(0);
      after(1);
      expect(mocks.refetchRooms).toHaveBeenCalledTimes(1);
      after(30_000);
      expect(mocks.refetchRooms).toHaveBeenCalledTimes(2);
      after(59_999);
      expect(mocks.refetchRooms).toHaveBeenCalledTimes(2);
      after(1);
      expect(mocks.refetchRooms).toHaveBeenCalledTimes(3);
      const total = MEMBER_RECHECK_MS.reduce((sum, ms) => sum + ms, 0);
      after(total - 105_000);
      expect(mocks.refetchRooms).toHaveBeenCalledTimes(MEMBER_RECHECK_MS.length);
      after(60 * 60_000);
      expect(mocks.refetchRooms).toHaveBeenCalledTimes(MEMBER_RECHECK_MS.length);
    });

    it('still refetches on window focus once the schedule has stopped', () => {
      member();
      render(<SpaceChatPanel spaceId={SPACE} />);
      after(60 * 60_000);
      mocks.refetchRooms.mockClear();
      act(() => void window.dispatchEvent(new Event('focus')));
      expect(mocks.refetchRooms).toHaveBeenCalledTimes(1);
    });

    it('is not re-checked while the account is setting up, and is once geo-chat accepts it', () => {
      member();
      mocks.settingUp = true;
      const { rerender } = render(<SpaceChatPanel spaceId={SPACE} />);
      act(() => void window.dispatchEvent(new Event('focus')));
      after(60 * 60_000);
      expect(mocks.refetchRooms).not.toHaveBeenCalled();

      mocks.settingUp = false;
      rerender(<SpaceChatPanel spaceId={SPACE} />);
      expect(mocks.refetchRooms).toHaveBeenCalledTimes(1);
      after(15_000);
      expect(mocks.refetchRooms).toHaveBeenCalledTimes(2);
    });
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

describe('SpaceChatPanel delete', () => {
  const chatMessage = (id: string, author: string) => ({
    id,
    room_id: 'room',
    room_kind: 'member',
    author_id: author,
    client_nonce: id,
    reply_to_message_id: null,
    body: `message ${id}`,
    attachment_ids: [],
    created_at: '2026-11-02T12:00:00Z',
    edited_at: null,
    deleted_at: null,
    reactions: [],
  });
  const deleteButtons = () => screen.queryAllByRole('button', { name: 'Delete message' });

  beforeEach(() => {
    mocks.authenticated = true;
    mocks.messages = [
      chatMessage('0195000000007000800000000000000a', 'viewer'),
      chatMessage('0195000000007000800000000000000b', 'other'),
    ];
  });

  it('offers no Delete to a former member who can no longer post', () => {
    render(<SpaceChatPanel spaceId={SPACE} />);
    expect(deleteButtons()).toHaveLength(0);
  });

  it('offers Delete on the viewer’s own messages when they can post', () => {
    mocks.canPost = true;
    render(<SpaceChatPanel spaceId={SPACE} />);
    expect(deleteButtons()).toHaveLength(1);
  });

  it('offers Delete on everyone’s messages to a moderator', () => {
    mocks.canPost = true;
    mocks.canModerate = true;
    render(<SpaceChatPanel spaceId={SPACE} />);
    expect(deleteButtons()).toHaveLength(2);
  });
});

describe('SpaceChatPanel header and arrivals', () => {
  const chatMessage = (id: string, author: string) => ({
    id,
    room_id: 'room',
    room_kind: 'member',
    author_id: author,
    client_nonce: id,
    reply_to_message_id: null,
    body: `message ${id}`,
    attachment_ids: [],
    created_at: '2026-11-02T12:00:00Z',
    edited_at: null,
    deleted_at: null,
    reactions: [],
  });

  it('heads the chat with its access line, or the line it is given', () => {
    const { rerender } = render(<SpaceChatPanel spaceId={SPACE} />);
    expect(screen.getByRole('heading', { name: SPACE_CHAT_COPY.title })).toBeInTheDocument();
    expect(screen.getByText(SPACE_CHAT_COPY.access)).toBeInTheDocument();
    rerender(<SpaceChatPanel spaceId={SPACE} subtitle="Also here" />);
    expect(screen.getByText('Also here')).toBeInTheDocument();
    expect(screen.queryByText(SPACE_CHAT_COPY.access)).not.toBeInTheDocument();
  });

  it('reports someone else’s new message, not the first load or the viewer’s own', () => {
    mocks.authenticated = true;
    const onArrival = vi.fn();
    mocks.messages = [chatMessage('a1', 'other')];
    const { rerender } = render(<SpaceChatPanel spaceId={SPACE} onArrival={onArrival} />);
    expect(onArrival).not.toHaveBeenCalled();

    mocks.messages = [chatMessage('a2', 'viewer'), ...mocks.messages];
    rerender(<SpaceChatPanel spaceId={SPACE} onArrival={onArrival} />);
    expect(onArrival).not.toHaveBeenCalled();

    mocks.messages = [chatMessage('a3', 'other'), ...mocks.messages];
    rerender(<SpaceChatPanel spaceId={SPACE} onArrival={onArrival} />);
    expect(onArrival).toHaveBeenCalledTimes(1);

    // An older page leaves the newest in place.
    mocks.messages = [...mocks.messages, chatMessage('a0', 'other')];
    rerender(<SpaceChatPanel spaceId={SPACE} onArrival={onArrival} />);
    expect(onArrival).toHaveBeenCalledTimes(1);
  });
});

describe('SpaceChatPanel while geo-chat sets the account up', () => {
  it('shows the messages and the setting-up line, with no Log in, Join or error', () => {
    mocks.authenticated = true;
    mocks.settingUp = true;
    mocks.messages = [
      {
        id: '0195000000007000800000000000000c',
        room_id: 'room',
        room_kind: 'member',
        author_id: 'other',
        client_nonce: 'c',
        reply_to_message_id: null,
        body: 'already here',
        attachment_ids: [],
        created_at: '2026-11-02T12:00:00Z',
        edited_at: null,
        deleted_at: null,
        reactions: [],
      },
    ];
    render(<SpaceChatPanel spaceId={SPACE} />);
    expect(screen.getByText('already here')).toBeInTheDocument();
    expect(screen.getByText(SPACE_CHAT_COPY.settingUp)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: SPACE_CHAT_VIEW_COPY.logIn })).not.toBeInTheDocument();
    expect(joinButton()).not.toBeInTheDocument();
    expect(screen.queryByText(SPACE_CHAT_VIEW_COPY.failed)).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete message' })).not.toBeInTheDocument();
  });

  it('gives the composer back once the account is ready', () => {
    mocks.authenticated = true;
    mocks.canPost = true;
    mocks.settingUp = true;
    const { rerender } = render(<SpaceChatPanel spaceId={SPACE} />);
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    mocks.settingUp = false;
    rerender(<SpaceChatPanel spaceId={SPACE} />);
    expect(screen.getByRole('textbox')).toBeInTheDocument();
    expect(screen.queryByText(SPACE_CHAT_COPY.settingUp)).not.toBeInTheDocument();
  });
});
