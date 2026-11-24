import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SpaceChatRoom } from '~/core/space-chat/api';

import { CHANNEL_PEOPLE_COPY, ChannelPeopleDialog } from './channel-people-dialog';

const mocks = vi.hoisted(() => ({ members: [] as { user_id: string }[], change: vi.fn() }));
vi.mock('~/core/space-chat/channel-hooks', () => ({
  useSpaceChannelMembers: () => ({ data: mocks.members, isLoading: false, isError: false, change: mocks.change }),
}));
vi.mock('~/core/space-chat/people', () => ({
  useChatPeople: () => new Map(),
  unknownPerson: (id: string) => ({ id, name: id, avatarUrl: null, avatarSeed: id }),
}));

const room: SpaceChatRoom = {
  id: 'r',
  public_dao_space_id: 'p',
  space_id: 's',
  kind: 'channel',
  key: 'k',
  name: 'desk',
  read_policy: 'invited',
};
const viewer = { userId: 'viewer', personId: 'person' };

beforeEach(() => {
  mocks.change.mockReset();
  mocks.change.mockResolvedValue([]);
});
afterEach(cleanup);

describe('ChannelPeopleDialog (GEO-3818)', () => {
  it.each([
    ['an older geo-chat, by user id', 'viewer'],
    ['a newer geo-chat, by person id', 'person'],
  ])('lets the viewer leave when %s names them', async (_, wireId) => {
    mocks.members = [{ user_id: wireId }, { user_id: 'other' }];
    const onLeft = vi.fn();
    render(
      <ChannelPeopleDialog
        open
        onOpenChange={() => {}}
        room={room}
        canManage={false}
        viewer={viewer}
        candidates={[]}
        onLeft={onLeft}
      />
    );
    expect(screen.getAllByRole('button', { name: CHANNEL_PEOPLE_COPY.leave })).toHaveLength(1);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: CHANNEL_PEOPLE_COPY.leave }));
    });
    expect(mocks.change).toHaveBeenCalledWith([wireId], false);
    expect(onLeft).toHaveBeenCalled();
  });
});
