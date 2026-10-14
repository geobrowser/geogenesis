import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { afterEach, describe, expect, it } from 'vitest';

import { lobbiesCalendarHref } from '../matchmaking/debate-calendar-route';
import { LobbyByline, lobbyBadgeTime, lobbyDayLabel } from './upcoming-lobbies';

afterEach(cleanup);

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

describe('LobbyByline', () => {
  const SPACE = '0123456789abcdef0123456789abcdef';
  const host = { user_id: 'u1', profile_space_id: SPACE, display_name: 'Bryan', avatar_cid: null };
  const byline = (lobby: Parameters<typeof LobbyByline>[0]['lobby']) =>
    render(
      <p data-testid="byline">
        <LobbyByline lobby={lobby} analyticsLabel="Test host" />
      </p>
    );

  it('names the host, and adds who is going once anyone has RSVP’d', () => {
    byline({ hosts: [host], reminder_count: 0 });
    expect(screen.getByTestId('byline')).toHaveTextContent(/^Bryan$/);
    cleanup();
    byline({ hosts: [host], reminder_count: 6 });
    expect(screen.getByTestId('byline')).toHaveTextContent(/^Bryan · 6 going$/);
  });

  it('links each host to their space', () => {
    byline({ hosts: [host, { ...host, user_id: 'u2', display_name: 'Priya' }], reminder_count: 0 });
    expect(screen.getByTestId('byline')).toHaveTextContent(/^Bryan and Priya$/);
    expect(screen.getByRole('link', { name: 'Bryan' })).toHaveAttribute('href', expect.stringContaining(SPACE));
    expect(screen.getByRole('link', { name: 'Priya' })).toHaveAttribute('data-geo-analytics-label', 'Test host');
  });

  it('leaves a host without a valid space as plain text', () => {
    byline({ hosts: [{ ...host, profile_space_id: 'not-a-space' }], reminder_count: 0 });
    expect(screen.getByTestId('byline')).toHaveTextContent('Bryan');
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});

describe('lobbiesCalendarHref', () => {
  it('opens the calendar on its Lobbies view, keeping where it came from', () => {
    expect(lobbiesCalendarHref('/explore')).toBe('/matchmaking/calendar?from=%2Fexplore&view=lobbies');
    expect(lobbiesCalendarHref(null)).toBe('/matchmaking/calendar?view=lobbies');
  });
});
