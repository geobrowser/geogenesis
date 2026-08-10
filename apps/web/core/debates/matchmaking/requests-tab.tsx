'use client';

import * as React from 'react';

import { Avatar } from '~/design-system/avatar';

import { getCurrentGeoChatUserId } from '../api';
import { useDebateActivity, useRejectDebateChallenge } from '../hooks';
import { speakerLabel } from '../playback-utils';
import { SpaceTopicFilters } from './claims-tab';
import { useDebateRequests } from './hooks';
import { HubQueryState } from './hub-states';
import { IncomingRequestCard } from './incoming-request-card';
import { OutboundRequestCard } from './outbound-request-card';
import { useUnexpiredRequests } from './use-request-countdown';
import type { DebatesHubTab } from '~/atoms';

type Props = {
  onTabChange: (tab: DebatesHubTab) => void;
};

/**
 * Every unexpired request pointed at you. The server already filters out offline requesters and
 * blocked users, so this tab only owns presentation plus space narrowing. (Requests carry no
 * topics — topic filtering is a Claims/Matches concern.)
 */
export function RequestsTab({ onTabChange }: Props) {
  const [spaceId, setSpaceId] = React.useState<string | null>(null);

  const requestsQuery = useDebateRequests(true);
  const { data: activity } = useDebateActivity(true);

  const incoming = useUnexpiredRequests(requestsQuery.data?.incoming ?? []);
  const outbound = requestsQuery.data?.outbound ?? activity?.outbound_request ?? null;

  const filtered = React.useMemo(
    () => incoming.filter(request => !spaceId || request.claim.space_id === spaceId),
    [incoming, spaceId]
  );

  const facetSpaceIds = React.useMemo(() => [...new Set(incoming.map(request => request.claim.space_id))], [incoming]);

  const challenge = activity?.challenge?.status === 'pending' ? activity.challenge : null;
  const currentUserId = getCurrentGeoChatUserId();
  const incomingChallenge = challenge && challenge.recipient.user_id === currentUserId ? challenge : null;

  return (
    <div className="flex flex-col gap-3 px-4 py-3">
      <SpaceTopicFilters spaceId={spaceId} onSpaceChange={setSpaceId} facetSpaceIds={facetSpaceIds} />

      {outbound ? <OutboundRequestCard request={outbound} /> : null}

      <HubQueryState
        isLoading={requestsQuery.isLoading}
        error={requestsQuery.error}
        isEmpty={filtered.length === 0 && !incomingChallenge}
        emptyMessage="No debate requests right now."
      >
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
          {filtered.map(request => (
            <IncomingRequestCard key={request.id} request={request} />
          ))}
        </div>
      </HubQueryState>
    </div>
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
      <p className="mb-2 text-footnoteMedium text-grey-04">Someone wants to debate you</p>
      <div className="mb-3 flex items-center gap-2">
        <span className="h-6 w-6 shrink-0 overflow-hidden rounded-full">
          <Avatar avatarUrl={avatarUrl} value={avatarValue} size={24} />
        </span>
        <span className="truncate text-metadataMedium">{requesterName}</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => rejectChallenge.mutate(challengeId)}
          disabled={rejectChallenge.isPending}
          className="h-8 rounded-full border border-grey-02 text-metadata transition-colors hover:bg-grey-01 disabled:opacity-50"
        >
          Dismiss
        </button>
        <button
          type="button"
          onClick={onExploreClaims}
          className="h-8 rounded-full bg-text text-metadata text-white transition-colors hover:bg-text/90"
        >
          Explore claims
        </button>
      </div>
    </article>
  );
}
