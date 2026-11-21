import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SpaceChatRoom } from '~/core/space-chat/api';

import { SPACE_CHANNELS_COPY, SpaceChannels } from './space-channels';

const SPACE = '0243bd171b651379954685365870e6a6';

const mocks = vi.hoisted(() => ({
  channel: undefined as string | undefined,
  replace: vi.fn(),
  push: vi.fn(),
  revoked: false,
  readmit: vi.fn(),
  listedAt: 1,
  rooms: [] as SpaceChatRoom[],
  canManage: false,
  panel: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useParams: () => (mocks.channel ? { id: SPACE, channel: mocks.channel } : { id: SPACE }),
  useRouter: () => ({ replace: mocks.replace, push: mocks.push }),
}));
vi.mock('~/core/debates/debate-gateway', () => ({
  useDebateGatewayScope: () => undefined,
  useSpaceChatRoomRevoked: () => ({ revoked: mocks.revoked, readmit: mocks.readmit }),
}));
vi.mock('~/core/debates/hooks', () => ({ useGeoChatAuth: () => ({ ready: true, authenticated: true }) }));
vi.mock('~/core/debates/use-current-geo-chat-user-id', () => ({ useCurrentGeoChatUserId: () => 'viewer' }));
vi.mock('~/core/space-chat/people', () => ({ useSpaceChatParticipants: () => [] }));
vi.mock('~/core/space-chat/hooks', () => ({
  useChatViewer: () => ({ userId: 'viewer', personId: null }),
  useSpaceChatRooms: () => ({
    data: { supported: true, rooms: mocks.rooms, channelsEnabled: true, canManageChannels: mocks.canManage },
    isSuccess: true,
    isFetching: false,
    isError: false,
    dataUpdatedAt: mocks.listedAt,
    refetch: vi.fn(),
  }),
}));
vi.mock('./space-chat-panel', () => ({
  SPACE_CHAT_COPY: { unavailable: 'Chat isn’t available for this space.' },
  SpaceChatPanel: (props: { channel: SpaceChatRoom; subtitle: string; actions: React.ReactNode }) => {
    mocks.panel(props);
    return (
      <div data-testid="panel">
        {props.channel.name} · {props.subtitle}
        {props.actions}
      </div>
    );
  },
}));
vi.mock('./channel-settings-dialog', () => ({ ChannelSettingsDialog: () => null }));
vi.mock('./channel-people-dialog', () => ({ ChannelPeopleDialog: () => null }));

function room(overrides: Partial<SpaceChatRoom>): SpaceChatRoom {
  return {
    id: overrides.name ?? 'r',
    public_dao_space_id: 'p',
    space_id: SPACE,
    kind: 'channel',
    key: 'k',
    read_policy: 'everyone',
    post_policy: 'members_and_editors',
    ...overrides,
  };
}

const GENERAL = room({ name: 'general', kind: 'member', position: 0, unread_count: 3 });
const EDITORS = room({ name: 'editors', kind: 'editor', position: 1, read_policy: 'editors_only' });
const MARKETS = room({ name: 'markets', position: 2, unread_count: 120 });
const OLD = room({ name: 'old', position: 3, archived: true });

beforeEach(() => {
  mocks.channel = undefined;
  mocks.revoked = false;
  mocks.readmit.mockReset();
  mocks.listedAt = 1;
  mocks.rooms = [GENERAL, EDITORS, MARKETS, OLD];
  mocks.canManage = false;
  mocks.replace.mockReset();
  mocks.panel.mockReset();
});
afterEach(cleanup);

const list = () => screen.getByRole('navigation', { name: SPACE_CHANNELS_COPY.channels });

describe('SpaceChannels', () => {
  it('lists live channels in order with locks and unread badges, and opens #general by default', () => {
    render(<SpaceChannels spaceId={SPACE} />);
    const links = within(list()).getAllByRole('link');
    expect(links.map(link => link.textContent)).toEqual(['# general', '# editors', '# markets99+']);
    expect(links[0]).toHaveAttribute('aria-current', 'page');
    expect(links[0]).toHaveAttribute('href', `/space/${SPACE}/chat`);
    expect(links[2]).toHaveAttribute('href', `/space/${SPACE}/chat/markets`);
    expect(screen.getByTestId('panel')).toHaveTextContent('general · Everyone can read. Members can post.');
    expect(within(list()).queryByRole('button', { name: SPACE_CHANNELS_COPY.newChannel })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: SPACE_CHANNELS_COPY.settings })).not.toBeInTheDocument();
  });

  it('gives editors New channel and Settings', () => {
    mocks.canManage = true;
    render(<SpaceChannels spaceId={SPACE} />);
    expect(within(list()).getByRole('button', { name: SPACE_CHANNELS_COPY.newChannel })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: SPACE_CHANNELS_COPY.settings })).toBeInTheDocument();
  });

  it('opens an archived channel from its link, read-only, without listing it', () => {
    mocks.channel = 'old';
    render(<SpaceChannels spaceId={SPACE} />);
    expect(mocks.panel).toHaveBeenLastCalledWith(expect.objectContaining({ channel: OLD }));
    expect(within(list()).queryByText('# old')).not.toBeInTheDocument();
  });

  it.each(['%', '%E0%A4%A', '100%'])('shows no channel for %s in the route, without throwing', channel => {
    mocks.channel = channel;
    render(<SpaceChannels spaceId={SPACE} />);
    expect(screen.getByText(SPACE_CHANNELS_COPY.notFound(channel.toLowerCase()))).toBeInTheDocument();
  });

  it('says so for a channel that is not there', () => {
    mocks.channel = 'nope';
    render(<SpaceChannels spaceId={SPACE} />);
    expect(screen.getByText(SPACE_CHANNELS_COPY.notFound('nope'))).toBeInTheDocument();
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it('stays and subscribes again when a revoked channel is still in the next list read', () => {
    mocks.channel = 'markets';
    const { rerender } = render(<SpaceChannels spaceId={SPACE} />);
    mocks.revoked = true;
    rerender(<SpaceChannels spaceId={SPACE} />);
    expect(mocks.replace).not.toHaveBeenCalled();
    mocks.listedAt = Date.now() + 1;
    rerender(<SpaceChannels spaceId={SPACE} />);
    expect(mocks.readmit).toHaveBeenCalled();
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it('goes to #general with a notice when a revoked channel is gone from the next list read', () => {
    mocks.channel = 'markets';
    const { rerender } = render(<SpaceChannels spaceId={SPACE} />);
    mocks.revoked = true;
    mocks.rooms = [GENERAL];
    mocks.listedAt = Date.now() + 1;
    rerender(<SpaceChannels spaceId={SPACE} />);
    expect(mocks.readmit).not.toHaveBeenCalled();
    expect(mocks.replace).toHaveBeenCalledWith(`/space/${SPACE}/chat`);
    expect(screen.getByRole('status')).toHaveTextContent(SPACE_CHANNELS_COPY.lostAccess('markets'));
  });

  it('goes to #general with a notice once the open channel drops out of the list', () => {
    mocks.channel = 'markets';
    const { rerender } = render(<SpaceChannels spaceId={SPACE} />);
    mocks.rooms = [GENERAL];
    rerender(<SpaceChannels spaceId={SPACE} />);
    expect(mocks.replace).toHaveBeenCalledWith(`/space/${SPACE}/chat`);
  });

  it('follows the open channel to its new name', () => {
    mocks.channel = 'markets';
    const { rerender } = render(<SpaceChannels spaceId={SPACE} />);
    mocks.rooms = [GENERAL, { ...MARKETS, name: 'prices' }];
    rerender(<SpaceChannels spaceId={SPACE} />);
    expect(mocks.replace).toHaveBeenCalledWith(`/space/${SPACE}/chat/prices`);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
