'use client';

import * as React from 'react';

import { atom, useAtomValue, useSetAtom } from 'jotai';

import { ID } from '~/core/id';

/**
 * Which debate cards may start themselves (GEO-3812).
 *
 * A feed — Explore, a topic's feed, a space's activity — is something the viewer scrolls through to
 * watch, so its cards play as they come into view. Everywhere else a debate card is part of a page
 * being read — a profile's record, a claim's debates, a topic's coverage, a table block — and a
 * video that starts by itself there is noise. So autoplay is opt-in: `EntityFeed` wraps its cards
 * in this, and a card outside it waits for a tap.
 */
const DebateFeedAutoplayContext = React.createContext(false);

/** Lets the debate cards inside play as they come into view. See {@link DebateFeedAutoplayContext}. */
export function DebateFeedAutoplay({ children }: { children: React.ReactNode }) {
  return <DebateFeedAutoplayContext.Provider value>{children}</DebateFeedAutoplayContext.Provider>;
}

/** Whether this card is in a feed, and so plays without a tap. */
export function useDebateFeedAutoplay(): boolean {
  return React.useContext(DebateFeedAutoplayContext);
}

/**
 * The one debate a viewer tapped to play outside a feed, if any — one at a time, app-wide.
 *
 * Keyed by the card instance (`owner`, its `useId`) as well as the debate, so the same debate on two
 * surfaces at once (a profile's Debates tab and its Activity gallery) plays only where it was tapped.
 * The card that set it clears it when it unmounts, leaves the screen, or stops playing, so a tap
 * never outlives the card that took it and nothing starts on its own afterwards.
 */
export type TappedDebate = { debateId: string; owner: string };

export const tappedDebateAtom = atom<TappedDebate | null>(null);

/**
 * Whether this debate, drawn by this card, may play.
 *
 * In a feed: unless a debate has been tapped somewhere else, which a feed card yields to, so there is
 * one player in the app — a profile opened in the side panel over Explore, or a topic's coverage
 * beside its feed. Outside one: only the card that was tapped.
 */
export function useDebatePlaybackAllowed(debateId: string, owner: string): boolean {
  const inFeed = useDebateFeedAutoplay();
  const tapped = useAtomValue(tappedDebateAtom);

  if (inFeed) return tapped === null;
  return isTappedBy(tapped, debateId, owner);
}

/**
 * The tap for one card outside a feed: whether it holds it, and how to take and give it up.
 *
 * It is given up when the card unmounts, so a card remounted at the same place — navigating back,
 * which hands it the same `useId` — does not find a stale tap and start by itself.
 */
export function useDebateTap(debateId: string, owner: string) {
  const tapped = useAtomValue(tappedDebateAtom);
  const setTapped = useSetAtom(tappedDebateAtom);
  const isTapped = isTappedBy(tapped, debateId, owner);

  const tap = React.useCallback(() => setTapped({ debateId, owner }), [debateId, owner, setTapped]);
  const release = React.useCallback(
    () => setTapped(current => (current?.owner === owner ? null : current)),
    [owner, setTapped]
  );
  React.useEffect(() => release, [release]);

  return { isTapped, tap, release };
}

function isTappedBy(tapped: TappedDebate | null, debateId: string, owner: string) {
  return tapped !== null && tapped.owner === owner && ID.equals(tapped.debateId, debateId);
}
