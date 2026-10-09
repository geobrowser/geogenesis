'use client';

import * as React from 'react';

import { useQueuedAction } from '~/core/state/pending-actions';

import { type DebateLobbyMember, dashlessId } from '../api';
import { useCreateDebateChallenge, useDebateActivity } from '../hooks';
import { useDebateRequests } from '../matchmaking/hooks';
import { useLiveRequestBlock } from '../matchmaking/use-live-request-block';
import { sameId } from '../rooms/room-presence';
import { useCurrentGeoChatUserId } from '../use-current-geo-chat-user-id';
import { personName } from './lobby-format';
import { useIsLobbyGuest } from './lobby-guest-hooks';
import { lobbyAuthPage, useLobbyGuestSignIn } from './lobby-guest-sign-in';
import { canRequestLobbyMember, lobbyChallengeErrorMessage } from './lobby-request-debate';
import type { LobbyPageView } from './lobby-view';

/** Who a visitor without an account asked to debate, kept through sign-up. */
export type QueuedLobbyRequest = { user_id: string; profile_space_id: string; name: string };

export const LOBBY_QUEUED_REQUEST_COPY = {
  signUpToSend: 'Sign up to send',
  prompt: (name: string) => `Create an account to request a debate with ${name}.`,
  sent: (name: string) => `Debate request sent to ${name}.`,
  left: (name: string) => `${name} left the lobby, so your debate request wasn’t sent.`,
  busy: (name: string) => `${name} is in a debate right now, so your debate request wasn’t sent.`,
  self: 'That was you, so there was no debate request to send.',
  blocked: (name: string, reason: string) => `Your debate request to ${name} wasn’t sent. ${reason}`,
  failed: (name: string) => `Your debate request to ${name} couldn’t be sent.`,
} as const;

export function encodeQueuedLobbyRequest(member: DebateLobbyMember): string {
  const request: QueuedLobbyRequest = {
    user_id: member.user_id,
    profile_space_id: member.profile_space_id,
    name: personName(member),
  };
  return JSON.stringify(request);
}

export function decodeQueuedLobbyRequest(intent: string | undefined): QueuedLobbyRequest | null {
  if (!intent) return null;
  try {
    const parsed = JSON.parse(intent) as Partial<QueuedLobbyRequest>;
    if (typeof parsed.user_id !== 'string' || typeof parsed.profile_space_id !== 'string') return null;
    return { user_id: parsed.user_id, profile_space_id: parsed.profile_space_id, name: parsed.name ?? 'them' };
  } catch {
    return null;
  }
}

export type QueuedRequestCheck = { send: true; member: DebateLobbyMember } | { send: false; message: string };

/**
 * Whether a request queued before sign-up still stands, decided on the lobby as it is now: the
 * person may have left, started a debate, or turned out to be the account that just signed in.
 */
export function checkQueuedLobbyRequest(
  request: QueuedLobbyRequest,
  lobby: Pick<LobbyPageView, 'members'>,
  viewerId: string,
  blockedReason: string | null
): QueuedRequestCheck {
  if (sameId(request.user_id, viewerId)) return { send: false, message: LOBBY_QUEUED_REQUEST_COPY.self };
  const member = lobby.members.find(candidate => sameId(candidate.user_id, request.user_id));
  if (!member) return { send: false, message: LOBBY_QUEUED_REQUEST_COPY.left(request.name) };
  if (!canRequestLobbyMember(member, viewerId)) {
    return { send: false, message: LOBBY_QUEUED_REQUEST_COPY.busy(request.name) };
  }
  if (blockedReason) return { send: false, message: LOBBY_QUEUED_REQUEST_COPY.blocked(request.name, blockedReason) };
  return { send: true, member };
}

type LobbyQueuedRequestValue = {
  /** The request waiting on sign-up, if any. */
  pending: QueuedLobbyRequest | null;
  request: (member: DebateLobbyMember) => void;
  /** What became of the queued request once the account was ready. */
  outcome: string | null;
  dismissOutcome: () => void;
};

const LobbyQueuedRequestContext = React.createContext<LobbyQueuedRequestValue>({
  pending: null,
  request: () => undefined,
  outcome: null,
  dismissOutcome: () => undefined,
});

export function useLobbyQueuedRequest() {
  return React.useContext(LobbyQueuedRequestContext);
}

/**
 * A debate request tapped without an account (GEO-3131), queued through sign-up and sent once the
 * account has joined, if the person can still be asked. One per lobby; a newer tap replaces it.
 */
export function LobbyQueuedRequestProvider({
  lobby,
  joined,
  children,
}: {
  lobby: LobbyPageView;
  /** This tab has joined the lobby, which geo-chat requires of a lobby-scoped request. */
  joined: boolean;
  children: React.ReactNode;
}) {
  const lobbyId = dashlessId(lobby.lobby_id);
  // Signed out: requests are queued and sign-up opens.
  const guest = useIsLobbyGuest();
  const viewerId = useCurrentGeoChatUserId();
  const member = !guest && joined;
  const activity = useDebateActivity(member);
  const requests = useDebateRequests(member);
  const { blockedReason, buttonsDisabled, outboundChallenge } = useLiveRequestBlock(activity.data, requests.data);
  const createChallenge = useCreateDebateChallenge();
  const [outcome, setOutcome] = React.useState<string | null>(null);

  const ready = member && viewerId !== null && activity.data !== undefined && requests.data !== undefined;
  const reason =
    blockedReason ?? (buttonsDisabled && outboundChallenge ? 'You have a debate request awaiting a reply.' : null);

  const queued = useQueuedAction({
    id: `lobby-request:${lobbyId}`,
    component: 'debate_matchmaking',
    label: 'your debate request',
    // Sent from the lobby as it is after sign-up, never from the tap's closure.
    liveOnly: true,
    ready,
    run: async (intent, { isCurrent }) => {
      const request = decodeQueuedLobbyRequest(intent);
      // `ready` waits for the id; a sign-out since leaves nothing to send as.
      if (!request || !viewerId) return;
      const check = checkQueuedLobbyRequest(request, lobby, viewerId, reason);
      if (!check.send) {
        setOutcome(check.message);
        return;
      }
      if (!isCurrent()) return;
      try {
        await createChallenge.mutateAsync({
          recipient_profile_space_id: check.member.profile_space_id,
          lobby_id: lobbyId,
        });
        setOutcome(LOBBY_QUEUED_REQUEST_COPY.sent(request.name));
      } catch (error) {
        // Said here rather than thrown: the runner would keep it queued and retry a refusal.
        setOutcome(lobbyChallengeErrorMessage(error) ?? LOBBY_QUEUED_REQUEST_COPY.failed(request.name));
      }
    },
  });

  const signIn = useLobbyGuestSignIn(lobbyId);
  const { queue, cancel } = queued;
  const request = React.useCallback(
    (target: DebateLobbyMember) => {
      queue(encodeQueuedLobbyRequest(target));
      signIn(
        {
          ...lobbyAuthPage(lobbyId),
          component: 'debate_matchmaking',
          target_type: 'space',
          target_id: target.profile_space_id,
          auth_control: 'start_debate',
          auth_intent: 'start_debate',
          auth_continuation: 'queued',
        },
        // Walked away from: the request must not go out on some later sign-in.
        { onCancel: cancel }
      );
    },
    [cancel, lobbyId, queue, signIn]
  );

  const pending = React.useMemo(() => decodeQueuedLobbyRequest(queued.intent), [queued.intent]);
  const dismissOutcome = React.useCallback(() => setOutcome(null), []);
  const value = React.useMemo(
    () => ({ pending, request, outcome, dismissOutcome }),
    [pending, request, outcome, dismissOutcome]
  );

  return <LobbyQueuedRequestContext.Provider value={value}>{children}</LobbyQueuedRequestContext.Provider>;
}
