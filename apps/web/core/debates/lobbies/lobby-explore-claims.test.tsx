import { cleanup, render, screen } from '@testing-library/react';

import * as React from 'react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { DebateLobbyClaim, MatchmakingClaim } from '../api';
import { claimRowKey } from '../matchmaking/claim-row-key';
import type { ClaimCardDefaults } from '../matchmaking/claims-tab';
import { HUB_SCROLL_SELECTOR, HubScrollSelectorProvider } from '../matchmaking/hub-scroll';
import { LobbyExploreClaims, exploreRoomClaim, hasDebateClaimRow } from './lobby-explore-claims';
import type { LobbyRoomClaim, LobbyRoomOffer } from './lobby-room-claims-list';
import type { LobbyPageView } from './lobby-view';

const mocks = vi.hoisted(() => ({
  entries: [] as MatchmakingClaim[],
  roomRows: [] as DebateLobbyClaim[],
  requestLobbyIds: [] as string[],
  batches: [] as string[][],
  rootSelectors: [] as (string | undefined)[],
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

// The tab draws whatever the lobby hands it, one card per entry.
vi.mock('../matchmaking/claims-tab', () => ({
  ClaimsTab: ({
    renderClaim,
    onVisibleClaims,
  }: {
    renderClaim: (entry: MatchmakingClaim, card: ClaimCardDefaults) => React.ReactElement;
    onVisibleClaims: (entries: MatchmakingClaim[]) => void;
  }) => {
    React.useEffect(() => onVisibleClaims(mocks.entries), [onVisibleClaims]);
    return (
      <div>
        {mocks.entries.map(entry =>
          React.cloneElement(renderClaim(entry, { answersReady: true, allowsSignedOutVotes: false }), {
            key: entry.claim.id,
          })
        )}
      </div>
    );
  },
}));
vi.mock('./lobby-explore-claims-hooks', async importOriginal => ({
  ...(await importOriginal<typeof import('./lobby-explore-claims-hooks')>()),
  useLobbyExploreRoomClaims: (_lobbyId: string, batches: string[][]) => {
    mocks.batches = batches;
    return new Map(mocks.roomRows.map(row => [claimRowKey(row), row]));
  },
}));
vi.mock('./lobby-highlights-hooks', () => ({ useLobbyHighlights: () => ({ data: undefined }) }));
vi.mock('./lobby-highlights', () => ({
  LobbyClaimHostMenu: ({ claim }: { claim: { id: string } }) => <span data-testid={`host-menu-${claim.id}`} />,
}));
vi.mock('./lobby-room-claims', async importOriginal => ({
  ...(await importOriginal<typeof import('./lobby-room-claims')>()),
  LobbyClaimRequest: ({ lobbyId, offer }: { lobbyId: string; offer: LobbyRoomOffer }) => {
    mocks.requestLobbyIds.push(lobbyId);
    return <span data-testid={`request-${offer.entry.claim.id}`} />;
  },
}));
// The room card's own logic is tested with it; here it reports what it was given and offers when it would.
vi.mock('./lobby-room-claims-list', () => ({
  LobbyRoomClaimCard: ({
    entry,
    renderOffer,
    renderMenu,
  }: {
    entry: LobbyRoomClaim;
    renderOffer: (offer: LobbyRoomOffer) => React.ReactNode;
    renderMenu?: (entry: LobbyRoomClaim) => React.ReactNode;
  }) => {
    const viewerPosition = entry.readiness.viewer_response?.position ?? null;
    const requestableCount = entry.roomSides?.find(side => side.position !== viewerPosition)?.requestable_count ?? 0;
    return (
      <article data-testid={`card-${entry.claim.id}`} data-outside-room={entry.roomSides ? undefined : 'true'}>
        {viewerPosition !== null && requestableCount > 0
          ? renderOffer({ entry, viewerPosition, requestableCount, indexedPosition: null, indexingDelayed: false })
          : null}
        {renderMenu?.(entry)}
      </article>
    );
  },
}));

const ENTITY = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4';
const ENTITY_2 = 'b1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4';
const SPACE = 'c1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4';

function lobby(hosting: boolean) {
  return { lobby_id: 'lobby-1', name: 'Lobby', viewer: { hosting } } as unknown as LobbyPageView;
}

function exploreEntry(id: string, entityId: string): MatchmakingClaim {
  return {
    claim: { id, space_id: SPACE, claim_entity_id: entityId, claim: 'Claim', description: null },
    topics: [],
    response_kind: 'stance',
    viewer_response: { position: true, position_label: 'Agree' },
    viewer_position: true,
    viewer_debate_ready: true,
    readiness_disabled_reason: null,
    positions: [true, false].map(position => ({
      position,
      position_label: position ? 'Agree' : 'Disagree',
      total_count: 5,
      available_now_count: 5,
      present_count: 5,
      participants: [],
    })),
    score: 0,
    active_debate: false,
  };
}

function roomRow(id: string, entityId: string, requestable: number): DebateLobbyClaim {
  return {
    // geo-chat spells ids with dashes; Explore's rows may not.
    claim: {
      id,
      space_id: `${SPACE.slice(0, 8)}-${SPACE.slice(8, 12)}-${SPACE.slice(12, 16)}-${SPACE.slice(16, 20)}-${SPACE.slice(20)}`,
      claim_entity_id: entityId,
      claim: 'Claim',
      description: null,
    },
    response_kind: 'stance',
    viewer_response: { position: true, position_label: 'Agree' },
    viewer_debate_ready: true,
    readiness_disabled_reason: null,
    active_debate: false,
    positions: [true, false].map(position => ({
      position,
      position_label: position ? 'Agree' : 'Disagree',
      total_in_room: 2,
      requestable_count: position ? 0 : requestable,
      participants: [],
    })),
  };
}

afterEach(() => {
  cleanup();
  mocks.entries = [];
  mocks.roomRows = [];
  mocks.requestLobbyIds = [];
  mocks.batches = [];
  mocks.rootSelectors = [];
});

describe('exploreRoomClaim', () => {
  it('keeps the Geo-wide sides and adds the room’s where geo-chat has an entry', () => {
    const claim = exploreRoomClaim(exploreEntry(ENTITY, ENTITY), roomRow('row-1', ENTITY, 2));
    expect(claim.positions.map(side => side.total_count)).toEqual([5, 5]);
    // The others in the room; the card counts the viewer in.
    expect(claim.roomSides?.map(side => side.total_count)).toEqual([2, 2]);
    expect(claim.roomSides?.find(side => !side.position)?.requestable_count).toBe(2);
    // The entry's id is geo-chat's claim row, for host actions.
    expect(claim.claim.id).toBe('row-1');
  });

  it('keeps the tab’s sides, with nobody requestable, for a claim with no entry', () => {
    const claim = exploreRoomClaim(exploreEntry('row-1', ENTITY), undefined);
    expect(claim.roomSides).toBeNull();
    expect(claim.positions.map(side => side.total_count)).toEqual([5, 5]);
    expect(claim.positions.every(side => side.requestable_count === 0)).toBe(true);
  });
});

describe('hasDebateClaimRow', () => {
  it('is false for the entity-id fallback, in either spelling', () => {
    expect(hasDebateClaimRow({ id: ENTITY, claim_entity_id: ENTITY })).toBe(false);
    expect(hasDebateClaimRow({ id: ENTITY.toUpperCase(), claim_entity_id: ENTITY })).toBe(false);
    expect(hasDebateClaimRow({ id: 'row-1', claim_entity_id: ENTITY })).toBe(true);
  });
});

describe('LobbyExploreClaims', () => {
  // The lobby's claims column scrolls only on a desktop, and Explore stays mounted across the
  // breakpoint, so its cards have to follow the selector they are handed rather than assume one.
  it('measures its cards against the scroll box the provider names, and the viewport when it names none', () => {
    mocks.entries = [exploreEntry('row-1', ENTITY)];
    const explore = (selector: string | undefined) => (
      <HubScrollSelectorProvider value={selector}>
        <LobbyExploreClaims lobby={lobby(false)} />
      </HubScrollSelectorProvider>
    );
    const { rerender } = render(explore(HUB_SCROLL_SELECTOR));
    expect(mocks.rootSelectors.at(-1)).toBe(HUB_SCROLL_SELECTOR);

    rerender(explore(undefined));
    expect(mocks.rootSelectors.at(-1)).toBeUndefined();
  });

  it('offers a lobby-scoped request only where someone in the room is requestable', () => {
    mocks.entries = [exploreEntry('row-1', ENTITY), exploreEntry('row-2', ENTITY_2)];
    mocks.roomRows = [roomRow('row-1', ENTITY, 1)];
    render(<LobbyExploreClaims lobby={lobby(false)} />);

    expect(screen.getByTestId('request-row-1')).toBeTruthy();
    expect(screen.queryByTestId('request-row-2')).toBeNull();
    expect(screen.getByTestId('card-row-2').getAttribute('data-outside-room')).toBe('true');
    expect(new Set(mocks.requestLobbyIds)).toEqual(new Set(['lobby-1']));
  });

  it('asks for the room’s sides of the claims on screen', () => {
    mocks.entries = [exploreEntry('row-2', ENTITY_2), exploreEntry('row-1', ENTITY)];
    render(<LobbyExploreClaims lobby={lobby(false)} />);
    expect(mocks.batches).toEqual([[ENTITY, ENTITY_2]]);
  });

  it('gives hosts the claim menu only on claims geo-chat has a row for', () => {
    mocks.entries = [exploreEntry('row-1', ENTITY), exploreEntry(ENTITY_2, ENTITY_2)];
    render(<LobbyExploreClaims lobby={lobby(true)} />);

    expect(screen.getByTestId('host-menu-row-1')).toBeTruthy();
    expect(screen.queryByTestId(`host-menu-${ENTITY_2}`)).toBeNull();
  });

  it('gives members no claim menu', () => {
    mocks.entries = [exploreEntry('row-1', ENTITY)];
    render(<LobbyExploreClaims lobby={lobby(false)} />);
    expect(screen.queryByTestId('host-menu-row-1')).toBeNull();
  });
});
