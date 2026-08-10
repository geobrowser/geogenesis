'use client';

import * as React from 'react';

import { Text } from '~/design-system/text';

import type { MatchmakingMatch } from '../api';
import { useDebateActivity } from '../hooks';
import { ClaimReadinessToggle } from './claim-readiness-toggle';
import { SpaceTopicFilters } from './claims-tab';
import { useCreateDebateRequest, useDebateRequests, useMatchmakingMatches } from './hooks';
import { HubCardList } from './hub-motion';
import { HubPillButton } from './hub-pill-button';
import { HubQueryState } from './hub-states';
import { MatchmakingClaimCard } from './matchmaking-claim-card';
import { OutboundRequestCard } from './outbound-request-card';
import { useStableListOrder } from './use-stable-list-order';
import type { DebatesHubTab } from '~/atoms';

/**
 * Claims where you're ready to debate and someone holding the opposite response is online and
 * ready too. Requesting sends to whoever has been online longest; the server advances to the next
 * candidate if they pass, so this tab never has to pick a person.
 *
 * Topics are Knowledge Graph data geo-chat doesn't model — `match.topics` is always empty, so this
 * tab filters by space only.
 */
export function MatchesTab({ onTabChange }: { onTabChange: (tab: DebatesHubTab) => void }) {
  const [spaceId, setSpaceId] = React.useState<string | null>(null);

  const matchesQuery = useMatchmakingMatches(true);
  const requestsQuery = useDebateRequests(true);
  const { data: activity } = useDebateActivity(true);

  const serverMatches = React.useMemo(() => matchesQuery.data?.matches ?? [], [matchesQuery.data]);
  const outbound = requestsQuery.data?.outbound ?? activity?.outbound_request ?? null;

  // Same hold as the Claims tab: standing down from one claim shouldn't reshuffle the rest.
  const matches = useStableListOrder(
    serverMatches,
    match => `${match.claim.space_id}:${match.claim.claim_entity_id}`,
    spaceId ?? ''
  );

  const facetSpaceIds = React.useMemo(
    () => [...new Set(serverMatches.map(match => match.claim.space_id))],
    [serverMatches]
  );

  const filtered = React.useMemo(
    () => matches.filter(match => !spaceId || match.claim.space_id === spaceId),
    [matches, spaceId]
  );

  return (
    <div className="flex flex-col">
      {outbound ? (
        <div className="sticky top-0 z-10 border-b border-grey-02 bg-white px-4 py-3">
          <OutboundRequestCard request={outbound} />
        </div>
      ) : null}

      <div className="flex flex-col gap-3 px-4 py-3">
        <SpaceTopicFilters spaceId={spaceId} onSpaceChange={setSpaceId} facetSpaceIds={facetSpaceIds} />

        <HubQueryState
          isLoading={matchesQuery.isLoading}
          error={matchesQuery.error}
          onRetry={() => void matchesQuery.refetch()}
          isEmpty={filtered.length === 0}
          // Usually the real cause is that the viewer isn't ready on any claim yet, and the fix is
          // one tab away.
          emptyMessage="No one with the opposite response is available yet."
          emptyAction={{ label: 'Browse claims', onClick: () => onTabChange('claims') }}
        >
          <HubCardList>
            {filtered.map(match => (
              <MatchCard
                key={`${match.claim.space_id}:${match.claim.claim_entity_id}`}
                match={match}
                hasOutboundRequest={Boolean(outbound)}
              />
            ))}
          </HubCardList>
        </HubQueryState>
      </div>
    </div>
  );
}

function MatchCard({ match, hasOutboundRequest }: { match: MatchmakingMatch; hasOutboundRequest: boolean }) {
  const createRequest = useCreateDebateRequest();

  const requestError = createRequest.error instanceof Error ? createRequest.error.message : null;

  return (
    <MatchmakingClaimCard
      claim={match.claim}
      positions={match.positions}
      responseKind={match.response_kind}
      viewerResponse={match.viewer_response}
      headerAction={<ClaimReadinessToggle claim={match.claim} readiness={match} />}
      footer={
        <div className="mt-3 flex flex-col gap-1">
          <HubPillButton
            onClick={() =>
              createRequest.mutate({
                space_id: match.claim.space_id,
                claim_entity_id: match.claim.claim_entity_id,
              })
            }
            disabled={hasOutboundRequest}
            pending={createRequest.isPending}
            pendingLabel="Requesting…"
            title={hasOutboundRequest ? 'Withdraw your open request to send another.' : undefined}
            className="w-full"
          >
            Request debate
          </HubPillButton>
          {requestError ? (
            // role="alert" so a failed request is announced, not just drawn under the button.
            <div role="alert">
              <Text as="p" variant="footnote" color="red-01">
                {requestError}
              </Text>
            </div>
          ) : null}
        </div>
      }
    />
  );
}
