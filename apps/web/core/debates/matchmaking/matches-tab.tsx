'use client';

import * as React from 'react';

import type { MatchmakingMatch } from '../api';
import { useDebateActivity } from '../hooks';
import { ClaimReadinessToggle } from './claim-readiness-toggle';
import { SpaceTopicFilters } from './claims-tab';
import { useCreateDebateRequest, useDebateRequests, useMatchmakingMatches } from './hooks';
import { HubQueryState } from './hub-states';
import { MatchmakingClaimCard } from './matchmaking-claim-card';
import { OutboundRequestCard } from './outbound-request-card';

/**
 * Claims where you're ready to debate and someone holding the opposite response is online and
 * ready too. Requesting sends to whoever has been online longest; the server advances to the next
 * candidate if they pass, so this tab never has to pick a person.
 *
 * Topics are Knowledge Graph data geo-chat doesn't model — `match.topics` is always empty, so this
 * tab filters by space only.
 */
export function MatchesTab() {
  const [spaceId, setSpaceId] = React.useState<string | null>(null);

  const matchesQuery = useMatchmakingMatches(true);
  const requestsQuery = useDebateRequests(true);
  const { data: activity } = useDebateActivity(true);

  const matches = matchesQuery.data?.matches ?? [];
  const outbound = requestsQuery.data?.outbound ?? activity?.outbound_request ?? null;

  const facetSpaceIds = React.useMemo(() => [...new Set(matches.map(match => match.claim.space_id))], [matches]);

  const filtered = React.useMemo(
    () => matches.filter(match => !spaceId || match.claim.space_id === spaceId),
    [matches, spaceId]
  );

  return (
    <div className="flex flex-col">
      {outbound ? (
        <div className="sticky top-0 z-10 bg-white px-4 pt-3 pb-2">
          <OutboundRequestCard request={outbound} />
        </div>
      ) : null}

      <div className="flex flex-col gap-3 px-4 py-3">
        <SpaceTopicFilters spaceId={spaceId} onSpaceChange={setSpaceId} facetSpaceIds={facetSpaceIds} />

        <HubQueryState
          isLoading={matchesQuery.isLoading}
          error={matchesQuery.error}
          isEmpty={filtered.length === 0}
          emptyMessage="No one with the opposite position is available yet."
        >
          <div className="flex flex-col gap-2">
            {filtered.map(match => (
              <MatchCard
                key={`${match.claim.space_id}:${match.claim.claim_entity_id}`}
                match={match}
                hasOutboundRequest={Boolean(outbound)}
              />
            ))}
          </div>
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
        <>
          <button
            type="button"
            onClick={() =>
              createRequest.mutate({
                space_id: match.claim.space_id,
                claim_entity_id: match.claim.claim_entity_id,
              })
            }
            disabled={hasOutboundRequest || createRequest.isPending}
            className="mt-2 h-8 w-full rounded-full bg-bg text-metadata text-text transition-colors hover:bg-grey-01 disabled:opacity-50"
          >
            {createRequest.isPending ? 'Requesting...' : 'Request debate'}
          </button>
          {requestError ? <p className="mt-1 text-footnote text-red-01">{requestError}</p> : null}
        </>
      }
    />
  );
}
