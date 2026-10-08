'use client';

import { Text } from '~/design-system/text';

import type { DebateLobbyMember } from '../api';
import { useCreateDebateChallenge, useDebateActivity, useRejectDebateChallenge } from '../hooks';
import { useDebateRequests } from '../matchmaking/hooks';
import { HubPillButton } from '../matchmaking/hub-pill-button';
import { useLiveRequestBlock } from '../matchmaking/use-live-request-block';
import { sameId } from '../rooms/room-presence';
import { useCurrentGeoChatUserId } from '../use-current-geo-chat-user-id';
import { personName } from './lobby-format';

/** Someone else, in the room and not debating. A signed-out viewer has no id and asks nobody. */
export function canRequestLobbyMember(member: DebateLobbyMember, viewerId: string | null) {
  if (!viewerId || sameId(member.user_id, viewerId)) return false;
  return !member.in_debate && !member.stepped_out;
}

/**
 * Asks one lobby member for a claimless debate, the same challenge a profile or the People tab
 * sends. Accepting routes both into the picker through `DebateCoordinator`.
 */
export function LobbyRequestDebate({ member }: { member: DebateLobbyMember }) {
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
    <div className="flex shrink-0 flex-col items-end gap-1">
      {sentHere ? (
        <span className="flex items-center gap-2 text-footnote text-grey-04">
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
          onClick={() => createChallenge.mutate({ recipient_profile_space_id: member.profile_space_id })}
        >
          Request debate
        </HubPillButton>
      )}
      {error instanceof Error ? (
        <div role="alert">
          <Text as="p" variant="footnote" color="red-01">
            {error.message}
          </Text>
        </div>
      ) : null}
    </div>
  );
}
