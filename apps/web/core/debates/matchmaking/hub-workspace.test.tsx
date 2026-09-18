import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DebatesHubWorkspace } from './hub-workspace';

/**
 * The three claim lists are the panel's tabs and have their own suites; this one is about how the
 * workspace lets you move between them, since it has no tab strip to do it with.
 */
vi.mock('./claims-tab', () => ({
  ClaimsTab: ({ variant, scopePicker }: { variant?: string; scopePicker?: React.ReactNode }) => (
    <div data-testid={`claims-tab-${variant ?? 'explore'}`}>{scopePicker}</div>
  ),
}));

vi.mock('./lobby-tab', () => ({
  LobbyTab: ({ scopePicker }: { scopePicker?: React.ReactNode }) => <div data-testid="lobby-tab">{scopePicker}</div>,
}));

vi.mock('./hub-live-rail', () => ({ HubLiveRail: () => <div data-testid="hub-live-rail" /> }));

const mocks = vi.hoisted(() => ({ authenticated: true }));

vi.mock('../hooks', () => ({
  useGeoChatAuth: () => ({ ready: true, authenticated: mocks.authenticated, accountKey: 'user-a' }),
}));

// The picker reads it on arrival; these cases are about the picker itself.
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams() }));

// The picker is a popover, which measures itself. jsdom has no layout and no observer to report it.
beforeEach(() => {
  mocks.authenticated = true;
  window.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

afterEach(cleanup);

/** The closed trigger, named for whichever list is showing. `getAllBy` — the open menu repeats it. */
const picker = (label: string) => screen.getAllByRole('button', { name: label })[0];

describe('choosing which claim list the workspace shows', () => {
  it('opens on Lobby', () => {
    render(<DebatesHubWorkspace />);

    expect(screen.getByTestId('lobby-tab')).toBeInTheDocument();
    expect(picker('Lobby')).toBeInTheDocument();
  });

  it('offers the panel’s three lists, in its order', () => {
    render(<DebatesHubWorkspace />);

    fireEvent.click(picker('Lobby'));
    const labels = screen.getAllByRole('button').map(option => option.textContent ?? '');
    const offered = ['Lobby', 'Explore', 'My positions'].map(label => labels.findIndex(text => text.includes(label)));

    expect(offered.every(index => index > -1)).toBe(true);
    expect(offered).toEqual([...offered].sort((a, b) => a - b));
  });

  it('swaps the list rather than narrowing it', () => {
    render(<DebatesHubWorkspace />);

    fireEvent.click(picker('Lobby'));
    fireEvent.click(screen.getByRole('button', { name: 'My positions' }));

    expect(screen.getByTestId('claims-tab-positions')).toBeInTheDocument();
    expect(screen.queryByTestId('lobby-tab')).toBeNull();
  });

  it('gives Lobby its own component, not a ClaimsTab variant', () => {
    render(<DebatesHubWorkspace />);

    expect(screen.getByTestId('lobby-tab')).toBeInTheDocument();
    expect(screen.queryByTestId('claims-tab-lobby')).toBeNull();
  });

  /**
   * Explore describes the corpus, so it answers for anybody. Lobby is scored on who can debate
   * *you* and My positions is the viewer's own list — signed out they are questions with no
   * subject, and the panel draws the same line with `SIGNED_OUT_TABS`.
   */
  it('offers a signed-out viewer only the list that describes the corpus', () => {
    mocks.authenticated = false;
    render(<DebatesHubWorkspace />);

    fireEvent.click(picker('Explore'));
    const labels = screen.getAllByRole('button').map(option => option.textContent ?? '');

    expect(labels.some(label => label.includes('Explore'))).toBe(true);
    for (const gated of ['Lobby', 'My positions']) {
      expect(labels.some(label => label.includes(gated))).toBe(false);
    }
  });

  it('falls back to Explore for a viewer who cannot be offered the list they were on', () => {
    mocks.authenticated = false;
    render(<DebatesHubWorkspace />);

    expect(screen.getByTestId('claims-tab-explore')).toBeInTheDocument();
    expect(screen.queryByTestId('lobby-tab')).toBeNull();
  });

  it('hands the picker to whichever list is showing', () => {
    render(<DebatesHubWorkspace />);

    expect(within(screen.getByTestId('lobby-tab')).getAllByRole('button', { name: 'Lobby' })).toHaveLength(1);

    fireEvent.click(picker('Lobby'));
    fireEvent.click(screen.getByRole('button', { name: 'Explore' }));

    expect(within(screen.getByTestId('claims-tab-explore')).getAllByRole('button', { name: 'Explore' })).toHaveLength(
      1
    );
  });
});
