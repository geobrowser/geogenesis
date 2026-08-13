'use client';

import * as React from 'react';

import { Avatar } from '~/design-system/avatar';
import { Time } from '~/design-system/icons/time';
import { Text } from '~/design-system/text';

import type { DebateChallenge } from '../api';
import { useAcceptDebateChallenge, useDebateActivity, useRejectDebateChallenge } from '../hooks';
import { speakerLabel } from '../playback-utils';
import { useCurrentGeoChatUserId } from '../use-current-geo-chat-user-id';
import { SpaceTopicFilters } from './claims-tab';
import { useDebateRequests } from './hooks';
import { HubFilterMenu, type HubFilterOption } from './hub-filter-menu';
import { HubCardList } from './hub-motion';
import { HubPillButton } from './hub-pill-button';
import { HubQueryState } from './hub-states';
import { IncomingRequestCard } from './incoming-request-card';
import { OutboundRequestCard } from './outbound-request-card';
import { useRequestCountdown, useUnexpiredRequests } from './use-request-countdown';

type RequestStatusFilter = 'all' | 'sent' | 'received';

const STATUS_OPTIONS: HubFilterOption<RequestStatusFilter>[] = [
  { value: 'all', label: 'Any status' },
  { value: 'sent', label: 'Awaiting response' },
  { value: 'received', label: 'Received' },
];

/**
 * Both halves of your request traffic, split the way the design does: the one request you have
 * sent under "Sent", and every unexpired request pointed at you under "Received". A received
 * request lives here for its full 25-minute lifetime — dismissing the popup with "Not now" leaves
 * it untouched, so this is where you come back to it.
 *
 * The server already filters out offline requesters and blocked users, so this tab only owns
 * presentation plus narrowing. (Requests carry no topics — the topic facet is a Claims/Matches
 * concern, so the design's third menu has nothing to offer here.)
 */
export function RequestsTab() {
  const [spaceId, setSpaceId] = React.useState<string | null>(null);
  const [status, setStatus] = React.useState<RequestStatusFilter>('all');

  const requestsQuery = useDebateRequests(true);
  const { data: activity } = useDebateActivity(true);

  const incoming = useUnexpiredRequests(requestsQuery.data?.incoming ?? []);
  const outbound = requestsQuery.data?.outbound ?? activity?.outbound_request ?? null;

  const inSpace = React.useCallback((requestSpaceId: string) => !spaceId || requestSpaceId === spaceId, [spaceId]);

  const received = React.useMemo(
    () => (status === 'sent' ? [] : incoming.filter(request => inSpace(request.claim.space_id))),
    [inSpace, incoming, status]
  );
  const sent = status === 'received' || !outbound || !inSpace(outbound.claim.space_id) ? null : outbound;

  const facetSpaceIds = React.useMemo(
    () => [...new Set([...(outbound ? [outbound.claim.space_id] : []), ...incoming.map(r => r.claim.space_id)])],
    [incoming, outbound]
  );

  // The claimless challenge sits alongside claim requests: it expires the same way, and "Not now"
  // in its popup leaves it here rather than answering it.
  const reportedChallenge = activity?.challenge?.status === 'pending' ? activity.challenge : null;
  const liveChallenges = useUnexpiredRequests(
    React.useMemo(() => (reportedChallenge ? [reportedChallenge] : []), [reportedChallenge])
  );
  const challenge = liveChallenges[0] ?? null;
  const currentUserId = useCurrentGeoChatUserId();
  // A claimless challenge belongs to no space, so a space filter can only hide it. Role is left
  // undecided until the viewer's id is known — guessing files an incoming challenge under Sent,
  // where it reads as something the viewer sent and offers them "Cancel request" for it.
  const challengeRole =
    !challenge || spaceId || !currentUserId
      ? null
      : challenge.recipient.user_id === currentUserId
        ? 'recipient'
        : 'requester';
  const incomingChallenge = challengeRole === 'recipient' && status !== 'sent' ? challenge : null;
  const outgoingChallenge = challengeRole === 'requester' && status !== 'received' ? challenge : null;

  const hasFilters = Boolean(spaceId) || status !== 'all';
  const isEmpty = !sent && !outgoingChallenge && received.length === 0 && !incomingChallenge;

  return (
    <div className="flex flex-col gap-3 px-4 py-3">
      <SpaceTopicFilters
        spaceId={spaceId}
        onSpaceChange={setSpaceId}
        facetSpaceIds={facetSpaceIds}
        leading={
          <HubFilterMenu
            label={STATUS_OPTIONS.find(option => option.value === status)?.label ?? 'Any status'}
            options={STATUS_OPTIONS}
            value={status}
            onChange={setStatus}
          />
        }
      />

      <HubQueryState
        isLoading={requestsQuery.isLoading}
        error={requestsQuery.error}
        onRetry={() => void requestsQuery.refetch()}
        isEmpty={isEmpty}
        emptyMessage={
          hasFilters ? 'No requests match these filters.' : 'Any debate requests you’ll receive will appear here.'
        }
        emptyAction={
          hasFilters
            ? {
                label: 'Clear filters',
                onClick: () => {
                  setSpaceId(null);
                  setStatus('all');
                },
              }
            : undefined
        }
      >
        <div className="flex flex-col gap-4">
          {sent || outgoingChallenge ? (
            <RequestSection label="Sent">
              <div className="flex flex-col gap-2">
                {outgoingChallenge ? <ChallengeCard challenge={outgoingChallenge} role="requester" /> : null}
                <HubCardList>{sent ? <OutboundRequestCard key={sent.id} request={sent} /> : null}</HubCardList>
              </div>
            </RequestSection>
          ) : null}

          {incomingChallenge || received.length > 0 ? (
            <RequestSection label="Received">
              <div className="flex flex-col gap-2">
                {incomingChallenge ? <ChallengeCard challenge={incomingChallenge} role="recipient" /> : null}
                <HubCardList>
                  {received.map(request => (
                    <IncomingRequestCard key={request.id} request={request} />
                  ))}
                </HubCardList>
              </div>
            </RequestSection>
          ) : null}
        </div>
      </HubQueryState>
    </div>
  );
}

function RequestSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <Text as="h3" variant="footnote" color="grey-04">
        {label}
      </Text>
      {children}
    </section>
  );
}

/**
 * A claimless challenge has no claim to take a side on, so accepting opens a session where both
 * people pick one together — which is what "Explore claims" does here, exactly as in the popup.
 * Switching the hub to the Claims tab would leave the challenge unanswered.
 *
 * "Dismiss" for the same reason as `IncomingRequestCard`: this rejects the challenge outright,
 * while the popup's "Not now" only closes the popup and leaves it here.
 */
function ChallengeCard({ challenge, role }: { challenge: DebateChallenge; role: 'recipient' | 'requester' }) {
  const acceptChallenge = useAcceptDebateChallenge();
  const rejectChallenge = useRejectDebateChallenge();
  const countdown = useRequestCountdown(challenge.expires_at);

  const isRecipient = role === 'recipient';
  const other = isRecipient ? challenge.requester : challenge.recipient;
  const busy = acceptChallenge.isPending || rejectChallenge.isPending;
  // Both roles act from this card and neither could report a failure before: the sender has no
  // popup left to carry one, and the recipient's Dismiss/Explore claims live here as well as in
  // theirs. Each `useMutation` call owns its own state, so only the action this card actually
  // offers can ever set this.
  const actionError = acceptChallenge.error ?? rejectChallenge.error;

  return (
    <article className="flex flex-col gap-3 rounded-lg border border-grey-02 bg-white p-3">
      <div className="flex items-center justify-between gap-2">
        <Text as="span" variant="footnoteMedium" color="grey-04" className="truncate">
          {isRecipient ? 'Someone wants to debate you' : 'Waiting for a reply'}
        </Text>
        <span className="flex shrink-0 items-center gap-1 text-footnote text-text">
          <Time />
          {countdown.label}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <span className="h-6 w-6 shrink-0 overflow-hidden rounded-full">
          <Avatar avatarUrl={other.avatar_cid} value={other.profile_space_id} size={24} />
        </span>
        <Text as="span" variant="metadataMedium" className="truncate">
          {speakerLabel(other)}
        </Text>
      </div>

      {isRecipient ? (
        <div className="grid grid-cols-2 gap-2">
          <HubPillButton
            onClick={() => rejectChallenge.mutate(challenge.id)}
            disabled={busy}
            pending={rejectChallenge.isPending}
            pendingLabel="Dismissing…"
          >
            Dismiss
          </HubPillButton>
          <HubPillButton
            variant="primary"
            onClick={() => acceptChallenge.mutate(challenge.id)}
            disabled={busy}
            pending={acceptChallenge.isPending}
            pendingLabel="Opening…"
          >
            Explore claims
          </HubPillButton>
        </div>
      ) : (
        <HubPillButton
          onClick={() => rejectChallenge.mutate(challenge.id)}
          disabled={busy}
          pending={rejectChallenge.isPending}
          pendingLabel="Cancelling…"
          className="w-full"
        >
          Cancel request
        </HubPillButton>
      )}

      {actionError instanceof Error ? (
        // role="alert" so a failed action is announced, not just drawn under the button.
        <div role="alert">
          <Text as="p" variant="footnote" color="red-01">
            {actionError.message}
          </Text>
        </div>
      ) : null}
    </article>
  );
}
