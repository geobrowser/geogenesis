'use client';

import * as React from 'react';

import { useAtom } from 'jotai';

import type { MatchmakingMatch } from '../api';
import { useDebateActivity } from '../hooks';
import { HubStickyControls, SpaceTopicFilters } from './claims-tab';
import { DebateHoursNote } from './debate-hours-note';
import { useDebateRequests, useMatchmakingMatches } from './hooks';
import { HubCardList } from './hub-motion';
import { HubQueryState } from './hub-states';
import { MatchmakingClaimCard } from './matchmaking-claim-card';
import { OutboundRequestCard } from './outbound-request-card';
import { countBy, keepSelectedVisible, orderFacetOptions, toggleId } from './topic-facets';
import { useStableListOrder } from './use-stable-list-order';
import { type DebatesHubTab, debatesHubMatchesSpaceIdsAtom } from '~/atoms';

/**
 * Claims where you're ready to debate and someone holding the opposite response is online and
 * ready too. Requesting sends to whoever has been online longest; the server advances to the next
 * candidate if they pass, so this tab never has to pick a person.
 *
 * Topics are Knowledge Graph data geo-chat doesn't model — `match.topics` is always empty, so this
 * tab filters by space only.
 *
 * `dense` (live rail): no chrome; outbound card lives on RequestsTab above to avoid a duplicate.
 */
/** `dense` is the live rail (GEO-2726) — see the note on `RequestsTab`. */
export function MatchesTab({
  onTabChange,
  dense = false,
}: {
  onTabChange?: (tab: DebatesHubTab) => void;
  dense?: boolean;
}) {
  // Session-scoped, like the Claims tab's: the hub closes on an outside pointer-down, so a
  // click-away to dismiss the dropdown unmounted this tab and took the selection with it
  // (GEO-2850).
  const [spaceIds, setSpaceIds] = useAtom(debatesHubMatchesSpaceIdsAtom);

  const matchesQuery = useMatchmakingMatches(true);
  const requestsQuery = useDebateRequests(true);
  const activityQuery = useDebateActivity(true);
  const activity = activityQuery.data;

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
  //
  // A selected space is kept on the menu even once nothing counts towards it, the same way
  // `useSpaceFilterMenu` does it for the Claims tab. The selection outlives this mount now
  // (GEO-2850), so it can outlive the match that put the space on the menu in the first place —
  // the other side goes offline while the panel is closed, and reopening it would otherwise show
  // an empty list filtered by a space with no row left to untick it by.
  const facetSpaces = React.useMemo(
    () =>
      orderFacetOptions(
        keepSelectedVisible(countBy(serverMatches.map(match => ({ id: match.claim.space_id, name: null }))), spaceIds),
        spaceIds
      ),
    [serverMatches, spaceIds]
  );

  const filtered = React.useMemo(
    () => matches.filter(match => spaceIds.length === 0 || spaceIds.includes(match.claim.space_id)),
    [matches, spaceIds]
  );

  // The viewer's own filter emptied a list that has something in it — the one empty state here
  // they can undo, and the one `serverMatches.length === 0` is false for.
  const filteredBySpace = filtered.length === 0 && serverMatches.length > 0;

  return (
    <div className="flex flex-col">
      {/* One pinned header rather than a pinned card above scrolling filters: two stickies would
          both claim `top-0` and overlap, and the outbound card is conditional so the filters
          couldn't be offset by a known height. */}
      {!dense && (
        <HubStickyControls>
          {outbound ? <OutboundRequestCard request={outbound} /> : null}
          <SpaceTopicFilters
            spaceIds={spaceIds}
            onSpaceToggle={id => setSpaceIds(current => toggleId(current, id))}
            onSpacesClear={() => setSpaceIds([])}
            facetSpaces={facetSpaces}
          />
        </HubStickyControls>
      )}

      <div className="flex flex-col gap-3 px-4 py-3">
        <HubQueryState
          // `activity` is a second query, and an empty list cannot be described without it: both
          // the message and the note below say something different depending on whether the viewer
          // has marked themselves unavailable. Whichever request lands second decides what this
          // reads, so with nothing to show the skeleton waits for the answer rather than asserting
          // the wrong one and correcting itself a moment later.
          //
          // Only while empty. A list with rows in it renders on the matches alone, as it always
          // has — nothing above depends on `activity` then.
          isLoading={matchesQuery.isLoading || (filtered.length === 0 && activityQuery.isLoading)}
          error={matchesQuery.error}
          onRetry={() => void matchesQuery.refetch()}
          isEmpty={filtered.length === 0}
          // A match needs three things at once, and the old copy asserted which one was missing
          // without being able to know. Name all of them instead, starting with the half the
          // viewer controls.
          // The space filter comes first because it is the only one of these the viewer can undo in
          // a click — and it survives a close and reopen now (GEO-2850), so a list it emptied would
          // otherwise be blamed on having no positions or on nobody being online.
          emptyMessage={
            filteredBySpace
              ? 'No matches in the spaces you’ve picked.'
              : activity?.available_to_debate === false
                ? 'You’re marked unavailable, so nobody can be matched with you.'
                : 'Matches appear once you’ve taken a position on a claim and someone holding the opposite position is online and ready too.'
          }
          // GEO-2840. Read off `serverMatches` rather than off the space filter: with nothing to
          // match on at all, the filter is not what emptied the list, so the test is whether anyone
          // is there and not whether the viewer has narrowed.
          //
          // Deliberately *not* also gated on the viewer's availability, though the message above
          // branches on it. geo-chat's matches query never reads the viewer's own
          // `available_to_debate` — it walks their readiness rows and drops a claim only when the
          // opposite side has nobody available — so an unavailable viewer's empty list is a
          // nobody-is-online list like anyone else's. Withholding the pointer to debate hours from
          // them left the one explanation they can act on being one that would not change anything.
          // Availability gates *sending a request*, which is where the card already says so.
          //
          // `live` unconditionally: `SIGNED_OUT_TABS` in the panel keeps this tab off the signed-out
          // hub entirely, so every viewer here holds the gateway scope.
          emptyNote={serverMatches.length === 0 ? <DebateHoursNote live /> : undefined}
          // Same label as People's, because it is the same action out of the same dead end. Two
          // names for one button in one panel is a difference that implies something.
          // Clearing the filter is the whole answer when the filter is the cause, and browsing claims
          // cannot be — there are matches, just not in the spaces on screen.
          // Clearing the space picks works anywhere; "Explore claims" does not in the rail, where
          // `onTabChange` is a no-op and the claims list is already on screen beside this.
          emptyAction={
            filteredBySpace
              ? { label: 'Clear filters', onClick: () => setSpaceIds([]) }
              : dense || !onTabChange
                ? undefined
                : { label: 'Explore claims', onClick: () => onTabChange('claims') }
          }
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
