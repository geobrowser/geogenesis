import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

import * as React from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CalloutClaim } from '../todays-claims/todays-callout';
import type { TodaysCallout } from '../todays-claims/use-todays-callout';

const mocks = vi.hoisted(() => ({
  indexing: { status: 'idle', pending: null } as {
    status: string;
    submitted?: boolean;
    pending: { expectedResponse: string | null } | null;
  },
  indexedDirection: null as string | null,
  viewerResponseLoading: false,
  surfaces: [] as Array<Record<string, unknown>>,
}));

vi.mock('~/core/hooks/use-entity-vote', () => ({
  useEntityResponseIndexingSnapshot: () => mocks.indexing,
}));
vi.mock('~/core/claims/browse/claim-response-summary', () => ({
  useClaimResponseSummary: () => ({
    indexedViewerDirection: mocks.indexedDirection,
    isViewerResponseLoading: mocks.viewerResponseLoading,
  }),
}));
// The card has its own suites; here it only matters which claim it is drawn for and how.
vi.mock('./matchmaking-claim-card', () => ({
  MatchmakingClaimCard: (props: {
    claim: { claim: string };
    hideEndSlot?: boolean;
    hideSummary?: boolean;
    showParticipants?: boolean;
  }) => (
    <article
      data-testid="claim-card"
      data-hide-end-slot={props.hideEndSlot}
      data-hide-summary={props.hideSummary}
      data-show-participants={String(props.showParticipants)}
    >
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
  topic: 'Elections',
  listedOn: '2026-10-29',
});

const CLAIMS = [claim('a'), claim('b'), claim('c')];
const NAMES: Record<string, string> = { a: 'Claim A', b: 'Claim B', c: 'Claim C' };

function callout(overrides: Partial<TodaysCallout> = {}): TodaysCallout {
  return {
    visible: true,
    claims: CLAIMS,
    step: { current: CLAIMS[0]!, currentIndex: 0, done: [false, false, false], allAnswered: false },
    entityOf: (claimId: string) => (NAMES[claimId] ? { id: claimId, name: NAMES[claimId] } : undefined),
    entitiesSettled: true,
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
  mocks.viewerResponseLoading = false;
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
    render(<TodaysClaimsCallout callout={value} onFindDebate={vi.fn()} />);

    const region = screen.getByRole('region', { name: 'Today’s claims' });
    expect(region).toHaveTextContent('Today’s claims');
    expect(screen.getByTestId('claim-card')).toHaveTextContent('Claim B');
    expect(screen.getByTestId('claim-card')).toHaveAttribute('data-hide-summary', 'true');
    expect(screen.getByTestId('claim-card')).toHaveAttribute('data-hide-end-slot', 'true');
    expect(screen.getByTestId('claim-card')).toHaveAttribute('data-show-participants', 'false');
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

  it('moves on a moment after the bundler has the side, so the pressed pill is seen', () => {
    vi.useFakeTimers();
    const value = callout();
    const { rerender } = render(<TodaysClaimsCallout callout={value} onFindDebate={vi.fn()} />);

    mocks.indexing = { status: 'reconciling', submitted: true, pending: { expectedResponse: 'positive' } };
    rerender(<TodaysClaimsCallout callout={value} onFindDebate={vi.fn()} />);
    expect(value.markAnswered).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(CALLOUT_ADVANCE_DELAY_MS));
    expect(value.markAnswered).toHaveBeenCalledWith('a');
  });

  // Review: a write still on its way to the bundler can fail, and the card has to be there to say so.
  it('stays on the claim while the side is still being submitted, and after the write fails', () => {
    vi.useFakeTimers();
    const value = callout();
    const { rerender } = render(<TodaysClaimsCallout callout={value} onFindDebate={vi.fn()} />);

    mocks.indexing = { status: 'reconciling', pending: { expectedResponse: 'positive' } };
    rerender(<TodaysClaimsCallout callout={value} onFindDebate={vi.fn()} />);
    act(() => vi.advanceTimersByTime(CALLOUT_ADVANCE_DELAY_MS * 3));
    expect(value.markAnswered).not.toHaveBeenCalled();

    mocks.indexing = { status: 'idle', pending: null };
    rerender(<TodaysClaimsCallout callout={value} onFindDebate={vi.fn()} />);
    act(() => vi.advanceTimersByTime(CALLOUT_ADVANCE_DELAY_MS * 3));
    expect(value.markAnswered).not.toHaveBeenCalled();
    expect(screen.getByTestId('claim-card')).toHaveTextContent('Claim A');
  });

  it('does not count taking a side back as an answer', () => {
    vi.useFakeTimers();
    mocks.indexing = { status: 'reconciling', submitted: true, pending: { expectedResponse: null } };
    const value = callout();
    render(<TodaysClaimsCallout callout={value} onFindDebate={vi.fn()} />);

    act(() => vi.advanceTimersByTime(CALLOUT_ADVANCE_DELAY_MS * 2));
    expect(value.markAnswered).not.toHaveBeenCalled();
  });

  it('moves straight past a claim the viewer already holds a side on', () => {
    mocks.indexedDirection = 'negative';
    const value = callout();
    render(<TodaysClaimsCallout callout={value} onFindDebate={vi.fn()} />);

    expect(value.markAnswered).toHaveBeenCalledWith('a');
  });

  it('does not read a side off an indexed read that is still loading', () => {
    mocks.indexedDirection = 'negative';
    mocks.viewerResponseLoading = true;
    const value = callout();
    render(<TodaysClaimsCallout callout={value} onFindDebate={vi.fn()} />);

    expect(value.markAnswered).not.toHaveBeenCalled();
  });

  it('skips a claim the graph no longer has', () => {
    const value = callout({ entityOf: () => undefined } as Partial<TodaysCallout>);
    render(<TodaysClaimsCallout callout={value} onFindDebate={vi.fn()} />);

    expect(screen.queryByTestId('claim-card')).not.toBeInTheDocument();
    expect(value.skip).toHaveBeenCalledWith('a');
  });

  // Review: one failed lookup used to skip all ten and report the viewer set for the day.
  it('does not skip a claim while its lookup has not answered', () => {
    const value = callout({ entityOf: () => undefined, entitiesSettled: false } as Partial<TodaysCallout>);
    render(<TodaysClaimsCallout callout={value} onFindDebate={vi.fn()} />);

    expect(value.skip).not.toHaveBeenCalled();
  });

  it('offers Matches without saying the viewer is set when claims were skipped', () => {
    const value = callout({
      step: { current: null, currentIndex: -1, done: [true, false, false], allAnswered: false },
    });
    render(<TodaysClaimsCallout callout={value} onFindDebate={vi.fn()} />);

    expect(screen.getByRole('heading', { level: 3, name: 'Today’s claims' })).toBeInTheDocument();
    expect(screen.queryByText('You’re set for today')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Find a debate' })).toBeInTheDocument();
  });

  it('says so once every claim is answered and offers Matches', () => {
    const onFindDebate = vi.fn();
    const value = callout({ step: { current: null, currentIndex: -1, done: [true, true, true], allAnswered: true } });
    render(<TodaysClaimsCallout callout={value} onFindDebate={onFindDebate} />);

    expect(screen.getByRole('heading', { level: 3, name: 'You’re set for today' })).toBeInTheDocument();
    expect(screen.getByRole('list', { name: '3 of 3 answered' })).toBeInTheDocument();
    expect(screen.queryByTestId('claim-card')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Skip' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Find a debate' }));
    expect(onFindDebate).toHaveBeenCalled();
  });
});
