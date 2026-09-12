'use client';

import * as React from 'react';

import { useAtom } from 'jotai';

import { Input } from '~/design-system/input';

import type { MatchmakingMatch } from '../api';
import { useClaimEntitiesByIds } from '../claim-picker-page';
import { useDebateActivity } from '../hooks';
import { HubStickyControls, SpaceTopicFilters } from './claims-tab';
import { DebateHoursNote } from './debate-hours-note';
import { useDebateRequests, useMatchmakingMatches } from './hooks';
import { HubCardList } from './hub-motion';
import { HubQueryState } from './hub-states';
import { MatchmakingClaimCard } from './matchmaking-claim-card';
import { OutboundRequestCard } from './outbound-request-card';
import {
  carriesEveryTopic,
  claimTopicsById,
  countBy,
  keepSelectedVisible,
  orderFacetOptions,
  toggleId,
} from './topic-facets';
import { useDebouncedSearch } from './use-debounced-search';
import { useSpaceFilterMenu } from './use-space-filter-selection';
import { useStableListOrder } from './use-stable-list-order';
import {
  type DebatesHubTab,
  debatesHubLobbySearchAtom,
  debatesHubLobbySpaceIdsAtom,
  debatesHubLobbySpaceSeedSpentAtom,
  debatesHubLobbyTopicIdsAtom,
} from '~/atoms';

/**
 * Claims where you're ready to debate and someone holding the opposite response is online and
 * ready too. Requesting sends to whoever has been online longest; the server advances to the next
 * candidate if they pass, so this list never has to pick a person.
 *
 * Topics are Knowledge Graph data geo-chat doesn't model — `match.topics` is empty on every row —
 * so they are resolved from the claim entities rather than read off the rows (GEO-2861).
 *
 * No longer a tab of its own (GEO-2861): this is Lobby with "Matches only" on. Lobby owns the
 * toggle and passes it down, so this renders the same filter bar in the same place either way and
 * the control does not move as the list under it changes.
 */
export function MatchesList({
  onTabChange,
  trailing,
}: {
  onTabChange: (tab: DebatesHubTab) => void;
  /** Lobby's "Matches only" switch, at the end of the filter row. */
  trailing?: React.ReactNode;
}) {
  // Lobby's one selection, shared with its toggled-off state (GEO-2861) — the toggle narrows the
  // list, and would be a strange place to also change which spaces the viewer had picked.
  //
  // Session-scoped, like Explore's: the hub closes on an outside pointer-down, so a click-away to
  // dismiss the dropdown unmounted this list and took the selection with it (GEO-2850).
  const [spaceIds, setSpaceIds] = useAtom(debatesHubLobbySpaceIdsAtom);
  // The marker that says the membership default has been spent or forfeited, shared with Lobby's
  // other list for the same reason the selection is. This list never seeds — it did not on master
  // and a confirmed match is not a browse surface — but it edits the selection the *other* list
  // seeds, so a space picked here has to forfeit the default there. Without it, choosing a space
  // with "Matches only" on and then toggling it off mounted `ClaimsTab` with the seed still armed,
  // and the default landed on top of a choice the viewer had just made.
  const [spaceSeedSpent, setSpaceSeedSpent] = useAtom(debatesHubLobbySpaceSeedSpentAtom);
  // Shared with Lobby's other list too, so narrowing survives the switch rather than being undone
  // by it.
  const [topicIds, setTopicIds] = useAtom(debatesHubLobbyTopicIdsAtom);
  // And the search with them. Flipping the toggle unmounts one of Lobby's two lists and mounts the
  // other, so a search held in either one's `useState` was cleared by a switch that presents itself
  // as narrowing what is on screen.
  const [search, setSearch] = useAtom(debatesHubLobbySearchAtom);
  const { value: debouncedSearch } = useDebouncedSearch(search);

  const matchesQuery = useMatchmakingMatches(true);
  const requestsQuery = useDebateRequests(true);
  const activityQuery = useDebateActivity(true);
  const activity = activityQuery.data;

  const serverMatches = React.useMemo(() => matchesQuery.data?.matches ?? [], [matchesQuery.data]);
  const outbound = requestsQuery.data?.outbound ?? activity?.outbound_request ?? null;

  // Same hold as Explore's list: standing down from one claim shouldn't reshuffle the rest.
  const matches = useStableListOrder(
    serverMatches,
    match => `${match.claim.space_id}:${match.claim.claim_entity_id}`,
    spaceIds.join(',')
  );

  // Topics are Knowledge Graph data that `/matchmaking/matches` does not carry — `match.topics` is
  // empty on every row, the same way `MatchmakingClaim.topics` is — and there is no facet beside it
  // either. So they are resolved from the claim entities, the same lookup and the same
  // `claimTopicsById` the rematch picker uses for its own by-id lists.
  //
  // Safe to count and filter client-side here in a way it would not be for a paged list: this whole
  // list is in hand, so the rows *are* the complete answer (see `facetSpaces` above for the same
  // reasoning about spaces).
  const claimEntityIds = React.useMemo(() => serverMatches.map(match => match.claim.claim_entity_id), [serverMatches]);
  const {
    entities: claimEntities,
    isLoading: topicsLoading,
    error: topicsError,
  } = useClaimEntitiesByIds(claimEntityIds);
  const topicsByClaimId = React.useMemo(() => claimTopicsById(claimEntities), [claimEntities]);

  /**
   * Whether the topic filter can be honoured yet, and what to do when it cannot.
   *
   * This lookup is the only source for these topics, so until it answers every match looks
   * topicless — and `carriesEveryTopic` rejects a topicless claim whenever a topic is picked. That
   * is the whole list gone, under "No matches match these filters", said of a filter that had
   * nothing to do with it. A failed lookup would say it for as long as the failure lasted.
   *
   * So an unresolved lookup does not filter, which is the same call `canPublishDebateIn` makes
   * about an unresolved space type in the rematch picker: a list that is briefly wider than the
   * filter asks for beats one that is confidently and wrongly empty, and this one narrows itself
   * the moment the entities land.
   *
   * Deliberately not an error state on the list either. The matches are geo-chat's and they are
   * here; the topics are metadata beside them, and blanking the tab over metadata is the trade
   * `claims-tab` refuses for the same lookups. The picked topic stays on the menu at zero
   * (`keepSelectedVisible` below), so there is always a way to untick it.
   */
  const topicsResolved = !topicsLoading && !topicsError;

  /**
   * The three dimensions this list narrows by, each testable on its own.
   *
   * One predicate each because they are read three times — the list, and a menu per dimension — and
   * the three readings have to agree or a menu stops describing the list under it. Both menus did
   * exactly that: the space one counted every match whatever was typed in the search box, so a
   * search that left one claim in space A still offered space B with a count beside it, and picking
   * it produced nothing. The topic one was narrowed by space but not by search, the same way.
   *
   * What a menu does with its *own* selection follows from how that dimension combines, and the two
   * here combine differently:
   *
   * Space is OR within the dimension — a row matches if it is in any picked space — so its menu is
   * counted over the rows the other dimensions allow and *not* its own. Each count then answers
   * "how many rows would ticking this add", and `keepSelectedVisible` keeps a picked space on the
   * menu so it can be unticked.
   *
   * Topics are AND: {@link carriesEveryTopic} asks for every picked one, so a topic the current
   * selection has no claim in common with would empty the list. Its menu is co-occurrence, counted
   * over the rows that already carry the selection — "what else do these claims carry" — which is
   * what `topic-facets` documents and what the hub's server facet does (GEO-2696). Excluding its own
   * selection, as the space menu does, is what offered a mutually exclusive topic with a count
   * beside it.
   */
  const passesSpace = React.useCallback(
    (match: MatchmakingMatch) => spaceIds.length === 0 || spaceIds.includes(match.claim.space_id),
    [spaceIds]
  );
  const passesTopics = React.useCallback(
    (match: MatchmakingMatch) =>
      !topicsResolved || carriesEveryTopic(topicsByClaimId.get(match.claim.claim_entity_id), topicIds),
    [topicIds, topicsByClaimId, topicsResolved]
  );
  const passesSearch = React.useCallback(
    (match: MatchmakingMatch) =>
      !debouncedSearch || match.claim.claim.toLowerCase().includes(debouncedSearch.toLowerCase()),
    [debouncedSearch]
  );

  // Counted from the matches themselves — this tab has no server facet, and the whole list is in
  // hand, so the rows are the complete answer.
  //
  // A selected space is kept on the menu even once nothing counts towards it, the same way
  // `useSpaceFilterMenu` does it for Explore. The selection outlives this mount now (GEO-2850), so
  // it can outlive the match that put the space on the menu in the first place — the other side
  // goes offline while the panel is closed, and reopening it would otherwise show an empty list
  // filtered by a space with no row left to untick it by.
  const offeredSpaces = React.useMemo(
    () =>
      countBy(
        matches
          .filter(match => passesTopics(match) && passesSearch(match))
          .map(match => ({ id: match.claim.space_id, name: null }))
      ),
    [matches, passesSearch, passesTopics]
  );

  // Through the shared menu rather than by hand, which is what it is for: it folds the selection
  // back in, orders the rows, and — the part this list was missing — hands back handlers that have
  // already forfeited the default. Its own doc names the failure: three call sites per surface, and
  // forgetting one is silent and turns a default into a policy.
  //
  // `memberSpaceIds: null` so it never seeds here, only forfeits.
  const { facetSpaces, onSpaceToggle, onSpacesClear } = useSpaceFilterMenu({
    offeredSpaces,
    spaceIds,
    setSpaceIds,
    memberSpaceIds: null,
    pending: matchesQuery.isLoading,
    seedSpent: spaceSeedSpent,
    onSeedSpend: () => setSpaceSeedSpent(true),
  });

  const facetTopics = React.useMemo(
    () =>
      orderFacetOptions(
        keepSelectedVisible(
          countBy(
            matches
              .filter(match => passesSpace(match) && passesSearch(match) && passesTopics(match))
              .flatMap(match => topicsByClaimId.get(match.claim.claim_entity_id) ?? [])
          ),
          topicIds
        ),
        topicIds
      ),
    [matches, passesSearch, passesSpace, passesTopics, topicIds, topicsByClaimId]
  );

  const filtered = React.useMemo(
    () => matches.filter(match => passesSpace(match) && passesTopics(match) && passesSearch(match)),
    [matches, passesSearch, passesSpace, passesTopics]
  );

  // The viewer's own filters emptied a list that has something in it — the one empty state here
  // they can undo, and the one `serverMatches.length === 0` is false for.
  const filteredByViewer = filtered.length === 0 && serverMatches.length > 0;

  return (
    <div className="flex flex-col">
      {/* One pinned header rather than a pinned card above scrolling filters: two stickies would
          both claim `top-0` and overlap, and the outbound card is conditional so the filters
          couldn't be offset by a known height. */}
      <HubStickyControls>
        {outbound ? <OutboundRequestCard request={outbound} /> : null}
        <Input
          withSearchIcon
          value={search}
          onChange={event => setSearch(event.currentTarget.value)}
          placeholder="Search claims"
          aria-label="Search claims"
        />

        <SpaceTopicFilters
          spaceIds={spaceIds}
          onSpaceToggle={onSpaceToggle}
          onSpacesClear={onSpacesClear}
          topicIds={topicIds}
          onTopicToggle={id => setTopicIds(current => toggleId(current, id))}
          onTopicsClear={() => setTopicIds([])}
          facetSpaces={facetSpaces}
          facetTopics={facetTopics}
          trailing={trailing}
        />
      </HubStickyControls>

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
            filteredByViewer
              ? 'No matches match these filters.'
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
          // `live` unconditionally: `SIGNED_OUT_TABS` in the panel keeps Lobby off the signed-out
          // hub entirely, so every viewer here holds the gateway scope.
          emptyNote={serverMatches.length === 0 ? <DebateHoursNote live /> : undefined}
          // Same label as People's, because it is the same action out of the same dead end. Two
          // names for one button in one panel is a difference that implies something.
          // Clearing the filter is the whole answer when the filter is the cause, and browsing claims
          // cannot be — there are matches, just not in the spaces on screen.
          emptyAction={
            filteredByViewer
              ? {
                  label: 'Clear filters',
                  onClick: () => {
                    setSearch('');
                    // The menu's own clear row, so this counts as choosing the unfiltered list and
                    // the default cannot put its spaces back.
                    onSpacesClear();
                    setTopicIds([]);
                  },
                }
              : { label: 'Explore claims', onClick: () => onTabChange('explore') }
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
