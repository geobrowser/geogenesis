'use client';

import * as React from 'react';

import cx from 'classnames';

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
import { RequestSection } from './request-section';
import { ScheduledDebatesSection, useScheduledContent } from './scheduled-debates-section';
import { countBy, orderFacetOptions, toggleId } from './topic-facets';
import { useLiveRequest, useUnexpiredRequests } from './use-request-countdown';

type RequestStatusFilter = 'all' | 'sent' | 'received';

const STATUS_OPTIONS: HubFilterOption<RequestStatusFilter>[] = [
  { value: 'all', label: 'Any status' },
  { value: 'sent', label: 'Awaiting response' },
  { value: 'received', label: 'Received' },
];

/**
 * Sent + received requests (received stays for the full ~25m lifetime after "Not now").
 * Server already drops offline/blocked; this tab is presentation and space/status narrowing.
 *
 * `dense` (live rail): no sticky filters — three stickies stacked would overlap, and a rail
 * has no room for full-tab chrome. No heading or outer padding either: each section below names
 * itself, and the rail spaces its sections the way the facet rail opposite does.
 */
export function RequestsTab({ dense = false }: { dense?: boolean } = {}) {
  const scheduled = useScheduledContent();
  const [spaceIds, setSpaceIds] = React.useState<string[]>([]);
  const [status, setStatus] = React.useState<RequestStatusFilter>('all');

  const requestsQuery = useDebateRequests(true);
  const { data: activity } = useDebateActivity(true);

  const incoming = useUnexpiredRequests(requestsQuery.data?.incoming ?? []);
  // Through the same expiry filter as the received side, so a lapsed request leaves at its expiry
  // rather than sitting on an "Expired" card until the server says so.
  const outbound = useLiveRequest(requestsQuery.data?.outbound ?? activity?.outbound_request);

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

  // The claimless challenge sits alongside claim requests: it expires the same way, and "Not now"
  // in its popup leaves it here rather than answering it.
  const challenge = useLiveRequest(activity?.challenge);
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
  const hasScheduled =
    scheduled.answerable.length > 0 ||
    scheduled.upcoming.length > 0 ||
    scheduled.requestsError !== null ||
    scheduled.roomsError !== null;
  const hasRequests = Boolean(sent || outgoingChallenge || received.length > 0 || incomingChallenge);
  const isEmpty = !hasRequests && !hasScheduled;

  if (dense && isEmpty) return null;

  return (
    <div className="flex flex-col">
      {!dense && (
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
      )}

      <div className={cx('flex flex-col gap-3 px-4', !dense && 'py-3')}>
        {/* Outside `HubQueryState`, which reports the instant-requests query: a debate that is due
            must not vanish because an unrelated read failed. */}
        <ScheduledDebatesSection content={scheduled} />

        {/* Dense with only scheduled debates to show, the requests list would be an empty box that
            still takes a gap below them. */}
        {dense && !hasRequests && !requestsQuery.isLoading && !requestsQuery.error ? null : (
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
        )}
      </div>
    </div>
  );
}
