'use client';

import * as React from 'react';

import { useAtom } from 'jotai';

import { ClaimsTab } from './claims-tab';
import { MatchesList } from './matches-list';
import { MatchesOnlySwitch } from './matches-only-switch';
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

  const toggle = <MatchesOnlySwitch checked={matchesOnly} onChange={setMatchesOnly} />;

  // Two components rather than one with a branch inside it. They query different endpoints, derive
  // their space menus differently, and describe an empty list in different words — the only thing
  // they share is the toggle and the selection it sits beside, which is exactly what is passed.
  return matchesOnly ? (
    <MatchesList onTabChange={onTabChange} trailing={toggle} />
  ) : (
    <ClaimsTab variant="lobby" trailing={toggle} />
  );
}
