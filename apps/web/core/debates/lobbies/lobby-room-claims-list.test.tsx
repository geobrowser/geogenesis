import { cleanup, render, screen } from '@testing-library/react';

import * as React from 'react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { DebateParticipantSummary } from '../api';
import { HUB_SCROLL_SELECTOR, HubScrollSelectorProvider } from '../matchmaking/hub-scroll';
import {
  type LobbyRoomClaim,
  LobbyRoomClaimCard,
  LobbyRoomClaimsList,
  type LobbyRoomOffer,
  type LobbyRoomSide,
} from './lobby-room-claims-list';

const mocks = vi.hoisted(() => ({
  backfill: vi.fn(),
  openClaim: vi.fn(),
  rootSelectors: [] as (string | undefined)[],
  watchLive: true,
  indexed: null as 'positive' | 'negative' | null,
  snapshot: { status: 'idle', pending: null, runId: null } as {
    status: string;
    pending: { expectedResponse: 'positive' | 'negative' | null } | null;
    runId: string | null;
  },
}));

// Passes through to the real hook, recording the scroll root each card asks to be measured against.
vi.mock('~/core/hooks/use-near-viewport', async importOriginal => {
  const actual = await importOriginal<typeof import('~/core/hooks/use-near-viewport')>();
  return {
    useNearViewport: (options?: Parameters<typeof actual.useNearViewport>[0]) => {
      mocks.rootSelectors.push(options?.rootSelector);
      return actual.useNearViewport(options);
    },
  };
});

// Live watching is off in the product (GEO-3334). On here so the pill's own behaviour stays covered
// for when it ships; the off state has its own test.
vi.mock('../watch-live', () => ({
  get WATCH_LIVE_ENABLED() {
    return mocks.watchLive;
  },
}));

vi.mock('~/core/hooks/use-entity-vote', () => ({
  useEntityResponseIndexingSnapshot: () => mocks.snapshot,
}));

vi.mock('~/core/claims/browse/claim-response-summary', () => ({
  useClaimResponseSummary: () => ({ indexedViewerDirection: mocks.indexed, isViewerResponseLoading: false }),
}));

vi.mock('../backfill-readiness-for-held-position', async importOriginal => ({
  ...(await importOriginal<typeof import('../backfill-readiness-for-held-position')>()),
  useBackfillReadinessForHeldPosition: mocks.backfill,
}));

// The card is tested on its own; here only what the list hands it matters.
vi.mock('../matchmaking/matchmaking-claim-card', () => ({
  isResolvableClaim: () => true,
  MatchmakingClaimCard: ({
    positions,
    header,
    endSlot,
    footer,
    onOpenClaim,
  }: {
    positions: { total_count: number }[];
    header?: React.ReactNode;
    endSlot?: React.ReactNode;
    footer?: React.ReactNode;
    onOpenClaim?: () => void;
  }) => (
    <article data-testid="card" data-counts={positions.map(side => side.total_count).join(',')}>
      {/* Not a button: the tests count the card's buttons. */}
      {onOpenClaim ? <span data-testid="claim-text" onClick={onOpenClaim} /> : null}
      {header}
      <div data-testid="card-end">{endSlot}</div>
      {footer}
    </article>
  ),
}));

vi.mock('~/design-system/avatar', () => ({ Avatar: () => <span data-testid="avatar" /> }));
vi.mock('~/core/hooks/use-open-claim-in-side-panel', () => ({ useOpenClaimInSidePanel: () => mocks.openClaim }));

afterEach(() => {
  cleanup();
  mocks.snapshot = { status: 'idle', pending: null, runId: null };
  mocks.indexed = null;
  mocks.rootSelectors = [];
  mocks.watchLive = true;
});

function person(name: string): DebateParticipantSummary {
  return { user_id: `user-${name}`, profile_space_id: `space-${name}`, display_name: name, avatar_cid: null };
}

function side(position: boolean, participants: DebateParticipantSummary[], requestable: number): LobbyRoomSide {
  return {
    position,
    position_label: position ? 'Agree' : 'Disagree',
    total_count: participants.length,
    available_now_count: requestable,
    present_count: participants.length,
    participants,
    requestable_count: requestable,
  };
}

function entry(viewerPosition: boolean | null, positions: LobbyRoomSide[]): LobbyRoomClaim {
  return {
    claim: { id: 'claim-row-1', space_id: 'space-1', claim_entity_id: 'claim-1', claim: 'A claim', description: null },
    readiness: {
      response_kind: 'stance',
      viewer_response:
        viewerPosition === null
          ? null
          : { position: viewerPosition, position_label: viewerPosition ? 'Agree' : 'Disagree' },
      viewer_debate_ready: true,
      readiness_disabled_reason: null,
    },
    positions,
  };
}

const renderOffer = ({ viewerPosition, requestableCount }: LobbyRoomOffer) => (
  <button type="button">{`Request ${viewerPosition ? 'as agree' : 'as disagree'} (${requestableCount})`}</button>
);

// The lobby's claims column scrolls only on a desktop, and the card stays mounted across the
// breakpoint, so it has to follow the selector it is handed rather than assume the hub's.
describe('LobbyRoomClaimCard scroll root', () => {
  it('measures against the scroll box the provider names, and the viewport when it names none', () => {
    const card = (selector: string | undefined) => (
      <HubScrollSelectorProvider value={selector}>
        <LobbyRoomClaimCard entry={entry(true, [side(true, [], 0), side(false, [], 0)])} renderOffer={renderOffer} />
      </HubScrollSelectorProvider>
    );
    const { rerender } = render(card(HUB_SCROLL_SELECTOR));
    expect(mocks.rootSelectors.at(-1)).toBe(HUB_SCROLL_SELECTOR);

    rerender(card(undefined));
    expect(mocks.rootSelectors.at(-1)).toBeUndefined();
  });
});

// GEO-3332. Reading a claim must not cost the lobby: it opens beside it, never on its own page.
describe('LobbyRoomClaimCard claim text', () => {
  it('opens the claim in the side panel', () => {
    render(
      <LobbyRoomClaimCard entry={entry(true, [side(true, [], 0), side(false, [], 0)])} renderOffer={renderOffer} />
    );
    screen.getByTestId('claim-text').click();
    expect(mocks.openClaim).toHaveBeenCalledWith(
      expect.objectContaining({ claim_entity_id: 'claim-1', space_id: 'space-1' })
    );
    cleanup();
  });
});

describe('LobbyRoomClaimsList', () => {
  it('offers a request and names who disagrees when someone on the other side can be asked', () => {
    render(
      <LobbyRoomClaimsList
        claims={[entry(true, [side(true, [person('Ana')], 0), side(false, [person('Ben'), person('Cy')], 1)])]}
        renderOffer={renderOffer}
      />
    );

    expect(screen.getByRole('button', { name: 'Request as agree (1)' })).toBeTruthy();
    expect(screen.getByTestId('lobby-claim-disagreeing').textContent).toContain('Disagrees with you: Ben and Cy');
  });

  it('names who disagrees but offers nothing when none of them can be asked', () => {
    render(
      <LobbyRoomClaimsList
        claims={[entry(true, [side(true, [], 0), side(false, [person('Ben')], 0)])]}
        renderOffer={renderOffer}
      />
    );

    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByTestId('lobby-claim-disagreeing').textContent).toContain('Ben');
  });

  it('offers nothing and names nobody while the viewer holds no side', () => {
    render(
      <LobbyRoomClaimsList
        claims={[entry(null, [side(true, [person('Ana')], 1), side(false, [person('Ben')], 1)])]}
        renderOffer={renderOffer}
      />
    );

    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByTestId('lobby-claim-disagreeing')).toBeNull();
  });

  it('follows a vote that geo-chat has not seen yet', () => {
    mocks.snapshot = { status: 'reconciling', pending: { expectedResponse: 'negative' }, runId: 'run-1' };
    render(
      <LobbyRoomClaimsList
        claims={[entry(null, [side(true, [person('Ana')], 1), side(false, [person('Ben')], 0)])]}
        renderOffer={renderOffer}
      />
    );

    expect(screen.getByRole('button', { name: 'Request as disagree (1)' })).toBeTruthy();
    expect(screen.getByTestId('lobby-claim-disagreeing').textContent).toContain('Ana');
  });

  it('takes the offer away while a cleared response confirms', () => {
    mocks.snapshot = { status: 'reconciling', pending: { expectedResponse: null }, runId: 'run-1' };
    render(
      <LobbyRoomClaimsList
        claims={[entry(true, [side(true, [], 0), side(false, [person('Ben')], 1)])]}
        renderOffer={renderOffer}
      />
    );

    expect(screen.queryByRole('button')).toBeNull();
  });

  it('backfills readiness for the side the viewer holds, from geo-chat’s own row', () => {
    const claim = entry(true, [side(true, [], 0), side(false, [person('Ben')], 0)]);
    render(<LobbyRoomClaimsList claims={[claim]} renderOffer={renderOffer} />);

    expect(mocks.backfill).toHaveBeenCalledWith({
      readiness: claim.readiness,
      entityId: 'claim-1',
      spaceId: 'space-1',
      indexedPosition: null,
    });
  });

  it('points at a live debate when there is no offer, and never draws one beside the offer', () => {
    const live = { ...entry(true, [side(true, [], 0), side(false, [person('Ben')], 0)]), activeDebate: true };
    const { unmount } = render(<LobbyRoomClaimsList claims={[live]} renderOffer={renderOffer} />);
    expect(screen.getByRole('link', { name: 'Watch live' }).getAttribute('href')).toBe('/space/space-1/debates');
    unmount();

    const offered = { ...entry(true, [side(true, [], 0), side(false, [person('Ben')], 1)]), activeDebate: true };
    render(<LobbyRoomClaimsList claims={[offered]} renderOffer={renderOffer} />);
    expect(screen.getByRole('button', { name: 'Request as agree (1)' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Watch live' })).toBeNull();
  });

  it('draws no Watch live while live watching is off, leaving the spacer', () => {
    mocks.watchLive = false;
    const live = { ...entry(true, [side(true, [], 0), side(false, [person('Ben')], 0)]), activeDebate: true };
    render(<LobbyRoomClaimsList claims={[live]} renderOffer={renderOffer} />);

    expect(screen.queryByRole('link', { name: 'Watch live' })).toBeNull();
    expect(screen.getByTestId('card-end').querySelector('span[aria-hidden]')).toBeTruthy();
  });

  describe('a host menu', () => {
    const renderMenu = () => <button type="button">Claim options</button>;

    it('sits beside the offer', () => {
      const offered = entry(true, [side(true, [], 0), side(false, [person('Ben')], 1)]);
      render(<LobbyRoomClaimsList claims={[offered]} renderOffer={renderOffer} renderMenu={renderMenu} />);
      expect(screen.getByRole('button', { name: 'Request as agree (1)' })).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Claim options' })).toBeTruthy();
    });

    it('sits beside Watch live', () => {
      const live = { ...entry(true, [side(true, [], 0), side(false, [], 0)]), activeDebate: true };
      render(<LobbyRoomClaimsList claims={[live]} renderOffer={renderOffer} renderMenu={renderMenu} />);
      expect(screen.getByRole('link', { name: 'Watch live' })).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Claim options' })).toBeTruthy();
    });

    it('stands alone in place of the spacer, under the header', () => {
      const quiet = entry(null, [side(true, [], 0), side(false, [], 0)]);
      const { container } = render(
        <LobbyRoomClaimsList
          claims={[quiet]}
          renderOffer={renderOffer}
          renderMenu={renderMenu}
          renderHeader={() => <p>Highlighted by Ana</p>}
        />
      );
      expect(screen.getAllByRole('button').map(button => button.textContent)).toEqual(['Claim options']);
      expect(screen.getByText('Highlighted by Ana')).toBeTruthy();
      expect(container.querySelector('[aria-hidden]')).toBeNull();
    });
  });

  it('takes the chain’s side only for a withdrawn row, never where geo-chat simply has none', () => {
    mocks.indexed = 'positive';
    const noRow = entry(null, [side(true, [], 0), side(false, [person('Ben')], 1)]);
    const { unmount } = render(<LobbyRoomClaimsList claims={[noRow]} renderOffer={renderOffer} />);
    expect(screen.queryByRole('button')).toBeNull();
    unmount();

    const withdrawn = {
      ...noRow,
      readiness: { ...noRow.readiness, readiness_disabled_reason: 'claim_response_withdrawn' },
    };
    render(<LobbyRoomClaimsList claims={[withdrawn]} renderOffer={renderOffer} />);
    expect(screen.getByRole('button', { name: 'Request as agree (1)' })).toBeTruthy();
  });
});

// Explore: the card's counts are Geo-wide; the room shows as a line under it.
describe('LobbyRoomClaimCard on Explore', () => {
  const geoWide = [side(true, [], 0), side(false, [], 0)].map(s => ({ ...s, total_count: 40 }));

  it('keeps the Geo-wide counts and adds the room line, with the offer on it', () => {
    const explore = {
      ...entry(true, geoWide),
      roomSides: [side(true, [person('Ana'), person('Bo')], 0), side(false, [person('Ben')], 1)],
    };
    render(<LobbyRoomClaimCard entry={explore} renderOffer={renderOffer} />);

    expect(screen.getByTestId('card').getAttribute('data-counts')).toBe('40,40');
    const line = screen.getByTestId('lobby-claim-room-line');
    // The viewer is counted on their own side.
    expect(line.textContent).toContain('In this room:');
    expect(line.textContent).toContain('3 agree');
    expect(line.textContent).toContain('1 disagrees');
    expect(line.querySelector('button')?.textContent).toBe('Request as agree (1)');
    expect(screen.getByTestId('card-end').querySelector('button')).toBeNull();
    expect(screen.queryByTestId('lobby-claim-disagreeing')).toBeNull();
  });

  it('draws the line without an offer when nobody on the other side can be asked', () => {
    const explore = { ...entry(true, geoWide), roomSides: [side(true, [], 0), side(false, [person('Ben')], 0)] };
    render(<LobbyRoomClaimCard entry={explore} renderOffer={renderOffer} />);

    expect(screen.getByTestId('lobby-claim-room-line').textContent).toContain('1 agrees');
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('draws no room line and no offer when nobody in the room holds a side', () => {
    const explore = { ...entry(true, geoWide), roomSides: null };
    render(<LobbyRoomClaimCard entry={explore} renderOffer={renderOffer} />);

    expect(screen.getByTestId('card').getAttribute('data-counts')).toBe('40,40');
    expect(screen.queryByTestId('lobby-claim-room-line')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });
});
