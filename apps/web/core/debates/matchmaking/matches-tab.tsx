'use client';

import * as React from 'react';

import cx from 'classnames';

import type { MatchmakingMatch } from '../api';
import { useDebateActivity } from '../hooks';
import { SpaceTopicFilters } from './claims-tab';
import { useClaimReadiness, useCreateDebateRequest, useDebateRequests, useMatchmakingMatches } from './hooks';
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
  const readiness = useClaimReadiness();

  const requestError = createRequest.error instanceof Error ? createRequest.error.message : null;

  return (
    <MatchmakingClaimCard
      claim={match.claim}
      positions={match.positions}
      viewerPosition={match.viewer_position}
      headerAction={
        <ReadinessToggle
          onToggle={() =>
            readiness.mutate({
              spaceId: match.claim.space_id,
              claimId: match.claim.claim_entity_id,
              ready: false,
            })
          }
          disabled={readiness.isPending}
        />
      }
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

/**
 * Turning this off stands you down from the claim — your on-chain response stays, but you leave
 * matchmaking for it. Turning it back on happens on the claim itself, where the response lives.
 */
function ReadinessToggle({ onToggle, disabled }: { onToggle: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked
      aria-label="Ready to debate this claim"
      disabled={disabled}
      onClick={onToggle}
      className="flex shrink-0 items-center gap-1.5 text-footnote text-grey-04 transition-colors hover:text-text disabled:opacity-50"
    >
      <span aria-hidden className={cx('relative h-4 w-6 shrink-0 rounded-full bg-text')}>
        <span className="absolute top-0.5 left-0.5 h-3 w-3 translate-x-2 rounded-full bg-white transition-transform" />
      </span>
      Debate
    </button>
  );
}
