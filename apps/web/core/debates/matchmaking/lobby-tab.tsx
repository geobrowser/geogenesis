'use client';

import * as React from 'react';

import { useAtom } from 'jotai';

import { ClaimsTab } from './claims-tab';
import { useMatchmakingMatches } from './hooks';
import { MatchesList } from './matches-list';
import { MatchesOnlySwitch } from './matches-only-switch';
import { useNarrowedDefault } from './use-narrowed-default';
import { type DebatesHubTab, debatesHubMatchesOnlyAtom } from '~/atoms';

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
  // Settled, and settled *with an answer*: react-query drops `isLoading` on failure, and an outage
  // reads from here exactly like a viewer with nobody to debate. Stepping back on that would take
  // the matches list away over a request that could simply be retried — and `MatchesList` has the
  // retry, where the wider list this would fall to has nothing to say about it.
  const noMatchesAtAll =
    !matchesQuery.isLoading && !matchesQuery.error && (matchesQuery.data?.matches.length ?? 0) === 0;

  const { narrowed, steppedBack, rearm } = useNarrowedDefault(matchesOnly, noMatchesAtAll);

  const toggle = (
    <MatchesOnlySwitch
      // The effective state, not the stored one. A switch reading "on" over the unfiltered list is
      // telling the viewer something that is not true of what they are looking at, and pressing it
      // would then appear to do nothing.
      checked={narrowed}
      onChange={next => {
        rearm();
        setMatchesOnly(next);
      }}
    />
  );

  // Two components rather than one with a branch inside it. They query different endpoints, derive
  // their space menus differently, and describe an empty list in different words — the only thing
  // they share is the toggle and the selection it sits beside, which is exactly what is passed.
  return narrowed ? (
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
      onSettledEmpty={steppedBack ? () => onTabChange('explore') : undefined}
    />
  );
}
