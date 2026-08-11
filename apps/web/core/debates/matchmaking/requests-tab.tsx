'use client';

import * as React from 'react';

import { Avatar } from '~/design-system/avatar';
import { Text } from '~/design-system/text';

import { getCurrentGeoChatUserId } from '../api';
import { useDebateActivity, useRejectDebateChallenge } from '../hooks';
import { speakerLabel } from '../playback-utils';
import { SpaceTopicFilters } from './claims-tab';
import { useDebateRequests } from './hooks';
import { HubFilterMenu, type HubFilterOption } from './hub-filter-menu';
import { HubCardList } from './hub-motion';
import { HubPillButton } from './hub-pill-button';
import { HubQueryState } from './hub-states';
import { IncomingRequestCard } from './incoming-request-card';
import { OutboundRequestCard } from './outbound-request-card';
import { useUnexpiredRequests } from './use-request-countdown';
import type { DebatesHubTab } from '~/atoms';

type RequestStatusFilter = 'all' | 'sent' | 'received';

const STATUS_OPTIONS: HubFilterOption<RequestStatusFilter>[] = [
  { value: 'all', label: 'Any status' },
  { value: 'sent', label: 'Awaiting response' },
  { value: 'received', label: 'Received' },
];

type Props = {
  onTabChange: (tab: DebatesHubTab) => void;
};

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
export function RequestsTab({ onTabChange }: Props) {
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

  const challenge = activity?.challenge?.status === 'pending' ? activity.challenge : null;
  const currentUserId = getCurrentGeoChatUserId();
  // A claimless challenge belongs to no space, so a space filter can only hide it.
  const incomingChallenge =
    challenge && challenge.recipient.user_id === currentUserId && status !== 'sent' && !spaceId ? challenge : null;

  const hasFilters = Boolean(spaceId) || status !== 'all';
  const isEmpty = !sent && received.length === 0 && !incomingChallenge;

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
          {sent ? (
            <RequestSection label="Sent">
              <HubCardList>
                <OutboundRequestCard key={sent.id} request={sent} />
              </HubCardList>
            </RequestSection>
          ) : null}

          {incomingChallenge || received.length > 0 ? (
            <RequestSection label="Received">
              <div className="flex flex-col gap-2">
                {incomingChallenge ? (
                  <ChallengeCard
                    requesterName={speakerLabel(incomingChallenge.requester)}
                    avatarUrl={incomingChallenge.requester.avatar_cid}
                    avatarValue={incomingChallenge.requester.profile_space_id}
                    challengeId={incomingChallenge.id}
                    onExploreClaims={() => onTabChange('claims')}
                  />
                ) : null}
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
 * Claimless challenges have no claim to accept a side on, so accepting means picking one together
 * — which is what the Claims tab is for.
 */
function ChallengeCard({
  requesterName,
  avatarUrl,
  avatarValue,
  challengeId,
  onExploreClaims,
}: {
  requesterName: string;
  avatarUrl: string | null;
  avatarValue: string;
  challengeId: string;
  onExploreClaims: () => void;
}) {
  const rejectChallenge = useRejectDebateChallenge();

  return (
    <article className="rounded-lg border border-grey-02 bg-white p-3">
      <Text as="p" variant="footnoteMedium" color="grey-04" className="mb-2">
        Someone wants to debate you
      </Text>
      <div className="mb-3 flex items-center gap-2">
        <span className="h-6 w-6 shrink-0 overflow-hidden rounded-full">
          <Avatar avatarUrl={avatarUrl} value={avatarValue} size={24} />
        </span>
        <Text as="span" variant="metadataMedium" className="truncate">
          {requesterName}
        </Text>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <HubPillButton
          onClick={() => rejectChallenge.mutate(challengeId)}
          pending={rejectChallenge.isPending}
          pendingLabel="Dismissing…"
        >
          Dismiss
        </HubPillButton>
        <HubPillButton variant="primary" onClick={onExploreClaims}>
          Explore claims
        </HubPillButton>
      </div>
    </article>
  );
}
