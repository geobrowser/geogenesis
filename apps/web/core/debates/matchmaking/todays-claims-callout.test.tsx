import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

import * as React from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CalloutClaim } from '../todays-claims/todays-callout';
import type { TodaysCallout } from '../todays-claims/use-todays-callout';

const mocks = vi.hoisted(() => ({
  indexing: { status: 'idle', pending: null } as {
    status: string;
    pending: { expectedResponse: string | null } | null;
  },
  indexedDirection: null as string | null,
  surfaces: [] as Array<Record<string, unknown>>,
}));

vi.mock('~/core/hooks/use-entity-vote', () => ({
  useEntityResponseIndexingSnapshot: () => mocks.indexing,
}));
vi.mock('~/core/claims/browse/claim-response-summary', () => ({
  useClaimResponseSummary: () => ({ indexedViewerDirection: mocks.indexedDirection }),
}));
// The card has its own suites; here it only matters which claim it is drawn for and how.
vi.mock('./matchmaking-claim-card', () => ({
  MatchmakingClaimCard: (props: { claim: { claim: string }; hideEndSlot?: boolean; hideSummary?: boolean }) => (
    <article data-testid="claim-card" data-hide-end-slot={props.hideEndSlot} data-hide-summary={props.hideSummary}>
      {props.claim.claim}
    </article>
  ),
}));
vi.mock('../debate-claim-card-surface', () => ({
  DebateClaimCardSurface: (props: Record<string, unknown> & { children: React.ReactNode }) => {
    mocks.surfaces.push(props);
    return <>{props.children}</>;
  },
}));

const { TodaysClaimsCallout, CALLOUT_ADVANCE_DELAY_MS } = await import('./todays-claims-callout');

const claim = (claimId: string): CalloutClaim => ({
  claimId,
  spaceId: 'space1',
  agendaId: 'agenda1',
  sectionId: 'block1',
  listedAt: '2026-10-29T00:00:00-04:00',
});

const CLAIMS = [claim('a'), claim('b'), claim('c')];
const NAMES: Record<string, string> = { a: 'Claim A', b: 'Claim B', c: 'Claim C' };

function callout(overrides: Partial<TodaysCallout> = {}): TodaysCallout {
  return {
    visible: true,
    claims: CLAIMS,
    step: { current: CLAIMS[0]!, currentIndex: 0, done: [false, false, false], allAnswered: false },
    entityOf: (claimId: string) => (NAMES[claimId] ? { id: claimId, name: NAMES[claimId] } : undefined),
    entitiesLoading: false,
    rowOf: () => undefined,
    answersReadyIn: () => true,
    markAnswered: vi.fn(),
    skip: vi.fn(),
    dismiss: vi.fn(),
    ...overrides,
  } as unknown as TodaysCallout;
}

beforeEach(() => {
  mocks.indexing = { status: 'idle', pending: null };
  mocks.indexedDirection = null;
  mocks.surfaces = [];
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('TodaysClaimsCallout', () => {
  it('asks about the current claim on the claim card, with progress, Skip and dismiss', () => {
    const value = callout({
      step: { current: CLAIMS[1]!, currentIndex: 1, done: [true, false, false], allAnswered: false },
    });
    render(<TodaysClaimsCallout callout={value} layout="panel" onFindDebate={vi.fn()} />);

    const region = screen.getByRole('region', { name: 'Today’s claims' });
    expect(region).toHaveTextContent('Today’s claims');
    expect(screen.getByTestId('claim-card')).toHaveTextContent('Claim B');
    expect(screen.getByTestId('claim-card')).toHaveAttribute('data-hide-summary', 'true');
    expect(screen.getByTestId('claim-card')).toHaveAttribute('data-hide-end-slot', 'true');
    expect(screen.getByRole('list', { name: '1 of 3 answered' })).toBeInTheDocument();
    expect(mocks.surfaces[0]).toMatchObject({
      claimId: 'b',
      listId: 'todays_claims_callout',
      position: 2,
      scope: { agenda_id: 'agenda1', agenda_date: '2026-10-29', list_section_id: 'block1' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
    expect(value.skip).toHaveBeenCalledWith('b');
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss Today’s claims' }));
    expect(value.dismiss).toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Find a debate' })).not.toBeInTheDocument();
  });

  it('moves on a moment after a side is taken, so the pressed pill is seen', () => {
    vi.useFakeTimers();
    const value = callout();
    const { rerender } = render(<TodaysClaimsCallout callout={value} layout="panel" onFindDebate={vi.fn()} />);

    mocks.indexing = { status: 'reconciling', pending: { expectedResponse: 'positive' } };
    rerender(<TodaysClaimsCallout callout={value} layout="panel" onFindDebate={vi.fn()} />);
    expect(value.markAnswered).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(CALLOUT_ADVANCE_DELAY_MS));
    expect(value.markAnswered).toHaveBeenCalledWith('a');
  });

  it('does not count taking a side back as an answer', () => {
    vi.useFakeTimers();
    mocks.indexing = { status: 'reconciling', pending: { expectedResponse: null } };
    const value = callout();
    render(<TodaysClaimsCallout callout={value} layout="panel" onFindDebate={vi.fn()} />);

    act(() => vi.advanceTimersByTime(CALLOUT_ADVANCE_DELAY_MS * 2));
    expect(value.markAnswered).not.toHaveBeenCalled();
  });

  it('moves straight past a claim the viewer already holds a side on', () => {
    mocks.indexedDirection = 'negative';
    const value = callout();
    render(<TodaysClaimsCallout callout={value} layout="panel" onFindDebate={vi.fn()} />);

    expect(value.markAnswered).toHaveBeenCalledWith('a');
  });

  it('skips a claim the graph no longer has', () => {
    const value = callout({ entityOf: () => undefined } as Partial<TodaysCallout>);
    render(<TodaysClaimsCallout callout={value} layout="panel" onFindDebate={vi.fn()} />);

    expect(screen.queryByTestId('claim-card')).not.toBeInTheDocument();
    expect(value.skip).toHaveBeenCalledWith('a');
  });

  it('says so once every claim is answered and offers Matches', () => {
    const onFindDebate = vi.fn();
    const value = callout({ step: { current: null, currentIndex: -1, done: [true, true, true], allAnswered: true } });
    render(<TodaysClaimsCallout callout={value} layout="hub" onFindDebate={onFindDebate} />);

    expect(screen.getByRole('heading', { level: 2, name: 'You’re set for today' })).toBeInTheDocument();
    expect(screen.getByRole('list', { name: '3 of 3 answered' })).toBeInTheDocument();
    expect(screen.queryByTestId('claim-card')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Skip' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Find a debate' }));
    expect(onFindDebate).toHaveBeenCalled();
  });
});
