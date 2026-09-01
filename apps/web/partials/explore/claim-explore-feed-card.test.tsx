import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen } from '@testing-library/react';

import type React from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CLAIM_IS_FACTUAL_PROPERTY_ID } from '~/core/claims/ontology';
import type { DebateClaim } from '~/core/debates/api';
import type { ExploreFeedItem } from '~/core/explore/fetch-explore-feed';
import type { Entity } from '~/core/types';

import { ClaimExploreFeedCard } from './claim-explore-feed-card';

const mocks = vi.hoisted(() => ({
  entity: null as Entity | null,
  /** Every `enabled` the entity hydration was called with, in render order. */
  entityEnabledCalls: [] as boolean[],
  /** Every `enabled` the geo-chat row lookup was called with, in render order. */
  rowEnabledCalls: [] as boolean[],
  row: null as DebateClaim | null,
  /** Every `enabled` the response summary was asked for. */
  summaryEnabledCalls: [] as boolean[],
  /** Every response kind it was asked under, so a fallback read cannot pass unnoticed. */
  summaryKindCalls: [] as string[],
  positive: 0,
  negative: 0,
}));

vi.mock('~/core/sync/use-store', () => ({
  // Answers null while disabled, as the real hook does — so a test that never scrolls the card
  // into range cannot accidentally be handed an entity the card never asked for.
  useQueryEntity: ({ enabled = true }: { enabled?: boolean }) => {
    mocks.entityEnabledCalls.push(enabled);
    return { entity: enabled ? mocks.entity : null, isLoading: false };
  },
}));

vi.mock('~/core/debates/hooks', () => ({
  useDebateClaims: (_spaceId: string, _ids: string[], enabled: boolean) => {
    mocks.rowEnabledCalls.push(enabled);
    return { data: mocks.row ? { claims: [mocks.row] } : { claims: [] }, isLoading: false, error: null };
  },
}));

vi.mock('~/core/claims/browse/claim-response-summary', async importOriginal => {
  const actual = await importOriginal<typeof import('~/core/claims/browse/claim-response-summary')>();
  return {
    ...actual,
    useClaimResponseSummary: (_entityId: string, _spaceId: string, _kind: string, enabled = true) => {
      mocks.summaryEnabledCalls.push(enabled);
      mocks.summaryKindCalls.push(_kind);
      return {
        ...actual.summarizeClaimResponses(mocks.positive, mocks.negative),
        isLoading: false,
        hasCounts: true,
        viewerDirection: null,
        viewerSpaceId: null,
      };
    },
  };
});

// The pills publish through the entity-response stack; this suite is about the card around them.
// `disabled` is surfaced because the card is what decides it.
vi.mock('~/core/debates/matchmaking/matchmaking-claim-card', () => ({
  PositionRow: ({
    disabled,
    responseKind,
    titleFor,
  }: {
    disabled?: boolean;
    responseKind: string;
    titleFor?: (position: boolean) => string;
  }) => (
    <div
      data-testid="pills"
      data-disabled={String(Boolean(disabled))}
      data-response-kind={responseKind}
      data-title={titleFor?.(true)}
    />
  ),
  // Honours `answersReady`, because the real hook does. The gate used to live in each caller's
  // `disabled`, so a mock that hardcoded `canRespond: true` could still be caught by these
  // assertions; now that it lives in the hook, a hardcoded mock would report every claim as
  // answerable no matter what the lookups say — and these suites would go quiet on the bug they
  // exist to catch.
  useClaimPositionControl: ({ answersReady = true }: { answersReady?: boolean }) => ({
    viewerPosition: null,
    optimisticPositions: [],
    respond: vi.fn(),
    actionTitle: () => (answersReady ? '' : 'Loading this claim’s responses…'),
    responseError: null,
    canRespond: answersReady,
  }),
}));

vi.mock('~/core/claims/browse/claim-end-slot', () => ({
  ClaimEndSlot: ({ enabled }: { enabled?: boolean }) => (
    <div data-testid="end-slot" data-enabled={String(enabled !== false)} />
  ),
}));

// Only the leaf that reaches the network. Mocking the whole `claim-summary` module — which is what
// this suite did first — stubbed out the split bar, the two sides and the tag, so the verdict the
// card is *for* was never rendered here; and it broke outright the moment two more components were
// shared into that module. The responder faces are covered by their own suite.
vi.mock('~/core/claims/browse/claim-side-responders', () => ({
  ClaimSideResponders: ({ label }: { label: string }) => <div data-testid={`responders-${label}`} />,
}));

vi.mock('~/core/hooks/use-privy-sign-in', () => ({ usePrivySignIn: () => vi.fn() }));

vi.mock('~/design-system/prefetch-link', () => ({
  PrefetchLink: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

vi.mock('~/design-system/fallback-image', () => ({ FallbackImage: () => <div data-testid="image" /> }));

vi.mock('./explore-join-space-button', () => ({ ExploreJoinSpaceButton: () => <button type="button">Join</button> }));

type ObserverRecord = {
  callback: IntersectionObserverCallback;
  elements: Set<Element>;
  instance: IntersectionObserver;
};
let observers: ObserverRecord[] = [];

const CLAIM_ID = '96f859efa1ca4b229372c86ad58b694b';

const item: ExploreFeedItem = {
  entityId: CLAIM_ID,
  spaceId: 'space-1',
  spaceName: 'Global Politics',
  spaceImage: null,
  types: [{ id: '96f859ef-a1ca-4b22-9372-c86ad58b694b', name: 'Claim' }],
  createdAtSec: 0,
  title: 'Ukrainian drones struck a St. Petersburg oil terminal.',
  description: null,
  imageUrl: null,
  commentCount: 0,
  recordingUrls: [],
  debateVideoUrls: [],
  isMemberOrEditor: true,
  hasPendingMembershipRequest: false,
};

function factualClaim(): Entity {
  return {
    id: CLAIM_ID,
    values: [{ spaceId: 'space-1', property: { id: CLAIM_IS_FACTUAL_PROPERTY_ID }, value: '1' }],
    relations: [],
  } as unknown as Entity;
}

beforeEach(() => {
  observers = [];
  mocks.entity = null;
  mocks.entityEnabledCalls = [];
  mocks.rowEnabledCalls = [];
  mocks.row = null;
  mocks.summaryEnabledCalls = [];
  mocks.summaryKindCalls = [];
  mocks.positive = 0;
  mocks.negative = 0;

  class MockIntersectionObserver implements IntersectionObserver {
    readonly root = null;
    readonly rootMargin = '0px';
    readonly scrollMargin = '0px';
    readonly thresholds = [0];
    private readonly record: ObserverRecord;

    constructor(callback: IntersectionObserverCallback) {
      this.record = { callback, elements: new Set(), instance: this };
      observers.push(this.record);
    }
    observe(element: Element) {
      this.record.elements.add(element);
    }
    unobserve(element: Element) {
      this.record.elements.delete(element);
    }
    disconnect() {
      this.record.elements.clear();
    }
    takeRecords(): IntersectionObserverEntry[] {
      return [];
    }
  }

  vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function scrollIntoRange() {
  act(() => {
    for (const record of observers) {
      for (const element of record.elements) {
        record.callback(
          [{ target: element, isIntersecting: true, intersectionRatio: 1 } as IntersectionObserverEntry],
          record.instance
        );
      }
    }
  });
}

describe('ClaimExploreFeedCard', () => {
  it('shows the claim and links it to its entity page', () => {
    render(<ClaimExploreFeedCard item={item} />);

    const title = screen.getByRole('link', { name: item.title });
    expect(title.getAttribute('href')).toContain(CLAIM_ID);
    // No thumbnail well: a claim has no image, so the sentence takes the column.
    expect(screen.queryByTestId('image')).toBeNull();
  });

  it('asks for nothing about a claim the reader has not scrolled near', () => {
    // The feed mounts cards thousands of pixels below the fold. Every read waits — the entity
    // hydration, the geo-chat row and the two response reads; without that a page of twenty-two
    // issues them all on mount.
    render(<ClaimExploreFeedCard item={item} />);

    expect(mocks.entityEnabledCalls.every(enabled => enabled === false)).toBe(true);
    expect(mocks.rowEnabledCalls.every(enabled => enabled === false)).toBe(true);
    expect(mocks.summaryEnabledCalls.every(enabled => enabled === false)).toBe(true);
    expect(screen.getByTestId('end-slot').getAttribute('data-enabled')).toBe('false');

    scrollIntoRange();

    expect(mocks.entityEnabledCalls.at(-1)).toBe(true);
    expect(mocks.rowEnabledCalls.at(-1)).toBe(true);
    expect(screen.getByTestId('end-slot').getAttribute('data-enabled')).toBe('true');

    // The response reads wait for one thing more. The kind is part of both of their query keys, so
    // asking under the `stance` fallback fetches a factual claim's *stance* counts and can draw
    // that split until the entity lands.
    expect(mocks.summaryEnabledCalls.at(-1)).toBe(false);
  });

  it('waits for the vocabulary before reading the split, not just for the viewport', () => {
    mocks.entity = factualClaim();
    const { rerender } = render(<ClaimExploreFeedCard item={item} />);
    scrollIntoRange();
    rerender(<ClaimExploreFeedCard item={item} />);

    expect(mocks.summaryEnabledCalls.at(-1)).toBe(true);
    // And under the kind the entity supplied, never the fallback it would have used a beat earlier.
    expect(mocks.summaryKindCalls.at(-1)).toBe('veracity');
  });

  it('will not let anyone answer before the claim’s vocabulary is known', () => {
    // `stance` is the fallback while the lookups are out, and the kind selects `voteKind` on the
    // write — so a click inside that window publishes the wrong vote on a factual claim.
    mocks.entity = factualClaim();
    render(<ClaimExploreFeedCard item={item} />);
    // Off-screen nothing has been asked, so nothing has answered — including on a claim whose
    // entity is sitting right there in the fixture.
    expect(screen.getByTestId('pills').getAttribute('data-disabled')).toBe('true');

    // And it says so, rather than naming a side it will not take. A pill that is unpressable while
    // its tooltip reads "Agree" is the misleading state; the disabling on its own is not.
    expect(screen.getByTestId('pills').getAttribute('data-title')).toBe('Loading this claim’s responses…');

    scrollIntoRange();

    const pills = screen.getByTestId('pills');
    expect(pills.getAttribute('data-disabled')).toBe('false');
    expect(pills.getAttribute('data-response-kind')).toBe('veracity');
  });

  it('draws no verdict, and no rule, on a claim nobody has answered', () => {
    render(<ClaimExploreFeedCard item={item} />);
    scrollIntoRange();

    expect(screen.queryByText(/agree$/i)).toBeNull();
    // An empty 220px cell behind a vertical rule reads as something failing to load.
    expect(document.querySelector('.border-l')).toBeNull();
  });

  it('places the pills a row up when there is no verdict above them', () => {
    // An implicit row of zero height still costs the `gap-y-4` either side of it, so leaving the
    // pills in row 4 would silently double the space under the claim.
    render(<ClaimExploreFeedCard item={item} />);
    scrollIntoRange();
    expect(screen.getByTestId('pills').parentElement).not.toHaveClass('@max-[520px]:row-start-4');

    cleanup();
    mocks.positive = 9;
    mocks.negative = 3;
    render(<ClaimExploreFeedCard item={item} />);
    scrollIntoRange();
    expect(screen.getByTestId('pills').parentElement).toHaveClass('@max-[520px]:row-start-4');
  });

  it('separates the two zones with a rule at card width and with the stack in a narrow card', () => {
    // Not an omission. The rule is full-height beside the claim, and on a phone the verdict sits
    // above the pills with nothing drawn between them — a full-bleed rule across a narrow card
    // reads as the card ending rather than as a divider inside it.
    mocks.positive = 9;
    mocks.negative = 3;
    render(<ClaimExploreFeedCard item={item} />);
    scrollIntoRange();

    const verdict = screen.getByText('9 agree').closest('div.border-l') as HTMLElement;
    expect(verdict).not.toBeNull();
    expect(verdict).toHaveClass('@max-[520px]:border-l-0');
    expect(verdict.className).not.toContain('@max-[520px]:border-t');
  });

  it('reports the split and both sides once anyone has answered', () => {
    mocks.positive = 9;
    mocks.negative = 3;
    render(<ClaimExploreFeedCard item={item} />);
    scrollIntoRange();

    expect(screen.getByText('75%')).toBeInTheDocument();
    // Count first and the verb lowercase, matching the share above it: "75% agree", "9 agree".
    expect(screen.getByText('9 agree')).toBeInTheDocument();
    expect(screen.getByText('3 disagree')).toBeInTheDocument();
  });

  it('flags a contested claim beside the space rather than in the verdict', () => {
    mocks.positive = 6;
    mocks.negative = 6;
    render(<ClaimExploreFeedCard item={item} />);
    scrollIntoRange();

    // Beside the space chip, which is what the meta row is for — not a second voice in the split.
    const metaRow = screen.getByText('Global Politics').closest('div') as HTMLElement;
    expect(metaRow.textContent).toContain('Controversial');
  });
});
