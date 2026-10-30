import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { afterEach, describe, expect, it } from 'vitest';

import { LobbyByline } from './lobby-host-names';
import { lobbyBadgeTime } from './upcoming-lobbies';

afterEach(cleanup);

const at = (day: number, hour: number, minute = 0) => new Date(2026, 9, day, hour, minute).toISOString();

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
    byline({ hosts: [host], reminder_count: 0, open: false });
    expect(screen.getByTestId('byline')).toHaveTextContent(/^Bryan$/);
    cleanup();
    byline({ hosts: [host], reminder_count: 6, open: false });
    expect(screen.getByTestId('byline')).toHaveTextContent(/^Bryan · 6 going$/);
  });

  it('links each host to their space', () => {
    byline({ hosts: [host, { ...host, user_id: 'u2', display_name: 'Priya' }], reminder_count: 0, open: false });
    expect(screen.getByTestId('byline')).toHaveTextContent(/^Bryan and Priya$/);
    expect(screen.getByRole('link', { name: 'Bryan' })).toHaveAttribute('href', expect.stringContaining(SPACE));
    expect(screen.getByRole('link', { name: 'Priya' })).toHaveAttribute('data-geo-analytics-label', 'Test host');
  });

  it('says Hosted by when asked, and drops who is going once the lobby is live', () => {
    byline({ hosts: [host], reminder_count: 6, open: true });
    expect(screen.getByTestId('byline')).toHaveTextContent(/^Bryan$/);
    cleanup();
    render(
      <p data-testid="byline">
        <LobbyByline lobby={{ hosts: [host], reminder_count: 6, open: false }} analyticsLabel="Test host" hostedBy />
      </p>
    );
    expect(screen.getByTestId('byline')).toHaveTextContent(/^Hosted by Bryan · 6 going$/);
  });

  it('leaves a host without a valid space as plain text', () => {
    byline({ hosts: [{ ...host, profile_space_id: 'not-a-space' }], reminder_count: 0, open: false });
    expect(screen.getByTestId('byline')).toHaveTextContent('Bryan');
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
