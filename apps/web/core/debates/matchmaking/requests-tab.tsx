'use client';

import { useDebateActivity } from '../hooks';
import { useCurrentGeoChatUserId } from '../use-current-geo-chat-user-id';
import { AvailabilityRequestNotice, useAvailabilityRequests } from './availability-request-notice';
import { DebateChallengeCard } from './challenge-card';
import { useDebateRequests } from './hooks';
import { HubCardList } from './hub-motion';
import { HubQueryState } from './hub-states';
import { IncomingRequestCard } from './incoming-request-card';
import { OutboundRequestCard } from './outbound-request-card';
import { RequestSection } from './request-section';
import { RequestsSchedule } from './requests-schedule';
import { ScheduledDebatesSection, hasScheduledContent, useScheduledContent } from './scheduled-debates-section';
import { useLiveRequest, useUnexpiredRequests } from './use-request-countdown';
import { incomingChallengeFor } from './use-requests-tab-count';

/**
 * The side panel's Requests tab is a schedule (GEO-3463): one timeline by day, with a now-line —
 * see `RequestsSchedule`.
 *
 * `dense` is the full-screen hub's live rail, which keeps the sectioned list below until the
 * full-screen redesign reaches it: no sticky filters — three stickies stacked would overlap, and a
 * rail has no room for full-tab chrome.
 */
export function RequestsTab({
  dense = false,
  focusedRequestId = null,
}: {
  dense?: boolean;
  /** A scheduled request a link asked to see (GEO-3431). Only the hub's own tab passes one. */
  focusedRequestId?: string | null;
} = {}) {
  if (!dense) return <RequestsSchedule focusedRequestId={focusedRequestId} />;
  return <RequestsRail />;
}

/**
 * Sent + received requests (received stays for the full ~25m lifetime after "Not now"), with the
 * scheduled section above them. Server already drops offline/blocked.
 *
 * No heading or outer padding: each section below names itself, and the rail spaces its sections
 * the way the facet rail opposite does. Renders nothing at all when there is nothing to list.
 */
function RequestsRail() {
  const scheduled = useScheduledContent();
  const availabilityRequests = useAvailabilityRequests();

  const requestsQuery = useDebateRequests(true);
  const { data: activity } = useDebateActivity(true);

  const received = useUnexpiredRequests(requestsQuery.data?.incoming ?? []);
  // Through the same expiry filter as the received side, so a lapsed request leaves at its expiry
  // rather than sitting on an "Expired" card until the server says so.
  const sent = useLiveRequest(requestsQuery.data?.outbound ?? activity?.outbound_request);

  // The claimless challenge sits alongside claim requests: it expires the same way, and "Not now"
  // in its popup leaves it here rather than answering it.
  const challenge = useLiveRequest(activity?.challenge);
  const currentUserId = useCurrentGeoChatUserId();
  // Role is left undecided until the viewer's id is known — guessing files an incoming challenge
  // under Sent, where it reads as something the viewer sent and offers them "Cancel request" for it.
  const incomingChallenge = incomingChallengeFor(challenge, currentUserId);
  const outgoingChallenge = challenge && currentUserId && !incomingChallenge ? challenge : null;

  const hasScheduled = hasScheduledContent(scheduled) || availabilityRequests.length > 0;
  const hasRequests = Boolean(sent || outgoingChallenge || received.length > 0 || incomingChallenge);
  const isEmpty = !hasRequests && !hasScheduled;

  if (isEmpty) return null;

  return (
    <div className="flex flex-col">
      <div className="flex flex-col gap-3 px-4">
        {/* Outside `HubQueryState`, which reports the instant-requests query: a debate that is due
            must not vanish because an unrelated read failed. */}
        <AvailabilityRequestNotice requests={availabilityRequests} />
        <ScheduledDebatesSection content={scheduled} />

        {/* With only scheduled debates to show, the requests list would be an empty box that still
            takes a gap below them. */}
        {!hasRequests && !requestsQuery.isLoading && !requestsQuery.error ? null : (
          <HubQueryState
            analyticsSurface="hub"
            isLoading={requestsQuery.isLoading}
            error={requestsQuery.error}
            failureReason={requestsQuery.failureReason}
            onRetry={() => void requestsQuery.refetch()}
            isEmpty={isEmpty}
            emptyMessage="Any debate requests you’ll receive will appear here."
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
