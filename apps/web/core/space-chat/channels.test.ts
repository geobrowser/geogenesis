import { describe, expect, it } from 'vitest';

import type { SpaceChatRoom } from './api';
import {
  canArchiveChannel,
  channelName,
  findChannel,
  isValidChannelName,
  lockedChannelSettings,
  normalizeChannelName,
  permissionsLine,
  sortChannels,
  spaceUnreadCount,
  unreadLabel,
} from './channels';

function room(overrides: Partial<SpaceChatRoom>): SpaceChatRoom {
  return {
    id: '0192aaaa-0000-7000-8000-000000000001',
    public_dao_space_id: 'p',
    space_id: 's',
    kind: 'channel',
    key: 'k',
    ...overrides,
  };
}

describe('channelName', () => {
  it('names the two original rooms on a geo-chat without channels', () => {
    expect(channelName(room({ kind: 'member' }))).toBe('general');
    expect(channelName(room({ kind: 'editor' }))).toBe('editors');
    expect(channelName(room({ kind: 'channel', name: 'markets' }))).toBe('markets');
  });
});

describe('sortChannels', () => {
  it('sorts by position, then id, with the original rooms first when unpositioned', () => {
    const a = room({ id: '02', name: 'b', position: 2 });
    const b = room({ id: '01', name: 'a', position: 2 });
    const general = room({ id: '09', kind: 'member' });
    const editors = room({ id: '08', kind: 'editor' });
    expect(sortChannels([a, editors, b, general]).map(channelName)).toEqual(['general', 'editors', 'a', 'b']);
  });
});

describe('findChannel', () => {
  it('prefers the live channel over an archived one with the same name', () => {
    const archived = room({ id: '01', name: 'markets', archived: true });
    const live = room({ id: '02', name: 'markets' });
    expect(findChannel([archived, live], 'Markets')?.id).toBe('02');
    expect(findChannel([archived], 'markets')?.id).toBe('01');
    expect(findChannel([live], 'nope')).toBeNull();
  });
});

describe('channel names', () => {
  it('normalizes typing toward a slug', () => {
    expect(normalizeChannelName('DeFi News!')).toBe('defi-news');
    expect(normalizeChannelName('x'.repeat(40))).toHaveLength(32);
  });

  it('accepts what geo-chat accepts', () => {
    expect(isValidChannelName('markets')).toBe(true);
    expect(isValidChannelName('2026-q1')).toBe(true);
    expect(isValidChannelName('-lead')).toBe(false);
    expect(isValidChannelName('')).toBe(false);
  });
});

describe('unreadLabel', () => {
  it('hides zero and caps at 99+', () => {
    expect(unreadLabel(0)).toBeNull();
    expect(unreadLabel(null)).toBeNull();
    expect(unreadLabel(6)).toBe('6');
    expect(unreadLabel(100)).toBe('99+');
  });
});

describe('permissionsLine', () => {
  it('matches the design copy', () => {
    expect(permissionsLine('everyone', 'members_and_editors')).toBe('Everyone can read. Members can post.');
    expect(permissionsLine('everyone', 'editors_only')).toBe('Everyone can read. Editors post, members reply.');
    expect(permissionsLine('editors_only', 'editors_only')).toBe('Only editors can read and post.');
    expect(permissionsLine('invited', 'members_and_editors')).toBe('Only invited people can read and post.');
  });
});

describe('channel locks', () => {
  it('locks #general but its description, and #editors name, read and archive', () => {
    expect([...lockedChannelSettings({ kind: 'member' })].sort()).toEqual([
      'name',
      'post_policy',
      'read_policy',
      'slow_mode',
    ]);
    expect([...lockedChannelSettings({ kind: 'editor' })].sort()).toEqual(['name', 'read_policy']);
    expect(lockedChannelSettings({ kind: 'channel' }).size).toBe(0);
    expect([canArchiveChannel({ kind: 'member' }), canArchiveChannel({ kind: 'editor' })]).toEqual([false, false]);
    expect(canArchiveChannel({ kind: 'channel' })).toBe(true);
  });
});

describe('spaceUnreadCount', () => {
  it('adds the live channels’ unread counts, skipping archived ones', () => {
    expect(
      spaceUnreadCount([{ unread_count: 3 }, { unread_count: 120 }, { unread_count: 5, archived: true }, {}])
    ).toBe(123);
    expect(unreadLabel(spaceUnreadCount([{ unread_count: 3 }, { unread_count: 120 }]))).toBe('99+');
  });
});
