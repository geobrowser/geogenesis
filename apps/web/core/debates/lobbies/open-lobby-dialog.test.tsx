import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ mutate: vi.fn(), pickerAdded: [] as readonly string[] }));

vi.mock('./hooks', () => ({
  useCreateDebateLobby: () => ({ mutate: mocks.mutate, data: undefined, error: null, isPending: false }),
}));
vi.mock('./lobby-analytics', () => ({ lobbyShareUrl: (id: string) => `/debate/${id}`, markLobbyEntry: vi.fn() }));
vi.mock('../use-scroll-lock', () => ({ useScrollLock: () => {} }));
// The real picker reads the graph; here it offers six pages and reports what it was told is added.
vi.mock('./lobby-claim-list-picker', async importOriginal => ({
  ...(await importOriginal<typeof import('./lobby-claim-list-picker')>()),
  ClaimListPicker: ({
    addedIds,
    onPick,
  }: {
    addedIds: readonly string[];
    onPick: (option: { entityId: string; spaceId: string; name: string }) => void;
  }) => {
    mocks.pickerAdded = addedIds;
    return (
      <div>
        {['a', 'b', 'c', 'd', 'e', 'f'].map(id => (
          <button
            key={id}
            type="button"
            onClick={() => onPick({ entityId: `page-${id}`, spaceId: `space-${id}`, name: `List ${id}` })}
          >
            Pick list {id}
          </button>
        ))}
      </div>
    );
  },
}));
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
const { claimListsRequestField } = await import('./open-lobby-claim-lists');

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

describe('claim lists when opening a lobby (GEO-3275)', () => {
  const pick = (id: string) => {
    fireEvent.click(screen.getByRole('button', { name: 'Add a list' }));
    fireEvent.click(screen.getByRole('button', { name: `Pick list ${id}` }));
  };
  const nameAndSubmit = () => {
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'AI night' } });
    fireEvent.click(screen.getByRole('button', { name: /Open lobby|Schedule lobby/ }));
  };

  it('sends nothing new when the field is skipped', () => {
    mocks.mutate.mockClear();
    render(<OpenLobbyDialog onClose={vi.fn()} />);
    expect(screen.getByRole('group', { name: 'Claim lists' })).toHaveTextContent('Optional');
    nameAndSubmit();
    expect(mocks.mutate).toHaveBeenCalledWith({ name: 'AI night' });
    expect(claimListsRequestField([])).toEqual({});
  });

  it('sends picked lists in pick order, without the ones removed', () => {
    mocks.mutate.mockClear();
    render(<OpenLobbyDialog onClose={vi.fn()} />);
    pick('b');
    pick('a');
    pick('c');
    fireEvent.click(screen.getByRole('button', { name: 'Add a list' }));
    // Picked pages are passed back to the picker as added, so they cannot be picked twice.
    expect(mocks.pickerAdded).toEqual(['page-b', 'page-a', 'page-c']);
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: 'Remove List a' }));

    nameAndSubmit();
    expect(mocks.mutate).toHaveBeenCalledWith({
      name: 'AI night',
      claim_lists: [
        { entity_id: 'page-b', space_id: 'space-b' },
        { entity_id: 'page-c', space_id: 'space-c' },
      ],
    });
  });

  it('carries the lists on a scheduled lobby too', () => {
    mocks.mutate.mockClear();
    render(<OpenLobbyDialog onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('radio', { name: 'Schedule a start time' }));
    pick('a');
    nameAndSubmit();
    const body = mocks.mutate.mock.calls[0]![0];
    expect(body.starts_at).toEqual(expect.any(String));
    expect(body.claim_lists).toEqual([{ entity_id: 'page-a', space_id: 'space-a' }]);
  });

  // The dialog closes on Escape; with the picker open over it, Escape is the picker's.
  it('closes only the picker on Escape while it is open', async () => {
    const onClose = vi.fn();
    render(<OpenLobbyDialog onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add a list' }));
    expect(screen.getByRole('button', { name: 'Pick list a' })).toBeTruthy();

    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Pick list a' })).toBeNull());
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('stops offering more at five lists', () => {
    render(<OpenLobbyDialog onClose={vi.fn()} />);
    for (const id of ['a', 'b', 'c', 'd', 'e']) pick(id);
    expect(screen.queryByRole('button', { name: 'Add a list' })).toBeNull();
    expect(screen.getByText(/Up to 5 lists/)).toBeTruthy();
  });
});
