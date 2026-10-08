import { cleanup, render, screen } from '@testing-library/react';

import * as React from 'react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { DebateParticipantSummary } from '../api';
import {
  type LobbyRoomClaim,
  LobbyRoomClaimsList,
  type LobbyRoomOffer,
  type LobbyRoomSide,
} from './lobby-room-claims-list';

const mocks = vi.hoisted(() => ({
  backfill: vi.fn(),
  indexed: null as 'positive' | 'negative' | null,
  snapshot: { status: 'idle', pending: null, runId: null } as {
    status: string;
    pending: { expectedResponse: 'positive' | 'negative' | null } | null;
    runId: string | null;
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
  MatchmakingClaimCard: ({ endSlot, footer }: { endSlot?: React.ReactNode; footer?: React.ReactNode }) => (
    <article>
      {endSlot}
      {footer}
    </article>
  ),
}));

vi.mock('~/design-system/avatar', () => ({ Avatar: () => <span data-testid="avatar" /> }));

afterEach(() => {
  cleanup();
  mocks.snapshot = { status: 'idle', pending: null, runId: null };
  mocks.indexed = null;
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
