import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ mutate: vi.fn() }));

vi.mock('./hooks', () => ({
  useCreateDebateLobby: () => ({ mutate: mocks.mutate, data: undefined, error: null, isPending: false }),
}));
vi.mock('./lobby-analytics', () => ({ lobbyShareUrl: (id: string) => `/debate/${id}`, markLobbyEntry: vi.fn() }));
vi.mock('../use-scroll-lock', () => ({ useScrollLock: () => {} }));
// Radix measures the hidden input it adds to radios inside a form; jsdom has no ResizeObserver.
vi.stubGlobal(
  'ResizeObserver',
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
);

const { OpenLobbyDialog, lobbyRequestFor, localTimeZone, toDateTimeLocalValue } = await import('./open-lobby-dialog');

afterEach(cleanup);

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

describe('OpenLobbyDialog', () => {
  it('titles and describes the dialog, and offers Open now and Schedule a start time', () => {
    render(<OpenLobbyDialog onClose={vi.fn()} />);
    expect(screen.getByRole('dialog', { name: 'Open a debate lobby' })).toBeTruthy();
    expect(screen.getByText(/A voice room anyone can join/)).toBeTruthy();
    expect(screen.getByRole('radiogroup', { name: 'When' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Open now' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('radio', { name: 'Schedule a start time' }).getAttribute('aria-checked')).toBe('false');
    expect(screen.queryByLabelText('Date')).toBeNull();
  });

  it('schedules from separate date and time fields, labelled with the time zone', () => {
    mocks.mutate.mockClear();
    render(<OpenLobbyDialog onClose={vi.fn()} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Hour' } });
    fireEvent.click(screen.getByRole('radio', { name: 'Schedule a start time' }));
    expect(screen.getByRole('radio', { name: 'Schedule a start time' }).getAttribute('aria-checked')).toBe('true');

    const zone = localTimeZone();
    expect(zone).toBeTruthy();
    expect(screen.getByText(`· ${zone}`)).toBeTruthy();

    const start = new Date(Date.now() + 2 * 86_400_000);
    start.setHours(18, 0, 0, 0);
    const local = toDateTimeLocalValue(start);
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: local.slice(0, 10) } });
    fireEvent.change(screen.getByLabelText(/^Start time/), { target: { value: local.slice(11) } });
    fireEvent.click(screen.getByRole('button', { name: 'Schedule lobby' }));

    expect(mocks.mutate).toHaveBeenCalledWith({ name: 'Hour', starts_at: start.toISOString() });
  });
});
