'use client';

import * as React from 'react';

import type { MatchmakingMatch } from '../api';
import { useDebateActivity } from '../hooks';
import { HubStickyControls, SpaceTopicFilters } from './claims-tab';
import { useDebateRequests, useMatchmakingMatches } from './hooks';
import { HubCardList, HubPinnedSlot } from './hub-motion';
import { HubQueryState } from './hub-states';
import { MatchmakingClaimCard } from './matchmaking-claim-card';
import { OutboundRequestCard } from './outbound-request-card';
import { countBy, orderFacetOptions, toggleId } from './topic-facets';
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
  const [spaceIds, setSpaceIds] = React.useState<string[]>([]);

  const matchesQuery = useMatchmakingMatches(true);
  const requestsQuery = useDebateRequests(true);
  const { data: activity } = useDebateActivity(true);

  const serverMatches = React.useMemo(() => matchesQuery.data?.matches ?? [], [matchesQuery.data]);
  const outbound = requestsQuery.data?.outbound ?? activity?.outbound_request ?? null;

  // Same hold as the Claims tab: standing down from one claim shouldn't reshuffle the rest.
  const matches = useStableListOrder(
    serverMatches,
    match => `${match.claim.space_id}:${match.claim.claim_entity_id}`,
    spaceIds.join(',')
  );

  // Counted from the matches themselves — this tab has no server facet, and the whole list is in
  // hand, so the rows are the complete answer.
  const facetSpaces = React.useMemo(
    () => orderFacetOptions(countBy(serverMatches.map(match => ({ id: match.claim.space_id, name: null }))), spaceIds),
    [serverMatches, spaceIds]
  );

  const filtered = React.useMemo(
    () => matches.filter(match => spaceIds.length === 0 || spaceIds.includes(match.claim.space_id)),
    [matches, spaceIds]
  );

  return (
    <div className="flex flex-col">
      {/* One pinned header rather than a pinned card above scrolling filters: two stickies would
          both claim `top-0` and overlap, and the outbound card is conditional so the filters
          couldn't be offset by a known height. */}
      <HubStickyControls>
        <HubPinnedSlot>{outbound ? <OutboundRequestCard request={outbound} /> : null}</HubPinnedSlot>
        <SpaceTopicFilters
          spaceIds={spaceIds}
          onSpaceToggle={id => setSpaceIds(current => toggleId(current, id))}
          onSpacesClear={() => setSpaceIds([])}
          facetSpaces={facetSpaces}
        />
      </HubStickyControls>

      <div className="flex flex-col gap-3 px-4 py-3">
        <HubQueryState
          isLoading={matchesQuery.isLoading}
          error={matchesQuery.error}
          onRetry={() => void matchesQuery.refetch()}
          isEmpty={filtered.length === 0}
          // A match needs three things at once, and the old copy asserted which one was missing
          // without being able to know. Name all of them instead, starting with the half the
          // viewer controls.
          emptyMessage={
            activity?.available_to_debate === false
              ? 'You’re marked unavailable, so nobody can be matched with you.'
              : 'Matches appear once you’ve taken a position on a claim and someone holding the opposite position is online and ready too.'
          }
          emptyAction={{ label: 'Browse claims', onClick: () => onTabChange('claims') }}
        >
          <HubCardList>
            {filtered.map(match => (
              <MatchCard key={`${match.claim.space_id}:${match.claim.claim_entity_id}`} match={match} />
            ))}
          </HubCardList>
        </HubQueryState>
      </div>
    </div>
  );
}

function MatchCard({ match, ref }: { match: MatchmakingMatch; ref?: React.Ref<HTMLElement> }) {
  // No footer. The card's end slot offers the debate now — same match lookup, same
  // `useCreateDebateRequest`, same blocked reasons — and this tab was drawing a second button for
  // it a few pixels below the first. Every card here is a match by definition, so the slot is
  // always filled and the tab loses nothing by not asking twice.
  return <MatchmakingClaimCard ref={ref} claim={match.claim} positions={match.positions} readiness={match} />;
}
