'use client';

import * as React from 'react';

import { usePeerAvailabilityEnabled } from '~/core/state/feature-flags';

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
import { type ScheduledContent, ScheduledDebatesSection, useScheduledContent } from './scheduled-debates-section';
import { countBy, orderFacetOptions, toggleId } from './topic-facets';
import { useDebateChallengeState } from './use-outbound-debate-challenge';
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
  // The flag that lets anyone book one. Split rather than branched inside, so a viewer who cannot
  // schedule mounts none of the scheduling reads (GEO-2938, GEO-2940).
  return usePeerAvailabilityEnabled() ? (
    <ScheduledRequestsTab />
  ) : (
    <RequestsTabBody scheduled={NO_SCHEDULED} schedulingEnabled={false} />
  );
}

const NO_SCHEDULED: ScheduledContent = { answerable: [], upcoming: [], requestsError: null, roomsError: null };

function ScheduledRequestsTab() {
  return <RequestsTabBody scheduled={useScheduledContent(true)} schedulingEnabled />;
}

function RequestsTabBody({
  scheduled,
  schedulingEnabled,
}: {
  scheduled: ScheduledContent;
  schedulingEnabled: boolean;
}) {
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
  //
  // Counted under the status filter, not across both directions. A count has to describe what
  // picking the option would leave, and status is one of the filters that decides that — so with
  // "Awaiting response" showing, a space that only appears in received requests would otherwise
  // carry a number over a list it cannot fill.
  const facetSpaces = React.useMemo(() => {
    const spaces = [
      ...(outbound && status !== 'received' ? [outbound.claim.space_id] : []),
      ...(status === 'sent' ? [] : incoming.map(request => request.claim.space_id)),
    ];
    return orderFacetOptions(countBy(spaces.map(id => ({ id, name: null }))), spaceIds);
  }, [incoming, outbound, spaceIds, status]);

  const currentUserId = useCurrentGeoChatUserId();
  const { challenge, challengeRole, outboundChallenge } = useDebateChallengeState(activity, currentUserId);
  // A claimless challenge belongs to no space, so a space filter can only hide it. Role is left
  // undecided until the viewer's id is known — guessing files an incoming challenge under Sent,
  // where it reads as something the viewer sent and offers them "Cancel request" for it.
  const challengeHiddenBySpace = spaceIds.length > 0;
  const incomingChallenge =
    !challengeHiddenBySpace && challengeRole === 'recipient' && status !== 'sent' ? challenge : null;
  const outgoingChallenge = challengeHiddenBySpace || status === 'received' ? null : outboundChallenge;

  const hasFilters = spaceIds.length > 0 || status !== 'all';
  const hasScheduled =
    scheduled.answerable.length > 0 ||
    scheduled.upcoming.length > 0 ||
    scheduled.requestsError !== null ||
    scheduled.roomsError !== null;
  const isEmpty = !sent && !outgoingChallenge && received.length === 0 && !incomingChallenge && !hasScheduled;

  return (
    <div className="flex flex-col">
      <HubStickyControls>
        <SpaceTopicFilters
          analyticsSurface="hub"
          spaceIds={spaceIds}
          onSpaceToggle={id => setSpaceIds(current => toggleId(current, id))}
          onSpacesClear={() => setSpaceIds([])}
          facetSpaces={facetSpaces}
          leading={
            <HubFilterMenu
              label={STATUS_OPTIONS.find(option => option.value === status)?.label ?? 'Any status'}
              analytics={{ name: 'Status', surface: 'hub' }}
              options={STATUS_OPTIONS}
              value={status}
              onChange={setStatus}
            />
          }
        />
      </HubStickyControls>

      <div className="flex flex-col gap-3 px-4 py-3">
        {/* Outside `HubQueryState`, which reports the instant-requests query: a debate that is due
            must not vanish because an unrelated read failed. */}
        {schedulingEnabled && <ScheduledDebatesSection content={scheduled} />}

        <HubQueryState
          analyticsSurface="hub"
          isLoading={requestsQuery.isLoading}
          error={requestsQuery.error}
          failureReason={requestsQuery.failureReason}
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
