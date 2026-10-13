import { describe, expect, it } from 'vitest';

import { lobbiesCalendarHref } from '../matchmaking/debate-calendar-route';
import { lobbyBadgeTime, lobbyByline, lobbyDayLabel } from './upcoming-lobbies';

// Wednesday 14 October 2026, noon local.
const NOW = new Date(2026, 9, 14, 12, 0).getTime();
const at = (day: number, hour: number, minute = 0) => new Date(2026, 9, day, hour, minute).toISOString();

describe('lobbyDayLabel', () => {
  it('says Today and Tomorrow, then the weekday within a week, then the date', () => {
    expect(lobbyDayLabel(at(14, 18), NOW)).toBe('Today');
    expect(lobbyDayLabel(at(15, 9), NOW)).toBe('Tomorrow');
    expect(lobbyDayLabel(at(17, 11), NOW)).toBe(
      new Date(2026, 9, 17).toLocaleDateString(undefined, { weekday: 'short' })
    );
    expect(lobbyDayLabel(at(28, 11), NOW)).toBe(
      new Date(2026, 9, 28).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    );
  });
});

describe('lobbyBadgeTime', () => {
  it('drops the minutes on the hour and keeps them off it', () => {
    expect(lobbyBadgeTime(at(14, 16))).toBe(
      new Date(2026, 9, 14, 16).toLocaleTimeString(undefined, { hour: 'numeric' })
    );
    expect(lobbyBadgeTime(at(14, 16, 30))).toContain('30');
  });
});

describe('lobbyByline', () => {
  const host = { user_id: 'u1', profile_space_id: 's1', display_name: 'Bryan', avatar_cid: null };

  it('names the host, and adds who is going once anyone has RSVP’d', () => {
    expect(lobbyByline({ hosts: [host], reminder_count: 0 })).toBe('Bryan');
    expect(lobbyByline({ hosts: [host], reminder_count: 6 })).toBe('Bryan · 6 going');
  });
});

describe('lobbiesCalendarHref', () => {
  it('opens the calendar on its Lobbies view, keeping where it came from', () => {
    expect(lobbiesCalendarHref('/explore')).toBe('/matchmaking/calendar?from=%2Fexplore&view=lobbies');
    expect(lobbiesCalendarHref(null)).toBe('/matchmaking/calendar?view=lobbies');
  });
});
