import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

import type React from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ClaimPageView } from './claim-page-view';

const mocks = vi.hoisted(() => ({
  entity: null as Record<string, unknown> | null,
  /** Props the description's clamp received, or null if it rendered no clamp at all. */
  clamp: null as Record<string, unknown> | null,
  /**
   * Deliberately not 3.
   *
   * Asserting against the real constant proves nothing: its value is 3, so a page that wrote
   * `maxLines={3}` — the duplication the shared constant exists to prevent — would satisfy it just
   * as well. Stubbing the module to a value the page could not have arrived at on its own is what
   * makes the assertion about where the number came from rather than what it happens to be.
   */
  maxLines: 5,
}));

vi.mock('~/partials/entity-page/entity-page-inline-description', () => ({
  ENTITY_DESCRIPTION_MAX_LINES: mocks.maxLines,
}));

// jsdom has no layout, so the real clamp can never measure an overflow. What this file is about is
// that the description is handed to it at all, and with the shared line budget — the measuring
// itself belongs to `ClampedText`.
vi.mock('~/design-system/clamped-text', () => ({
  ClampedText: (props: Record<string, unknown>) => {
    mocks.clamp = props;
    return <p data-testid="clamped-description">{props.text as string}</p>;
  },
}));

vi.mock('~/core/sync/use-store', () => ({
  useQueryEntity: () => ({ entity: mocks.entity, isLoading: false }),
}));

vi.mock('~/core/debates/hooks', () => ({
  useDebateClaims: () => ({ data: { claims: [] } }),
}));

vi.mock('./use-claim-response-state', () => ({
  useClaimResponseState: () => ({
    responseKind: 'stance',
    summary: { isControversial: false },
    claim: null,
    positions: [],
    readiness: { response_kind: 'stance' },
    isResponseKindResolved: true,
    isViewerResponseResolved: true,
    responseBlockedReason: null,
  }),
}));

// The page's modules each reach for the sync engine, geo-chat or Privy. None of them is what this
// file is asserting, and the hero renders above all of them.
vi.mock('~/core/debates/matchmaking/matchmaking-claim-card', () => ({
  PositionRow: () => null,
  useClaimPositionControl: () => ({
    optimisticPositions: [],
    viewerPosition: null,
    respond: () => {},
    canRespond: false,
    actionTitle: () => undefined,
    responseError: null,
  }),
}));
vi.mock('~/core/hooks/use-privy-sign-in', () => ({ usePrivySignIn: () => () => {} }));
vi.mock('~/core/debates/retire-confirmed-response-indexing', () => ({
  useRetireConfirmedResponseIndexing: () => {},
}));
vi.mock('~/core/debates/backfill-readiness-for-held-position', () => ({
  useBackfillReadinessForHeldPosition: () => {},
}));
vi.mock('./claim-verdict', () => ({ ClaimVerdict: () => null }));
vi.mock('./claim-debates', () => ({ ClaimDebates: () => <div data-testid="claim-debates" /> }));
vi.mock('./claim-provenance', () => ({ ClaimProvenance: () => <div data-testid="claim-provenance" /> }));
vi.mock('./claim-related-claims', () => ({ ClaimRelatedClaims: () => null }));
vi.mock('./claim-end-slot', () => ({ ClaimEndSlot: () => null }));
vi.mock('./claim-summary', () => ({ ControversialTag: () => null }));
vi.mock('~/partials/comments/comments-section', () => ({ CommentSection: () => <div data-testid="claim-comments" /> }));

function claimEntity(description: string | null) {
  return {
    id: 'claim-1',
    name: 'Pineapple belongs on pizza',
    description,
    relations: [],
    types: [],
  };
}

beforeEach(() => {
  mocks.entity = claimEntity('A description long enough that the page has something to collapse.');
  mocks.clamp = null;
});

afterEach(cleanup);

describe('ClaimPageView description', () => {
  // GEO-2772. It used to be a plain paragraph, so a long description pushed the whole page down —
  // worst in the side panel, which renders this same view at a much narrower width.
  it('clamps the description instead of printing it in full', () => {
    render(<ClaimPageView entityId="claim-1" spaceId="space-1" />);

    expect(screen.getByTestId('clamped-description')).toHaveTextContent(
      'A description long enough that the page has something to collapse.'
    );
  });

  // The number lives with the entity-page component and is imported here. Restating `3` on this
  // surface is what would let the two cut at different points after a change to either — so the
  // module is stubbed to a different number, and the page has to follow it.
  it('takes its line budget from the shared constant rather than restating it', () => {
    render(<ClaimPageView entityId="claim-1" spaceId="space-1" />);

    expect(mocks.clamp?.maxLines).toBe(mocks.maxLines);
  });

  it('renders no description block when the claim has none', () => {
    mocks.entity = claimEntity(null);
    render(<ClaimPageView entityId="claim-1" spaceId="space-1" />);

    expect(screen.queryByTestId('clamped-description')).toBeNull();
  });
});

/**
 * The bar sits under My position, not above the page: what is above it says which claim this is and
 * lets you take a side, and that holds whichever tab is open (GEO-2779).
 */
describe('ClaimPageView tabs', () => {
  const slot = (body: React.ReactNode | null) => ({ bar: <div data-testid="tab-bar" />, body });

  const isBefore = (a: HTMLElement, b: HTMLElement) =>
    Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

  it('renders exactly as before when the entity has no other tabs', () => {
    render(<ClaimPageView entityId="claim-1" spaceId="space-1" tabs={{ bar: null, body: null }} />);

    expect(screen.queryByTestId('tab-bar')).not.toBeInTheDocument();
    expect(screen.getByTestId('claim-debates')).toBeInTheDocument();
    expect(screen.getByTestId('claim-comments')).toBeInTheDocument();
  });

  it('places the bar below My position and above the Overview content', () => {
    render(<ClaimPageView entityId="claim-1" spaceId="space-1" tabs={slot(null)} />);

    const bar = screen.getByTestId('tab-bar');
    // The hero and taking a side both describe the claim, so they sit above the seam.
    expect(isBefore(screen.getByTestId('clamped-description'), bar)).toBe(true);
    expect(isBefore(screen.getByRole('region', { name: 'Your position' }), bar)).toBe(true);
    expect(isBefore(bar, screen.getByTestId('claim-debates'))).toBe(true);
  });

  it("swaps the Overview content for the selected tab's blocks, keeping what is above the bar", () => {
    render(<ClaimPageView entityId="claim-1" spaceId="space-1" tabs={slot(<div data-testid="tab-blocks" />)} />);

    expect(screen.getByTestId('tab-blocks')).toBeInTheDocument();
    expect(screen.getByTestId('clamped-description')).toBeInTheDocument();
    for (const belowTheSeam of ['claim-debates', 'claim-provenance', 'claim-comments']) {
      expect(screen.queryByTestId(belowTheSeam)).not.toBeInTheDocument();
    }
  });
});
