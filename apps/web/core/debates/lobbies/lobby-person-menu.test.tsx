import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DebateLobbyMember } from '../api';
import type { LobbyPageView } from './lobby-view';

const mocks = vi.hoisted(() => ({
  phone: true,
  guest: true,
  /** Whether the person menu was still up when the queued request opened sign-in. */
  menuOpenAtSignIn: null as boolean | null,
  request: vi.fn(),
  openProfile: vi.fn(),
  moderate: vi.fn(),
}));

vi.mock('~/core/hooks/use-is-phone-layout', () => ({ useIsPhoneLayout: () => mocks.phone }));
vi.mock('~/core/debates/browse/use-open-debater-profile', () => ({ useOpenDebaterProfile: () => mocks.openProfile }));
vi.mock('./lobby-guest-hooks', () => ({ useIsLobbyGuest: () => mocks.guest }));
vi.mock('./lobby-queued-request', () => ({
  LOBBY_QUEUED_REQUEST_COPY: { signUpToSend: 'Sign up to send' },
  useLobbyQueuedRequest: () => ({ pending: null, request: mocks.request }),
}));
vi.mock('./moderation-hooks', () => ({
  useModerateLobbyMember: () => ({
    mutate: mocks.moderate,
    reset: vi.fn(),
    isPending: false,
    isError: false,
    error: null,
  }),
}));

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
window.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;

const { LobbyPersonMenu } = await import('./lobby-person-menu');

const daniel: DebateLobbyMember = {
  user_id: 'daniel',
  profile_space_id: 'space-daniel',
  display_name: 'Daniel',
  avatar_cid: null,
  role: 'speaker',
  creator: false,
  acting_host: false,
  on_roster_since: '2026-10-09T10:00:00Z',
  stepped_out: false,
  in_debate: false,
};

function lobby(hosting: boolean): LobbyPageView {
  return {
    lobby_id: 'lobby1',
    name: 'Onboarding',
    access: { status: 'admitted' },
    starts_at: '2026-10-09T10:00:00Z',
    opens_at: '2026-10-09T10:00:00Z',
    scheduled: false,
    created_by: 'adam',
    acting_host_id: null,
    hosts_changed_at: null,
    reminder_count: 0,
    members: [daniel],
    viewer: {
      kind: 'member',
      role: hosting ? 'host' : 'speaker',
      creator: hosting,
      hosting,
      reminded: false,
      voice_away_at: null,
      connected: true,
      stepped_out: false,
    },
  };
}

function renderMenu(view: LobbyPageView, viewerId: string | null) {
  render(
    <LobbyPersonMenu lobby={view} member={daniel} isSelf={false} viewerId={viewerId} disagreements={null}>
      <button type="button">Daniel</button>
    </LobbyPersonMenu>
  );
  fireEvent.click(screen.getByRole('button', { name: 'Daniel' }));
}

beforeEach(() => {
  mocks.phone = true;
  mocks.guest = true;
  mocks.menuOpenAtSignIn = null;
  mocks.request.mockReset().mockImplementation(() => {
    mocks.menuOpenAtSignIn = screen.queryByTestId('lobby-person-card') !== null;
  });
  mocks.openProfile.mockReset();
  mocks.moderate.mockReset();
});

afterEach(cleanup);

describe('LobbyPersonMenu handing off to another overlay', () => {
  it.each([
    ['a phone sheet', true],
    ['a desktop dropdown', false],
  ])('closes %s before a guest’s request opens sign-in', async (_label, phone) => {
    mocks.phone = phone;
    renderMenu(lobby(false), null);

    fireEvent.click(screen.getByRole('button', { name: 'Request a debate with Daniel' }));
    expect(mocks.request).not.toHaveBeenCalled();
    await waitFor(() => expect(mocks.request).toHaveBeenCalledWith(daniel));
    expect(mocks.menuOpenAtSignIn).toBe(false);
    expect(document.body.style.pointerEvents).not.toBe('none');
  });

  it('opens the profile on the click and closes the sheet', () => {
    renderMenu(lobby(false), null);

    fireEvent.click(within(screen.getByTestId('lobby-person-card')).getByRole('button', { name: 'Daniel' }));
    expect(mocks.openProfile).toHaveBeenCalledOnce();
    expect(screen.queryByTestId('bottom-sheet')).toBeNull();
  });

  it('keeps the ban confirm inside the sheet, and closes once the ban lands', () => {
    mocks.guest = false;
    mocks.moderate.mockImplementation((_vars, options: { onSuccess: () => void }) => options.onSuccess());
    // No viewer id, so no member request (and its reads) in the card.
    renderMenu(lobby(true), null);

    const sheet = screen.getByTestId('bottom-sheet');
    fireEvent.click(within(sheet).getByRole('button', { name: 'Ban from lobby' }));
    expect(within(sheet).getByText(/Ban Daniel\?/)).toBeInTheDocument();
    fireEvent.click(within(sheet).getByRole('button', { name: 'Ban' }));
    expect(mocks.moderate).toHaveBeenCalledWith({ userId: 'daniel', action: 'ban' }, expect.anything());
    expect(screen.queryByTestId('bottom-sheet')).toBeNull();
  });

  it('removes from the sheet without a confirm, and closes', () => {
    mocks.guest = false;
    mocks.moderate.mockImplementation((_vars, options: { onSuccess: () => void }) => options.onSuccess());
    // No viewer id, so no member request (and its reads) in the card.
    renderMenu(lobby(true), null);

    fireEvent.click(within(screen.getByTestId('bottom-sheet')).getByRole('button', { name: 'Remove from lobby' }));
    expect(mocks.moderate).toHaveBeenCalledWith({ userId: 'daniel', action: 'remove' }, expect.anything());
    expect(screen.queryByTestId('bottom-sheet')).toBeNull();
  });
});
