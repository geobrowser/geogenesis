'use client';

import { Text } from '~/design-system/text';

import { type DebateLobbyMember, GeoChatRequestError, dashlessId } from '../api';
import { useCreateDebateChallenge, useDebateActivity, useRejectDebateChallenge } from '../hooks';
import { useDebateRequests } from '../matchmaking/hooks';
import { HubPillButton } from '../matchmaking/hub-pill-button';
import { useLiveRequestBlock } from '../matchmaking/use-live-request-block';
import { sameId } from '../rooms/room-presence';
import { useCurrentGeoChatUserId } from '../use-current-geo-chat-user-id';
import { personName } from './lobby-format';
import { useIsLobbyGuest } from './lobby-guest-hooks';
import { useLobbyHandoff } from './lobby-popup';
import { LOBBY_QUEUED_REQUEST_COPY, useLobbyQueuedRequest } from './lobby-queued-request';
import { lobbyClaimRequestErrorMessage } from './lobby-room-claims-hooks';

/** Someone else, in the room and not debating. A signed-out viewer has no id and asks nobody. */
export function canRequestLobbyMember(member: DebateLobbyMember, viewerId: string | null) {
  if (!viewerId || sameId(member.user_id, viewerId)) return false;
  return !member.in_debate && !member.stepped_out;
}

/** geo-chat's refusals of a lobby challenge, as the claim request words them; null for any other. */
export function lobbyChallengeErrorMessage(error: unknown) {
  if (error instanceof GeoChatRequestError && error.code === 'lobby_recipient_not_present') {
    return 'They’re not in the lobby right now.';
  }
  return lobbyClaimRequestErrorMessage(error);
}

/**
 * Asks one lobby member for a claimless debate, the same challenge a profile or the People tab
 * sends. Accepting routes both into the picker through `DebateCoordinator`. Drawn full width in the
 * person menu.
 */
export function LobbyRequestDebate({ lobbyId, member }: { lobbyId: string; member: DebateLobbyMember }) {
  const guest = useIsLobbyGuest();
  return guest ? <GuestRequestDebate member={member} /> : <MemberRequestDebate lobbyId={lobbyId} member={member} />;
}

const REQUEST_LABEL = 'Request a debate';
const WIDE_PILL = 'w-full md:h-10';

/** Without an account: the tap is queued and sign-up opens; it is sent after, if it still can be. */
function GuestRequestDebate({ member }: { member: DebateLobbyMember }) {
  const { pending, request } = useLobbyQueuedRequest();
  // Sign-in opens its own modal, so the person menu closes first.
  const { handoff } = useLobbyHandoff();
  if (member.in_debate || member.stepped_out) return null;
  const name = personName(member);
  if (pending && sameId(pending.user_id, member.user_id)) {
    return (
      <Text as="p" variant="footnote" color="grey-04" className="px-1.5 py-1">
        {LOBBY_QUEUED_REQUEST_COPY.signUpToSend}
      </Text>
    );
  }
  return (
    <HubPillButton
      variant="primary"
      aria-label={`Request a debate with ${name}`}
      analyticsLabel="Lobby guest request debate"
      analyticsIntent="start_debate"
      onClick={() => handoff(() => request(member))}
      className={WIDE_PILL}
    >
      {REQUEST_LABEL}
    </HubPillButton>
  );
}

function MemberRequestDebate({ lobbyId, member }: { lobbyId: string; member: DebateLobbyMember }) {
  const viewerId = useCurrentGeoChatUserId();
  const visible = canRequestLobbyMember(member, viewerId);
  const { data: activity } = useDebateActivity(visible);
  const { data: requests } = useDebateRequests(visible);
  const { outboundChallenge, blockedReason, buttonsDisabled } = useLiveRequestBlock(activity, requests);
  const createChallenge = useCreateDebateChallenge();
  const cancelChallenge = useRejectDebateChallenge();

  if (!visible) return null;

  const name = personName(member);
  const sentHere = outboundChallenge !== null && sameId(outboundChallenge.recipient.user_id, member.user_id);
  const error = (sentHere ? cancelChallenge.error : createChallenge.error) ?? null;

  return (
    <div className="flex flex-col gap-1">
      {sentHere ? (
        <span className="flex items-center justify-center gap-2 py-1 text-footnote text-grey-04">
          <span>Awaiting response</span>
          <span aria-hidden>·</span>
          <button
            type="button"
            onClick={() => cancelChallenge.mutate(outboundChallenge.id)}
            disabled={cancelChallenge.isPending}
            className="text-text underline transition-colors hover:text-grey-04 disabled:opacity-50"
          >
            {cancelChallenge.isPending ? 'Cancelling…' : 'Cancel request'}
          </button>
        </span>
      ) : (
        <HubPillButton
          variant="primary"
          aria-label={`Request a debate with ${name}`}
          analyticsLabel="Lobby request debate"
          analyticsIntent="start_debate"
          disabled={buttonsDisabled}
          title={buttonsDisabled ? (blockedReason ?? 'You have a debate request awaiting a reply.') : undefined}
          pending={createChallenge.isPending}
          pendingLabel="Requesting…"
          onClick={() =>
            createChallenge.mutate({
              recipient_profile_space_id: member.profile_space_id,
              lobby_id: dashlessId(lobbyId),
            })
          }
          className={WIDE_PILL}
        >
          {REQUEST_LABEL}
        </HubPillButton>
      )}
      {error instanceof Error ? (
        <div role="alert">
          <Text as="p" variant="footnote" color="red-01">
            {lobbyChallengeErrorMessage(error) ?? error.message}
          </Text>
        </div>
      ) : null}
    </div>
  );
}
