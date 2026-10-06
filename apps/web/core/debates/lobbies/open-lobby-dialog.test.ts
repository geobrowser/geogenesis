import { describe, expect, it } from 'vitest';

import { lobbyRequestFor, toDateTimeLocalValue } from './open-lobby-dialog';

describe('lobbyRequestFor', () => {
  const now = new Date(2026, 9, 5, 12, 0).getTime();

  it('opens now with a trimmed name and no start', () => {
    expect(lobbyRequestFor('  Debate hour ', 'now', '', now)).toEqual({ body: { name: 'Debate hour' } });
  });

  it('sends a future local start as an instant', () => {
    const local = toDateTimeLocalValue(new Date(2026, 9, 6, 18, 0));
    expect(local).toBe('2026-10-06T18:00');
    expect(lobbyRequestFor('Hour', 'later', local, now)).toEqual({
      body: { name: 'Hour', starts_at: new Date(2026, 9, 6, 18, 0).toISOString() },
    });
  });

  it('refuses an empty name, a missing time and a past time', () => {
    expect(lobbyRequestFor('  ', 'now', '', now)).toEqual({ error: 'Name the lobby.' });
    expect(lobbyRequestFor('Hour', 'later', '', now)).toEqual({ error: 'Pick a start time.' });
    expect(lobbyRequestFor('Hour', 'later', '2026-10-05T11:00', now)).toEqual({ error: 'Pick a time in the future.' });
    expect(lobbyRequestFor('Hour', 'later', '2026-11-05T12:00', now)).toEqual({ error: 'Pick a time within 30 days.' });
  });

  // geo-chat counts characters; an emoji is two UTF-16 units but one character.
  it('counts the name in characters', () => {
    expect(lobbyRequestFor('😀'.repeat(120), 'now', '', now)).toEqual({ body: { name: '😀'.repeat(120) } });
    expect(lobbyRequestFor('a'.repeat(121), 'now', '', now)).toEqual({ error: 'Keep the name to 120 characters.' });
  });
});
