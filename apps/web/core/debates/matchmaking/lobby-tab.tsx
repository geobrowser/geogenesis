'use client';

import * as React from 'react';

import { useAtom } from 'jotai';

import { isAccountWarmingUpQuery } from '../api';
import { ClaimsTab } from './claims-tab';
import { useMatchmakingMatches } from './hooks';
import { MatchesList } from './matches-list';
import { MatchesOnlySwitch } from './matches-only-switch';
import { type NarrowedListState, useNarrowedDefault } from './use-narrowed-default';
import { type DebatesHubTab, debatesHubLeftLobbyForExploreAtom, debatesHubMatchesOnlyAtom } from '~/atoms';

/**
 * The hub's landing tab, and the single answer to "what can I debate right now" (GEO-2861).
 *
 * There used to be two answers. A Matches tab listed claims where someone holding the opposite side
 * was online and ready, and a "Debate now" option inside Claims listed claims scored on who was
 * available to debate *you* — the same intent, two surfaces, two different lists, and nothing on
 * screen to say which one to trust. Lobby is the one surface, and the difference between those two
 * lists became a toggle on it.
 *
 * Off is the wider list, and the default: it can always answer, where a confirmed match is often
 * empty and opening onto an empty list reads as the hub being broken rather than as a filter being
 * on.
 *
 * The two states are different queries rather than one list filtered two ways — `useMatchmakingMatches`
 * is the server's authoritative match list, and narrowing the paged `debate_now` list on the client
 * would be a weaker, quietly different answer. So this swaps the source and keeps everything else in
 * place: the switch sits at the end of the filter row on both sides, which is what keeps it from
 * moving under the pointer as the list changes.
 */
export function LobbyTab({ onTabChange }: { onTabChange: (tab: DebatesHubTab) => void }) {
  const [matchesOnly, setMatchesOnly] = useAtom(debatesHubMatchesOnlyAtom);

  // Asked here rather than left to `MatchesList`, because the answer decides which of the two lists
  // is drawn at all — and the query is the same one that component makes, so with matches to show
  // this costs nothing beyond what the tab was already fetching.
  const matchesQuery = useMatchmakingMatches(true);
  // A failed lookup is `pending`, not `empty`: react-query drops `isLoading` on failure, and an
  // outage reads from here exactly like a viewer with nobody to debate. Stepping back on that would
  // take the matches list away over a request that could simply be retried — and `MatchesList` has
  // the retry, where the wider list this would fall to has nothing to say about it.
  // `isFetching`, not `isLoading`. With something in the cache react-query reports `isLoading:
  // false` while the mount refetch is still out, so yesterday's empty answer would have been taken
  // as today's — and this hook decides once and keeps it, so a viewer with matches waiting could
  // have been stepped back onto the wider list on the strength of a stale one. Later refetches are
  // harmless, because by then the decision is made.
  const matchesState: NarrowedListState =
    matchesQuery.isLoading || matchesQuery.isFetching || matchesQuery.error
      ? 'pending'
      : (matchesQuery.data?.matches.length ?? 0) === 0
        ? 'empty'
        : 'filled';

  const { showNarrowed, steppedBack, rearm } = useNarrowedDefault(matchesOnly, matchesState);

  /**
   * Once a session, and held outside this component because this component does not last.
   *
   * `HubSwap` unmounts the tab when the viewer leaves it, so everything `useNarrowedDefault` knows
   * is recomputed from scratch on every arrival. With "Matches only" defaulting on, a viewer with
   * no matches and an empty `debate_now` list was therefore moved off Lobby *every time they opened
   * it* — and Lobby is the tab the hub opens on, so there was no way to stay. The rematch page
   * guards the same move with a ref keyed on its session; this is that, for a tab that dies.
   *
   * Held still as well, so `ClaimsTab`'s report effect is not re-armed on every render of this one.
   */
  const [leftForExplore, setLeftForExplore] = useAtom(debatesHubLeftLobbyForExploreAtom);
  const showExplore = React.useCallback(() => {
    setLeftForExplore(true);
    onTabChange('explore');
  }, [onTabChange, setLeftForExplore]);

  /**
   * An account geo-chat has not registered yet cannot answer this tab at all.
   *
   * Every list here is the viewer's own, so all of them are refused for the minute or two after a
   * sign-up — and Lobby is where the hub opens. Explore is the corpus rather than the viewer, so it
   * works throughout. This is the same move the ladder above makes for a Lobby with nothing on it,
   * spent from the same marker for the same reason: it is a courtesy on arrival, not a policy, so
   * coming back to Lobby afterwards gets the viewer the message and leaves them on it.
   */
  const warmingUp = isAccountWarmingUpQuery(matchesQuery);
  React.useEffect(() => {
    if (!warmingUp || leftForExplore) return;
    showExplore();
  }, [leftForExplore, showExplore, warmingUp]);

  const toggle = (
    <MatchesOnlySwitch
      analyticsSurface="hub"
      // The effective state, not the stored one. A switch reading "on" over the unfiltered list is
      // telling the viewer something that is not true of what they are looking at, and pressing it
      // would then appear to do nothing.
      checked={showNarrowed}
      onChange={next => {
        rearm();
        setMatchesOnly(next);
      }}
    />
  );

  // Two components rather than one with a branch inside it. They query different endpoints, derive
  // their space menus differently, and describe an empty list in different words — the only thing
  // they share is the toggle and the selection it sits beside, which is exactly what is passed.
  return showNarrowed ? (
    <MatchesList onTabChange={onTabChange} trailing={toggle} />
  ) : (
    <ClaimsTab
      variant="lobby"
      trailing={toggle}
      // The last rung of the same ladder. Having stepped back from matches to the wider list and
      // found that empty too, there is nothing on this tab for the viewer to do, and Explore is the
      // one place that always has something — it describes the corpus rather than the viewer.
      //
      // Only on the automatic path. A viewer who turned the switch off themselves and found an
      // empty Lobby asked a question and got an answer; moving them off the tab would be answering
      // a different one. `steppedBack` is exactly "nobody chose this list".
      onSettledEmpty={steppedBack && !leftForExplore ? showExplore : undefined}
    />
  );
}
