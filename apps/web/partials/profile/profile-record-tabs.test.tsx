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
    .getAllByRole('button')
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

    fireEvent.click(screen.getByRole('button', { name: 'Debates' }));

    expect(screen.queryByTestId('authored')).not.toBeInTheDocument();
  });

  it('switches the panel in place rather than navigating', async () => {
    renderTabs();

    await userEvent.click(screen.getByRole('button', { name: 'Debates' }));

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
  it('falls back to Overview when the open tab stops being offered', async () => {
    const { rerender } = renderTabs();

    await userEvent.click(screen.getByRole('button', { name: 'Debates' }));
    expect(screen.getByTestId('panel')).toHaveTextContent('debates');

    mocks.facts = { debates: 0, positions: 59, proposals: 0 };
    rerender(<ProfileRecordTabs entityId="person-1" spaceId="space-1" />);

    expect(screen.getByTestId('panel')).toHaveTextContent('overview');
  });
});
