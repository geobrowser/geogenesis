import { afterEach, describe, expect, it } from 'vitest';

import { clearRoomSessions, isRoomSession, rememberRoomSession } from './room-sessions';

afterEach(() => clearRoomSessions());

describe('room session registry', () => {
  it('remembers a session a room handed out', () => {
    rememberRoomSession('session-1');
    expect(isRoomSession('session-1')).toBe(true);
  });

  it('does not claim a session it was never given', () => {
    rememberRoomSession('session-1');
    expect(isRoomSession('session-2')).toBe(false);
    expect(isRoomSession(null)).toBe(false);
  });

  // The tab that opened the room is not the one that needs telling: `activity.rematch` reports the
  // room's session in every tab, so a per-document store let the other tabs route on it.
  it('picks up a session another tab recorded', () => {
    window.localStorage.setItem('geo.debates.room-sessions', JSON.stringify(['from-another-tab']));
    window.dispatchEvent(new StorageEvent('storage', { key: 'geo.debates.room-sessions' }));

    expect(isRoomSession('from-another-tab')).toBe(true);
  });

  it('survives unusable storage', () => {
    window.localStorage.setItem('geo.debates.room-sessions', 'not json');
    window.dispatchEvent(new StorageEvent('storage', { key: 'geo.debates.room-sessions' }));

    expect(isRoomSession('anything')).toBe(false);
  });
});
