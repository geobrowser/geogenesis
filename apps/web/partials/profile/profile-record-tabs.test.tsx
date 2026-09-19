import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import * as React from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ProfileRecordTabs } from './profile-record-tabs';

const mocks = vi.hoisted(() => ({
  facts: { debates: 10, positions: 59, proposals: 0 } as Record<string, number>,
  isLoadingFacts: false,
  isFactsError: false,
  /** What the vote table says, which is what decides Positions. */
  heldPositions: 59 as number | null,
}));

vi.mock('~/core/hooks/use-profile-facts', () => ({
  useProfileFacts: () => ({ facts: mocks.facts, isLoading: mocks.isLoadingFacts, isError: mocks.isFactsError }),
}));
vi.mock('~/core/profile/use-person-positions', () => ({
  usePersonResponses: () => ({ total: mocks.heldPositions, isError: false }),
  heldPositionsCount: () => mocks.heldPositions,
}));
vi.mock('~/core/hooks/use-profiles-by-space-ids', () => ({
  useProfilesBySpaceIds: () => ({ profilesBySpaceId: new Map() }),
}));
vi.mock('~/core/hooks/use-space', () => ({ useSpace: () => ({ space: null, isLoading: false }) }));

// The panels themselves. Each reaches for the graph, the editor or geo-chat, and
// none of it is what this file asserts — which tab is offered, and which one is
// showing.
vi.mock('./personal-space-profile', () => ({
  PersonalSpaceProfile: () => <div data-testid="panel">overview</div>,
}));
vi.mock('./person-debates-tab', () => ({ PersonDebatesTab: () => <div data-testid="panel">debates</div> }));
vi.mock('./person-positions-tab', () => ({ PersonPositionsTab: () => <div data-testid="panel">positions</div> }));
vi.mock('./person-proposals-tab', () => ({ PersonProposalsTab: () => <div data-testid="panel">proposals</div> }));
vi.mock('./profile-rail', () => ({ ProfileRailSections: () => <div data-testid="panel">about</div> }));
vi.mock('~/partials/editor/editor', () => ({ Editor: () => null }));
vi.mock('~/partials/entity-page/backlinks-client-container', () => ({ BacklinksClientContainer: () => null }));

const renderTabs = () => render(<ProfileRecordTabs entityId="person-1" spaceId="space-1" />);

const tabNames = () =>
  screen
    .getAllByRole('tab')
    .map(button => button.textContent)
    .filter(Boolean);

beforeEach(() => {
  mocks.facts = { debates: 10, positions: 59, proposals: 0 };
  mocks.isLoadingFacts = false;
  mocks.isFactsError = false;
  mocks.heldPositions = 59;
});

afterEach(cleanup);

/**
 * The profile's tabs, in a surface that cannot navigate to them (GEO-2969).
 *
 * The space route spends four routes on these. A side panel that navigated would
 * close itself to show you what you clicked, so the same lists live behind local
 * state — and the rail, which neither of these surfaces has, becomes About.
 */
describe('ProfileRecordTabs', () => {
  it('opens on Overview', () => {
    renderTabs();

    expect(screen.getByTestId('panel')).toHaveTextContent('overview');
  });

  /**
   * A person's authored tabs belong to the page Overview shows.
   *
   * The space route carries them in its own header; neither of the surfaces this
   * renders on has one, so dropping them here left a person's authored pages
   * unreachable from the panel entirely — reachable on their space and nowhere
   * else.
   */
  it('renders the authored tabs inside Overview', () => {
    render(
      <ProfileRecordTabs
        entityId="person-1"
        spaceId="space-1"
        authoredTabs={<div data-testid="authored">authored</div>}
      />
    );

    expect(screen.getByTestId('authored')).toBeInTheDocument();
  });

  it('does not repeat them on the record tabs', () => {
    render(
      <ProfileRecordTabs
        entityId="person-1"
        spaceId="space-1"
        authoredTabs={<div data-testid="authored">authored</div>}
      />
    );

    fireEvent.click(screen.getByRole('tab', { name: 'Debates' }));

    expect(screen.queryByTestId('authored')).not.toBeInTheDocument();
  });

  it('switches the panel in place rather than navigating', async () => {
    renderTabs();

    await userEvent.click(screen.getByRole('tab', { name: 'Debates' }));

    expect(screen.getByTestId('panel')).toHaveTextContent('debates');
  });

  /**
   * The same rule the route's tab bar follows: most people have never opened a
   * proposal, and a tab leading to "No proposals yet" is a promise the profile
   * cannot keep.
   */
  it('drops a tab whose record is empty', () => {
    renderTabs();

    expect(tabNames()).toEqual(['Overview', 'Debates', 'Positions', 'About']);
  });

  it('keeps About whatever the counts say, because it is the rail', () => {
    mocks.facts = { debates: 0, positions: 0, proposals: 0 };
    mocks.heldPositions = 0;
    renderTabs();

    expect(tabNames()).toEqual(['Overview', 'About']);
  });

  /**
   * A count that could not be read is not a count of zero. Hiding a tab holding
   * hundreds of rows is the one outcome worse than showing an empty one.
   */
  it('offers everything while the counts are still out', () => {
    mocks.isLoadingFacts = true;
    renderTabs();

    expect(tabNames()).toEqual(['Overview', 'Debates', 'Positions', 'Proposals', 'About']);
  });

  it('offers everything when the counts failed', () => {
    mocks.isFactsError = true;
    renderTabs();

    expect(tabNames()).toEqual(['Overview', 'Debates', 'Positions', 'Proposals', 'About']);
  });

  /**
   * Positions is decided by the vote table, not by `facts.positions`.
   *
   * `entitiesConnection(votedBy:)` counts a retracted vote as a position, so the
   * server count can say 4 over a record that holds none — and the tab would open
   * on an empty list.
   */
  it('hides Positions when every position was retracted', () => {
    mocks.facts = { debates: 10, positions: 4, proposals: 0 };
    mocks.heldPositions = 0;
    renderTabs();

    expect(tabNames()).not.toContain('Positions');
  });

  /**
   * The counts arrive after the first paint, so a tab can stop being offered
   * while the reader is standing on it — which would leave them on a list
   * nothing points at.
   */
  /**
   * Positions is the one count that knows on its own.
   *
   * It comes from the vote table, a different request from the facts — so a
   * facts failure says nothing about it, and a zero there is a definite zero.
   * Reading both through one "are the counts known" flag left an empty Positions
   * tab standing whenever the facts request happened to fail.
   */
  it('still hides Positions on a definite zero when the facts failed', () => {
    mocks.isFactsError = true;
    mocks.heldPositions = 0;
    renderTabs();

    expect(tabNames()).not.toContain('Positions');
  });

  it('offers Positions when neither source could answer', () => {
    mocks.isFactsError = true;
    mocks.heldPositions = null;
    renderTabs();

    expect(tabNames()).toContain('Positions');
  });

  /**
   * The row is a tab widget, not a list of links.
   *
   * `TabGroup` is links, where tabbing through each and pressing Enter is
   * correct. This swaps its own panel, so a screen reader should hear "tab, 2 of
   * 5, selected", the arrow keys should move between tabs, and Tab itself should
   * leave the row — which is roving `tabIndex`.
   */
  describe('tab semantics', () => {
    it('is a labelled tablist whose open tab is the selected one', () => {
      renderTabs();

      expect(screen.getByRole('tablist', { name: 'Profile sections' })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true');
      expect(screen.getByRole('tab', { name: 'Debates' })).toHaveAttribute('aria-selected', 'false');
    });

    it('points the panel at the tab that opened it', () => {
      renderTabs();

      const panel = screen.getByRole('tabpanel');
      expect(panel).toHaveAttribute('aria-labelledby', screen.getByRole('tab', { name: 'Overview' }).id);
      expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-controls', panel.id);
    });

    it('keeps one tab stop for the whole row', () => {
      renderTabs();

      expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('tabindex', '0');
      expect(screen.getByRole('tab', { name: 'Debates' })).toHaveAttribute('tabindex', '-1');
    });

    it('moves between tabs with the arrow keys', async () => {
      renderTabs();

      screen.getByRole('tab', { name: 'Overview' }).focus();
      await userEvent.keyboard('{ArrowRight}');

      expect(screen.getByTestId('panel')).toHaveTextContent('debates');
      // Focus follows the selection, or the next arrow press is read against the
      // tab the reader left behind.
      expect(screen.getByRole('tab', { name: 'Debates' })).toHaveFocus();
    });

    it('wraps at the ends, because the row is a loop', async () => {
      renderTabs();

      screen.getByRole('tab', { name: 'Overview' }).focus();
      await userEvent.keyboard('{ArrowLeft}');

      expect(screen.getByRole('tab', { name: 'About' })).toHaveFocus();
    });

    it('jumps to the ends with Home and End', async () => {
      renderTabs();

      screen.getByRole('tab', { name: 'Overview' }).focus();
      await userEvent.keyboard('{End}');
      expect(screen.getByRole('tab', { name: 'About' })).toHaveFocus();

      await userEvent.keyboard('{Home}');
      expect(screen.getByRole('tab', { name: 'Overview' })).toHaveFocus();
    });
  });

  it('falls back to Overview when the open tab stops being offered', async () => {
    const { rerender } = renderTabs();

    await userEvent.click(screen.getByRole('tab', { name: 'Debates' }));
    expect(screen.getByTestId('panel')).toHaveTextContent('debates');

    mocks.facts = { debates: 0, positions: 59, proposals: 0 };
    rerender(<ProfileRecordTabs entityId="person-1" spaceId="space-1" />);

    expect(screen.getByTestId('panel')).toHaveTextContent('overview');
  });
});
