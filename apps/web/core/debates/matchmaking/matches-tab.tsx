'use client';

import * as React from 'react';

import cx from 'classnames';

import type { MatchmakingMatch } from '../api';
import { useDebateActivity } from '../hooks';
import { SpaceTopicFilters } from './claims-tab';
import { useClearDebateIntent, useCreateDebateRequest, useDebateRequests, useMatchmakingMatches } from './hooks';
import { HubQueryState } from './hub-states';
import { MatchmakingClaimCard } from './matchmaking-claim-card';
import { OutboundRequestCard } from './outbound-request-card';

/**
 * Claims where you've set a position and someone holding the opposite one is online and ready.
 * Requesting sends to whoever has been waiting longest; the server advances to the next candidate
 * if they pass, so this tab never has to pick a person.
 */
export function MatchesTab() {
  const [spaceId, setSpaceId] = React.useState<string | null>(null);
  const [topicId, setTopicId] = React.useState<string | null>(null);

  const matchesQuery = useMatchmakingMatches(true);
  const requestsQuery = useDebateRequests(true);
  const { data: activity } = useDebateActivity(true);

  const matches = matchesQuery.data?.matches ?? [];
  const outbound = requestsQuery.data?.outbound ?? activity?.outbound_request ?? null;

  const facetSpaceIds = React.useMemo(() => [...new Set(matches.map(match => match.claim.space_id))], [matches]);
  const facetTopics = React.useMemo(() => {
    const topics = new Map<string, { id: string; name: string | null }>();
    for (const match of matches) {
      for (const topic of match.topics) topics.set(topic.id, topic);
    }
    return [...topics.values()];
  }, [matches]);

  const filtered = React.useMemo(
    () =>
      matches.filter(match => {
        if (spaceId && match.claim.space_id !== spaceId) return false;
        if (topicId && !match.topics.some(topic => topic.id === topicId)) return false;
        return true;
      }),
    [matches, spaceId, topicId]
  );

  return (
    <div className="flex flex-col">
      {outbound ? (
        <div className="sticky top-0 z-10 bg-white px-4 pt-3 pb-2">
          <OutboundRequestCard request={outbound} />
        </div>
      ) : null}

      <div className="flex flex-col gap-3 px-4 py-3">
        <SpaceTopicFilters
          spaceId={spaceId}
          onSpaceChange={setSpaceId}
          topicId={topicId}
          onTopicChange={setTopicId}
          facetSpaceIds={facetSpaceIds}
          facetTopics={facetTopics}
        />

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
  const clearIntent = useClearDebateIntent();

  const requestError = createRequest.error instanceof Error ? createRequest.error.message : null;

  return (
    <MatchmakingClaimCard
      claim={match.claim}
      positions={match.positions}
      viewerPosition={match.viewer_position}
      headerAction={
        <IntentToggle
          onToggle={() => clearIntent.mutate({ spaceId: match.claim.space_id, claimId: match.claim.claim_entity_id })}
          disabled={clearIntent.isPending}
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
 * Turning the toggle off clears the position entirely, which is what removes the claim from
 * matchmaking — there is no separate "position set but not debating" state.
 */
function IntentToggle({ onToggle, disabled }: { onToggle: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked
      aria-label="Debate this claim"
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
