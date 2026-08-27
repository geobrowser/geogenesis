'use client';

import * as React from 'react';

import { Text } from '~/design-system/text';

import { useDebateActivity } from '../hooks';
import { useCurrentGeoChatUserId } from '../use-current-geo-chat-user-id';
import { DebateChallengeCard } from './challenge-card';
import { HubStickyControls, SpaceTopicFilters } from './claims-tab';
import { useDebateRequests } from './hooks';
import { HubFilterMenu, type HubFilterOption } from './hub-filter-menu';
import { HubCardList } from './hub-motion';
import { HubQueryState } from './hub-states';
import { IncomingRequestCard } from './incoming-request-card';
import { OutboundRequestCard } from './outbound-request-card';
import { countBy, orderFacetOptions, toggleId } from './topic-facets';
import { useUnexpiredRequests } from './use-request-countdown';

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
  const [spaceIds, setSpaceIds] = React.useState<string[]>([]);
  const [status, setStatus] = React.useState<RequestStatusFilter>('all');

  const requestsQuery = useDebateRequests(true);
  const { data: activity } = useDebateActivity(true);

  const incoming = useUnexpiredRequests(requestsQuery.data?.incoming ?? []);
  const outbound = requestsQuery.data?.outbound ?? activity?.outbound_request ?? null;

  const inSpace = React.useCallback(
    (requestSpaceId: string) => spaceIds.length === 0 || spaceIds.includes(requestSpaceId),
    [spaceIds]
  );

  const received = React.useMemo(
    () => (status === 'sent' ? [] : incoming.filter(request => inSpace(request.claim.space_id))),
    [inSpace, incoming, status]
  );
  const sent = status === 'received' || !outbound || !inSpace(outbound.claim.space_id) ? null : outbound;

  // No server facet here either: the requests in hand are the whole list.
  const facetSpaces = React.useMemo(
    () =>
      orderFacetOptions(
        countBy(
          [...(outbound ? [outbound.claim.space_id] : []), ...incoming.map(r => r.claim.space_id)].map(id => ({
            id,
            name: null,
          }))
        ),
        spaceIds
      ),
    [incoming, outbound, spaceIds]
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
    !challenge || spaceIds.length > 0 || !currentUserId
      ? null
      : challenge.recipient.user_id === currentUserId
        ? 'recipient'
        : 'requester';
  const incomingChallenge = challengeRole === 'recipient' && status !== 'sent' ? challenge : null;
  const outgoingChallenge = challengeRole === 'requester' && status !== 'received' ? challenge : null;

  const hasFilters = spaceIds.length > 0 || status !== 'all';
  const isEmpty = !sent && !outgoingChallenge && received.length === 0 && !incomingChallenge;

  return (
    <div className="flex flex-col">
      <HubStickyControls>
        <SpaceTopicFilters
          spaceIds={spaceIds}
          onSpaceToggle={id => setSpaceIds(current => toggleId(current, id))}
          onSpacesClear={() => setSpaceIds([])}
          facetSpaces={facetSpaces}
          leading={
            <HubFilterMenu
              label={STATUS_OPTIONS.find(option => option.value === status)?.label ?? 'Any status'}
              options={STATUS_OPTIONS}
              value={status}
              onChange={setStatus}
            />
          }
        />
      </HubStickyControls>

      <div className="flex flex-col gap-3 px-4 py-3">
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
                    setSpaceIds([]);
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
                  {outgoingChallenge ? <DebateChallengeCard challenge={outgoingChallenge} role="requester" /> : null}
                  <HubCardList>{sent ? <OutboundRequestCard key={sent.id} request={sent} /> : null}</HubCardList>
                </div>
              </RequestSection>
            ) : null}

            {incomingChallenge || received.length > 0 ? (
              <RequestSection label="Received">
                <div className="flex flex-col gap-2">
                  {incomingChallenge ? <DebateChallengeCard challenge={incomingChallenge} role="recipient" /> : null}
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
