import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  mutate: vi.fn(),
  setToast: vi.fn(),
  error: null as unknown,
}));

vi.mock('./hooks', () => ({
  useUpdateDebateLobby: () => ({ mutate: mocks.mutate, error: mocks.error, isPending: false }),
}));
vi.mock('~/core/hooks/use-toast', () => ({ useToast: () => [null, mocks.setToast] }));
vi.mock('../use-scroll-lock', () => ({ useScrollLock: () => {} }));
// The graph names a saved list; here its page id is its name.
vi.mock('./lobby-claim-list-tab', () => ({
  useClaimListName: (list: { entity_id: string }) => `Saved ${list.entity_id}`,
}));
vi.mock('./lobby-claim-list-picker', async importOriginal => ({
  ...(await importOriginal<typeof import('./lobby-claim-list-picker')>()),
  ClaimListPicker: () => null,
}));

const { EDIT_LOBBY_COPY, EditLobbyButton, EditLobbyDialog, canEditLobby, canMoveLobby, lobbyEditRequestFor } =
  await import('./edit-lobby-dialog');
const { toDateTimeLocalValue } = await import('./open-lobby-dialog');
const { GeoChatRequestError } = await import('../api');

type Lobby = Parameters<typeof EditLobbyDialog>[0]['lobby'];

const STARTS_AT = new Date(Date.now() + 2 * 3_600_000);
STARTS_AT.setSeconds(0, 0);

function lobby(overrides: Partial<Lobby> = {}): Lobby {
  return {
    lobby_id: 'lobby-1',
    name: 'Debate hour',
    purpose: 'lobby',
    starts_at: STARTS_AT.toISOString(),
    scheduled: true,
    access: { status: 'not_yet_open', opens_at: new Date(STARTS_AT.getTime() - 600_000).toISOString() },
    reminder_count: 14,
    claim_lists: [],
    viewer: { role: 'host', hosting: false },
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  mocks.mutate.mockReset();
  mocks.setToast.mockReset();
  mocks.error = null;
});

describe('lobbyEditRequestFor', () => {
  const now = new Date(2026, 9, 5, 12, 0).getTime();
  const saved = { name: 'Debate hour', starts_at: new Date(2026, 9, 6, 19, 0).toISOString() };
  const savedLocal = toDateTimeLocalValue(new Date(saved.starts_at));
  const lists = [
    { entityId: 'a', spaceId: 's' },
    { entityId: 'b', spaceId: 's' },
  ];

  it('sends nothing when nothing changed', () => {
    expect(
      lobbyEditRequestFor(saved, lists, { name: ' Debate hour ', startsAtLocal: savedLocal, claimLists: lists }, now)
    ).toEqual({ body: {} });
  });

  it('sends only what changed', () => {
    expect(
      lobbyEditRequestFor(saved, lists, { name: 'Late debate', startsAtLocal: savedLocal, claimLists: lists }, now)
    ).toEqual({ body: { name: 'Late debate' } });
    expect(
      lobbyEditRequestFor(
        saved,
        lists,
        { name: 'Debate hour', startsAtLocal: '2026-10-07T20:30', claimLists: lists },
        now
      )
    ).toEqual({ body: { starts_at: new Date(2026, 9, 7, 20, 30).toISOString() } });
  });

  it('sends every list, in order, once the lists change', () => {
    expect(
      lobbyEditRequestFor(saved, lists, { name: 'Debate hour', startsAtLocal: null, claimLists: [lists[1]] }, now)
    ).toEqual({ body: { claim_lists: [{ entity_id: 'b', space_id: 's' }] } });
    expect(
      lobbyEditRequestFor(
        saved,
        lists,
        { name: 'Debate hour', startsAtLocal: null, claimLists: [lists[1], lists[0]] },
        now
      )
    ).toEqual({
      body: {
        claim_lists: [
          { entity_id: 'b', space_id: 's' },
          { entity_id: 'a', space_id: 's' },
        ],
      },
    });
  });

  it('ignores the start when it cannot move', () => {
    expect(lobbyEditRequestFor(saved, [], { name: 'Debate hour', startsAtLocal: null, claimLists: [] }, now)).toEqual({
      body: {},
    });
  });

  it('refuses what geo-chat would', () => {
    const edit = (name: string, startsAtLocal: string) =>
      lobbyEditRequestFor(saved, [], { name, startsAtLocal, claimLists: [] }, now);
    expect(edit('   ', savedLocal)).toEqual({ error: 'Name the lobby.' });
    expect(edit('Debate hour', '2026-10-05T11:00')).toEqual({ error: 'Pick a time in the future.' });
    expect(edit('Debate hour', '2026-12-25T11:00')).toEqual({ error: 'Pick a time within 30 days.' });
    expect(edit('Debate hour', '')).toEqual({ error: 'Pick a start time.' });
  });
});

describe('who may edit', () => {
  it('is any host, present or not, or the acting host, until the lobby closes', () => {
    expect(canEditLobby(lobby())).toBe(true);
    expect(canEditLobby(lobby({ viewer: { role: 'listener', hosting: true }, access: { status: 'admitted' } }))).toBe(
      true
    );
    expect(canEditLobby(lobby({ viewer: { role: 'speaker', hosting: false } }))).toBe(false);
    expect(canEditLobby(lobby({ viewer: { role: null, hosting: false } }))).toBe(false);
    expect(canEditLobby(lobby({ access: { status: 'closed', reason: 'ended' } }))).toBe(false);
    expect(canEditLobby(lobby({ purpose: 'call' }))).toBe(false);
  });

  it('moves the start only before the door opens', () => {
    expect(canMoveLobby(lobby())).toBe(true);
    expect(canMoveLobby(lobby({ access: { status: 'admitted' } }))).toBe(false);
    expect(canMoveLobby(lobby({ scheduled: false, access: { status: 'admitted' } }))).toBe(false);
  });

  it('shows Edit lobby to hosts only', () => {
    const { rerender } = render(<EditLobbyButton lobby={lobby({ viewer: { role: 'speaker', hosting: false } })} />);
    expect(screen.queryByRole('button', { name: EDIT_LOBBY_COPY.open })).toBeNull();

    rerender(<EditLobbyButton lobby={lobby()} />);
    fireEvent.click(screen.getByRole('button', { name: EDIT_LOBBY_COPY.open }));
    expect(screen.getByRole('dialog', { name: EDIT_LOBBY_COPY.title })).toBeInTheDocument();
  });
});

describe('EditLobbyDialog', () => {
  it('warns that a new time is emailed to everyone going, and saves only the time', () => {
    const onClose = vi.fn();
    render(<EditLobbyDialog lobby={lobby()} onClose={onClose} />);
    expect(screen.getByText(EDIT_LOBBY_COPY.opensEarly)).toBeInTheDocument();
    expect(screen.queryByText(EDIT_LOBBY_COPY.willEmail(14), { exact: false })).toBeNull();

    // The dialog renders in a portal on the body.
    const moved = toDateTimeLocalValue(new Date(STARTS_AT.getTime() + 3_600_000));
    fireEvent.change(document.querySelector('input[type="date"]')!, { target: { value: moved.slice(0, 10) } });
    fireEvent.change(document.querySelector('input[type="time"]')!, { target: { value: moved.slice(11) } });
    expect(screen.getByText(EDIT_LOBBY_COPY.willEmail(14), { exact: false })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: EDIT_LOBBY_COPY.save }));
    const [body, options] = mocks.mutate.mock.calls[0];
    expect(body).toEqual({ starts_at: new Date(moved).toISOString() });
    options.onSuccess();
    expect(mocks.setToast).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('has no start to change once the lobby is open, but still renames it', () => {
    render(
      <EditLobbyDialog
        lobby={lobby({ access: { status: 'admitted' }, viewer: { role: 'host', hosting: true } })}
        onClose={() => {}}
      />
    );
    expect(screen.queryByText('Start time')).toBeNull();

    fireEvent.change(screen.getByDisplayValue('Debate hour'), { target: { value: 'Late debate' } });
    fireEvent.click(screen.getByRole('button', { name: EDIT_LOBBY_COPY.save }));
    expect(mocks.mutate.mock.calls[0][0]).toEqual({ name: 'Late debate' });
  });

  it('starts from the lobby’s lists, named from the graph, and sends what is left', () => {
    render(
      <EditLobbyDialog
        lobby={lobby({
          claim_lists: [
            { entity_id: 'p1', space_id: 's1', position: 0, added_by: null, added_at: '' },
            { entity_id: 'p2', space_id: 's2', position: 1, added_by: null, added_at: '' },
          ],
        })}
        onClose={() => {}}
      />
    );
    expect(screen.getByText('Saved p1')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Remove Saved p1' }));
    fireEvent.click(screen.getByRole('button', { name: EDIT_LOBBY_COPY.save }));
    expect(mocks.mutate.mock.calls[0][0]).toEqual({ claim_lists: [{ entity_id: 'p2', space_id: 's2' }] });
  });

  it('closes without a request when nothing changed', () => {
    const onClose = vi.fn();
    render(<EditLobbyDialog lobby={lobby()} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: EDIT_LOBBY_COPY.save }));
    expect(mocks.mutate).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('says the lobby opened when its start can no longer move', () => {
    mocks.error = new GeoChatRequestError('opened', 'lobby_already_open', 409);
    render(<EditLobbyDialog lobby={lobby()} onClose={() => {}} />);
    expect(screen.getByText(EDIT_LOBBY_COPY.openedMeanwhile)).toBeInTheDocument();
  });
});
