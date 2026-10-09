'use client';

import * as React from 'react';

import { responsePositionLabel } from '~/core/responses/entity-response';

import { Ellipsis } from '~/design-system/icons/ellipsis';
import { Menu } from '~/design-system/menu';
import { Text } from '~/design-system/text';

import {
  type DebateClaimSummary,
  type DebateLobbyClaim,
  type DebateLobbyHighlight,
  type DebateLobbyRoomVote,
  type DebateLobbyView,
  GeoChatRequestError,
} from '../api';
import { debateActionAnalyticsAttributes } from '../matchmaking/hub-analytics';
import { HubPillButton } from '../matchmaking/hub-pill-button';
import { moderationErrorMessage, personName } from './lobby-format';
import { LOBBY_GUEST_COPY } from './lobby-guest';
import { useIsLobbyGuest } from './lobby-guest-hooks';
import {
  useEndLobbyRoomVote,
  useLobbyHighlights,
  useRoomVoteHint,
  useSetLobbyHighlight,
  useStartLobbyRoomVote,
} from './lobby-highlights-hooks';
import {
  type LobbyHighlightsState,
  highlightedClaimIds,
  listedHighlights,
  viewerRoomVotePosition,
} from './lobby-highlights-state';
import { LobbyClaimRequest, LobbyRoomClaims, lobbyRoomClaimFrom } from './lobby-room-claims';
import { useDebateLobbyClaims } from './lobby-room-claims-hooks';
import { type LobbyRoomClaim, LobbyRoomClaimsList, type LobbyRoomOffer } from './lobby-room-claims-list';

export const LOBBY_HIGHLIGHTS_COPY = {
  highlight: 'Highlight at the top for everyone',
  removeHighlight: 'Remove highlight',
  askRoom: 'Ask the room to vote',
  endVote: 'End vote',
  noVotes: 'Nobody has voted yet',
} as const;

/**
 * "In this room" with the hosts' highlights first (GEO-3135). Highlighted claims leave the list
 * below, and the voted claim shows in the room vote card instead.
 */
export function LobbyRoomClaimsWithHighlights({
  lobby,
  onExplore,
}: {
  lobby: DebateLobbyView;
  onExplore?: () => void;
}) {
  const { data: state } = useLobbyHighlights(lobby.lobby_id);
  const hosting = lobby.viewer.hosting;
  const excludeClaimIds = React.useMemo(() => highlightedClaimIds(state), [state]);
  const highlighted = listedHighlights(state);

  const renderMenu = React.useCallback(
    (entry: LobbyRoomClaim) => <LobbyClaimHostMenu lobbyId={lobby.lobby_id} claim={entry.claim} state={state} />,
    [lobby.lobby_id, state]
  );

  return (
    <div className="flex flex-col gap-2">
      {highlighted.length > 0 ? (
        <LobbyHighlightedClaims lobby={lobby} highlights={highlighted} renderMenu={hosting ? renderMenu : undefined} />
      ) : null}
      <LobbyRoomClaims
        lobby={lobby}
        excludeClaimIds={excludeClaimIds}
        onExplore={onExplore}
        renderMenu={hosting ? renderMenu : undefined}
      />
    </div>
  );
}

function LobbyHighlightedClaims({
  lobby,
  highlights,
  renderMenu,
}: {
  lobby: DebateLobbyView;
  highlights: DebateLobbyHighlight[];
  renderMenu?: (entry: LobbyRoomClaim) => React.ReactNode;
}) {
  const roomClaims = useLobbyRoomClaimsById(lobby.lobby_id);
  const entries = highlights.map(highlight => lobbyClaimEntry(highlight.claim, roomClaims.get(highlight.claim.id)));
  const byClaimId = new Map(highlights.map(highlight => [highlight.claim.id, highlight]));
  const renderOffer = React.useCallback(
    (offer: LobbyRoomOffer) => <LobbyClaimRequest lobbyId={lobby.lobby_id} offer={offer} />,
    [lobby.lobby_id]
  );

  return (
    <section aria-label="Highlighted claims" data-testid="lobby-highlighted-claims">
      <LobbyRoomClaimsList
        claims={entries}
        renderOffer={renderOffer}
        renderMenu={renderMenu}
        renderHeader={entry => <HighlightedBy highlight={byClaimId.get(entry.claim.id)} />}
      />
    </section>
  );
}

function HighlightedBy({ highlight }: { highlight: DebateLobbyHighlight | undefined }) {
  if (!highlight) return null;
  return (
    <div className="mb-2 flex items-center gap-1.5 text-footnoteMedium text-purple" data-testid="lobby-highlighted-by">
      <PinIcon />
      {highlight.highlighted_by ? `Highlighted by ${personName(highlight.highlighted_by)}` : 'Highlighted'}
    </div>
  );
}

/**
 * The running room vote, above the claims for everyone in the lobby. Agree and Disagree are the
 * claim card's own, so a vote is the viewer's normal position; the tally counts the room.
 */
export function LobbyRoomVote({ lobby }: { lobby: DebateLobbyView }) {
  const { data: state } = useLobbyHighlights(lobby.lobby_id);
  const vote = state?.room_vote ?? null;
  useRoomVoteHint(lobby.lobby_id, vote, lobby.viewer.connected);
  if (!vote) return null;
  return <RoomVoteCard lobby={lobby} vote={vote} state={state} />;
}

function RoomVoteCard({
  lobby,
  vote,
  state,
}: {
  lobby: DebateLobbyView;
  vote: DebateLobbyRoomVote;
  state: LobbyHighlightsState | undefined;
}) {
  const roomClaims = useLobbyRoomClaimsById(lobby.lobby_id);
  const endVote = useEndLobbyRoomVote(lobby.lobby_id);
  const guest = useIsLobbyGuest();
  const entry = lobbyClaimEntry(vote.claim, roomClaims.get(vote.claim.id), viewerRoomVotePosition(state));
  const renderOffer = React.useCallback(
    (offer: LobbyRoomOffer) => <LobbyClaimRequest lobbyId={lobby.lobby_id} offer={offer} />,
    [lobby.lobby_id]
  );

  return (
    <section
      aria-label="Room vote"
      className="flex flex-col gap-2 rounded-xl bg-ctaTertiary p-2"
      data-testid="lobby-room-vote"
    >
      <div className="flex items-center gap-2 px-1 pt-0.5">
        <Text as="p" variant="metadataMedium" className="min-w-0 flex-1 text-ctaPrimary" ellipsize>
          {vote.started_by ? `Room vote · started by ${personName(vote.started_by)}` : 'Room vote'}
        </Text>
        {lobby.viewer.hosting ? (
          <HubPillButton
            analyticsLabel="Lobby end room vote"
            pending={endVote.isPending}
            onClick={() => endVote.mutate(vote.vote_id)}
          >
            {LOBBY_HIGHLIGHTS_COPY.endVote}
          </HubPillButton>
        ) : null}
      </div>
      {endVote.isError ? (
        <Text as="p" variant="footnote" color="red-01" className="px-1">
          {moderationErrorMessage(endVote.error)}
        </Text>
      ) : null}
      <LobbyRoomClaimsList claims={[entry]} renderOffer={renderOffer} />
      <RoomVoteTally tally={vote.tally} />
      {guest ? (
        <Text as="p" variant="footnote" color="grey-04" className="px-1 pb-0.5">
          {LOBBY_GUEST_COPY.voteNeedsAccount}
        </Text>
      ) : null}
    </section>
  );
}

export function RoomVoteTally({ tally }: { tally: DebateLobbyRoomVote['tally'] }) {
  const voted = tally.agree + tally.disagree;
  const agreeShare = voted === 0 ? 0 : Math.round((tally.agree / voted) * 100);

  return (
    <div className="flex items-center gap-2 px-1 pb-0.5" data-testid="lobby-room-vote-tally">
      <Text as="span" variant="metadataMedium" className="shrink-0">
        {voted === 0 ? LOBBY_HIGHLIGHTS_COPY.noVotes : `${tally.agree} of ${voted} in the room agree`}
      </Text>
      <span className="flex h-0.5 min-w-6 flex-1 overflow-hidden rounded-full bg-grey-02" aria-hidden>
        {voted > 0 ? (
          <>
            <span className="block bg-green" style={{ width: `${agreeShare}%` }} />
            <span className="block bg-red-01" style={{ width: `${100 - agreeShare}%` }} />
          </>
        ) : null}
      </span>
      <Text as="span" variant="footnote" color="grey-04" className="shrink-0">
        {voted} of {tally.eligible} voted
      </Text>
    </div>
  );
}

/** Highlight and room vote controls on one claim. Rendered for hosts only. */
function LobbyClaimHostMenu({
  lobbyId,
  claim,
  state,
}: {
  lobbyId: string;
  claim: DebateClaimSummary;
  state: LobbyHighlightsState | undefined;
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <Menu
      open={open}
      onOpenChange={setOpen}
      asChild
      align="end"
      className="max-w-[260px]"
      trigger={
        <button
          type="button"
          aria-label="Claim options"
          {...debateActionAnalyticsAttributes('hub', 'Lobby claim options', 'open_lobby_claim_options')}
          className="flex h-5 w-7 shrink-0 items-center justify-center rounded-full bg-grey-01 text-grey-04 transition-colors hover:text-text"
        >
          <Ellipsis />
        </button>
      }
    >
      {/* Remounted on each open, so a confirm or error from last time does not linger. */}
      {open ? (
        <LobbyClaimHostActions lobbyId={lobbyId} claim={claim} state={state} onDone={() => setOpen(false)} />
      ) : null}
    </Menu>
  );
}

export function LobbyClaimHostActions({
  lobbyId,
  claim,
  state,
  onDone,
}: {
  lobbyId: string;
  claim: DebateClaimSummary;
  state: LobbyHighlightsState | undefined;
  onDone?: () => void;
}) {
  const setHighlight = useSetLobbyHighlight(lobbyId);
  const startVote = useStartLobbyRoomVote(lobbyId);
  // The running vote this one would end, once the host is asked to confirm.
  const [replacing, setReplacing] = React.useState<string | null>(null);
  const highlighted = state?.highlights.some(highlight => highlight.claim.id === claim.id) ?? false;
  const running = state?.room_vote ?? null;
  const pending = setHighlight.isPending || startVote.isPending;
  const error = setHighlight.error ?? startVote.error;

  const start = (replace: boolean) =>
    startVote.mutate(
      { claimId: claim.id, replace },
      {
        onSuccess: () => onDone?.(),
        onError: failure => {
          // Another host started a vote this page had not heard of yet.
          if (failure instanceof GeoChatRequestError && failure.code === 'lobby_room_vote_running') {
            const runningClaimId = failure.details?.debate_claim_id;
            setReplacing(runningClaimName(state, typeof runningClaimId === 'string' ? runningClaimId : null));
            startVote.reset();
          }
        },
      }
    );

  return (
    <div className="flex flex-col" role="group" aria-label="Claim options" data-testid="lobby-claim-host-actions">
      <Text as="p" variant="footnote" color="grey-04" className="px-3 pt-2 pb-1">
        Host controls
      </Text>
      {replacing !== null ? (
        <div className="flex flex-col gap-2 px-3 py-2">
          <Text as="p" variant="metadata">
            End the vote on “{replacing}” and start this one?
          </Text>
          <div className="flex flex-wrap gap-2">
            <HubPillButton
              variant="primary"
              analyticsLabel="Lobby replace room vote confirm"
              pending={startVote.isPending}
              onClick={() => start(true)}
            >
              End and start
            </HubPillButton>
            <HubPillButton
              analyticsLabel="Lobby replace room vote cancel"
              onClick={() => {
                setReplacing(null);
                startVote.reset();
              }}
            >
              Cancel
            </HubPillButton>
          </div>
        </div>
      ) : (
        <>
          <MenuRow
            analyticsLabel={highlighted ? 'Lobby remove highlight' : 'Lobby highlight claim'}
            disabled={pending}
            onClick={() =>
              setHighlight.mutate({ claimId: claim.id, highlighted: !highlighted }, { onSuccess: () => onDone?.() })
            }
          >
            {highlighted ? LOBBY_HIGHLIGHTS_COPY.removeHighlight : LOBBY_HIGHLIGHTS_COPY.highlight}
          </MenuRow>
          {running?.claim.id === claim.id ? null : (
            <MenuRow
              analyticsLabel="Lobby ask room to vote"
              disabled={pending}
              onClick={() => (running ? setReplacing(running.claim.claim) : start(false))}
            >
              {LOBBY_HIGHLIGHTS_COPY.askRoom}
            </MenuRow>
          )}
        </>
      )}
      {error ? (
        <Text as="p" variant="footnote" color="red-01" className="px-3 pb-2">
          {lobbyHighlightErrorMessage(error)}
        </Text>
      ) : null}
    </div>
  );
}

function MenuRow({
  analyticsLabel,
  disabled,
  onClick,
  children,
}: {
  analyticsLabel: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      {...debateActionAnalyticsAttributes('hub', analyticsLabel, 'moderate_lobby_claim')}
      onClick={onClick}
      className="flex w-full items-center bg-white px-3 py-2.5 text-left text-button text-text hover:bg-bg disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function runningClaimName(state: LobbyHighlightsState | undefined, claimId: string | null) {
  const known =
    state?.room_vote?.claim.id === claimId
      ? state.room_vote.claim
      : state?.highlights.find(highlight => highlight.claim.id === claimId)?.claim;
  return known?.claim ?? 'the current claim';
}

/** A refused highlight or vote action, in the host's terms. */
export function lobbyHighlightErrorMessage(error: unknown) {
  if (error instanceof GeoChatRequestError) {
    switch (error.code) {
      case 'lobby_highlight_limit': {
        const limit = error.details?.limit;
        return `You can highlight up to ${typeof limit === 'number' ? limit : 10} claims. Remove one first.`;
      }
      case 'debate_claim_not_found':
      case 'debate_claim_unavailable':
        return 'This claim can’t be highlighted.';
      case 'lobby_room_vote_not_found':
      case 'lobby_room_vote_ended':
        return 'That vote has already ended.';
    }
  }
  return moderationErrorMessage(error);
}

/** The room's list rows by claim id, so highlights and the vote reuse their sides and offers. */
function useLobbyRoomClaimsById(lobbyId: string) {
  const { data } = useDebateLobbyClaims(lobbyId);
  return React.useMemo(() => new Map((data?.claims ?? []).map(row => [row.claim.id, row])), [data?.claims]);
}

/**
 * A claim as the list draws it: from the room's row when someone in the room holds a side,
 * otherwise with empty sides and the viewer's side, where known.
 */
export function lobbyClaimEntry(
  claim: DebateClaimSummary,
  row: DebateLobbyClaim | undefined,
  viewerPosition: boolean | null = null
): LobbyRoomClaim {
  if (row) return lobbyRoomClaimFrom(row);
  return {
    claim,
    readiness: {
      response_kind: 'stance',
      viewer_response:
        viewerPosition === null
          ? null
          : { position: viewerPosition, position_label: responsePositionLabel(viewerPosition) },
      viewer_debate_ready: false,
      readiness_disabled_reason: null,
    },
    positions: [true, false].map(position => ({
      position,
      position_label: responsePositionLabel(position),
      total_count: position === viewerPosition ? 1 : 0,
      available_now_count: 0,
      present_count: position === viewerPosition ? 1 : 0,
      participants: [],
      requestable_count: 0,
    })),
  };
}

function PinIcon() {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 17v5" />
      <path d="M9 3h6l-1 6 4 4H6l4-4-1-6z" />
    </svg>
  );
}
