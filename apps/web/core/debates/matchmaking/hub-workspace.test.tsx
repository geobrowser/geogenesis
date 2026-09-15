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

vi.mock('./matches-list', () => ({
  MatchesList: ({ scopePicker }: { scopePicker?: React.ReactNode }) => (
    <div data-testid="matches-list">{scopePicker}</div>
  ),
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
  it('opens on Featured', () => {
    render(<DebatesHubWorkspace />);

    expect(screen.getByTestId('claims-tab-featured')).toBeInTheDocument();
    expect(picker('Featured')).toBeInTheDocument();
  });

  it('offers every source the hub has', () => {
    render(<DebatesHubWorkspace />);

    fireEvent.click(picker('Featured'));
    const labels = screen.getAllByRole('button').map(option => option.textContent ?? '');
    const offered = ['Featured', 'All claims', 'My positions', 'Debate now', 'Matches'].map(label =>
      labels.findIndex(text => text.includes(label))
    );

    expect(offered.every(index => index > -1)).toBe(true);
    expect(offered).toEqual([...offered].sort((a, b) => a - b));
  });

  it('lists Matches directly under Debate now', () => {
    render(<DebatesHubWorkspace />);

    fireEvent.click(picker('Featured'));
    const labels = screen.getAllByRole('button').map(option => option.textContent ?? '');
    const debateNow = labels.findIndex(label => label.includes('Debate now'));
    const matches = labels.findIndex(label => label.includes('Matches'));

    expect(debateNow).toBeGreaterThan(-1);
    expect(matches).toBe(debateNow + 1);
  });

  it('swaps the list rather than narrowing it', () => {
    render(<DebatesHubWorkspace />);

    fireEvent.click(picker('Featured'));
    fireEvent.click(screen.getByRole('button', { name: 'My positions' }));

    expect(screen.getByTestId('claims-tab-positions')).toBeInTheDocument();
    expect(screen.queryByTestId('claims-tab-explore')).toBeNull();
  });

  // In the panel these two are one tab and a switch. Picking between them by name is what makes the
  // switch unnecessary here
  it('gives Debate now and Matches different lists', () => {
    render(<DebatesHubWorkspace />);

    fireEvent.click(picker('Featured'));
    fireEvent.click(screen.getByRole('button', { name: 'Debate now' }));
    expect(screen.getByTestId('claims-tab-lobby')).toBeInTheDocument();

    fireEvent.click(picker('Debate now'));
    fireEvent.click(screen.getByRole('button', { name: 'Matches' }));
    expect(screen.getByTestId('matches-list')).toBeInTheDocument();
    expect(screen.queryByTestId('claims-tab-lobby')).toBeNull();
  });

  /**
   * Three of the five are viewer-relative: My positions is the viewer's own, Matches needs an
   * account to have been paired, and Debate now is scored on who can debate *you*. Signed out they
   * are not stricter versions of the corpus, they are questions with no subject — and the panel
   * draws the same line with `SIGNED_OUT_TABS`.
   */
  it('offers a signed-out viewer only the sources that describe the corpus', () => {
    mocks.authenticated = false;
    render(<DebatesHubWorkspace />);

    fireEvent.click(picker('Featured'));
    const labels = screen.getAllByRole('button').map(option => option.textContent ?? '');

    expect(labels.some(label => label.includes('All claims'))).toBe(true);
    for (const gated of ['My positions', 'Debate now', 'Matches']) {
      expect(labels.some(label => label.includes(gated))).toBe(false);
    }
  });

  it('hands the picker to whichever list is showing', () => {
    render(<DebatesHubWorkspace />);

    expect(within(screen.getByTestId('claims-tab-featured')).getAllByRole('button', { name: 'Featured' })).toHaveLength(
      1
    );

    fireEvent.click(picker('Featured'));
    fireEvent.click(screen.getByRole('button', { name: 'Matches' }));

    expect(within(screen.getByTestId('matches-list')).getAllByRole('button', { name: 'Matches' })).toHaveLength(1);
  });
});
