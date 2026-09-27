import { describe, expect, it } from 'vitest';

import { debateRoomIdFromPath, debateRoomPath, isDebateRoomPath } from './room-routes';

describe('debateRoomPath', () => {
  it('is top-level and carries no space id', () => {
    expect(debateRoomPath('room-1')).toBe('/debate/room-1');
  });
});

describe('isDebateRoomPath', () => {
  it('matches a room', () => {
    expect(isDebateRoomPath('/debate/room-1')).toBe(true);
  });

  // A deep link's query string must not stop the path checks recognising the room.
  it.each([
    ['a query string', '/debate/room-1?via=calendar'],
    ['a fragment', '/debate/room-1#claims'],
  ])('matches a room with %s', (_label, pathname) => {
    expect(isDebateRoomPath(pathname)).toBe(true);
  });

  // Exactly one segment under `/debate`. Anything longer is a sibling of the room, not the room.
  it.each([
    ['the bare prefix', '/debate'],
    ['a sub-route', '/debate/room-1/recording'],
    ['the rematch route', '/space/space-1/debates/rematches/session-1'],
    ['the debate room route', '/space/space-1/debates/debate-1'],
    ['Explore', '/explore'],
    ['a space whose id starts with the prefix', '/space/debate-ish'],
  ])('does not match %s', (_label, pathname) => {
    expect(isDebateRoomPath(pathname)).toBe(false);
  });
});

describe('debateRoomIdFromPath', () => {
  it('reads the id off a room path', () => {
    expect(debateRoomIdFromPath('/debate/room-1?via=calendar')).toBe('room-1');
  });

  it('is null off a path that is not a room', () => {
    expect(debateRoomIdFromPath('/debate/room-1/recording')).toBeNull();
  });
});
