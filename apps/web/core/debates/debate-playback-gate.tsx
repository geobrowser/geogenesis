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
 * A feed's side of the tap: whether a debate tapped outside the feed is playing, which a feed's own
 * player yields to so there is one player in the app (a profile opened in the side panel over
 * Explore or `/debates`, a topic's coverage beside its feed), and how to take playback back. A
 * click that asks a yielding feed player to play calls `reclaim`, in the same click, so the press
 * is not swallowed while the tapped card goes on playing.
 */
export function useFeedPlaybackYield() {
  const tapped = useAtomValue(tappedDebateAtom);
  const setTapped = useSetAtom(tappedDebateAtom);
  const reclaim = React.useCallback(() => setTapped(null), [setTapped]);
  return { yielding: tapped !== null, reclaim };
}

/**
 * Playback for one debate card, drawn by one card instance (`owner`, its `useId`).
 *
 * In a feed (`tapToPlay` false) it may play unless a debate tapped elsewhere is playing, and
 * `reclaim` takes playback back from that one. Outside a feed (`tapToPlay`) only the card that was
 * tapped may: `tap` takes it, `release` gives it up. It is also given up when the card unmounts, so
 * a card remounted at the same place — navigating back, which hands it the same `useId` — does not
 * find a stale tap and start by itself.
 */
export function useDebateCardPlayback(debateId: string, owner: string) {
  const tapToPlay = !useDebateFeedAutoplay();
  const tapped = useAtomValue(tappedDebateAtom);
  const setTapped = useSetAtom(tappedDebateAtom);
  const isTapped = isTappedBy(tapped, debateId, owner);

  const tap = React.useCallback(() => setTapped({ debateId, owner }), [debateId, owner, setTapped]);
  const release = React.useCallback(
    () => setTapped(current => (current?.owner === owner ? null : current)),
    [owner, setTapped]
  );
  const reclaim = React.useCallback(() => setTapped(null), [setTapped]);
  React.useEffect(() => release, [release]);

  return { tapToPlay, allowed: tapToPlay ? isTapped : tapped === null, isTapped, tap, release, reclaim };
}

/**
 * Whether a click captured on the wrapper around a debate's player asks it to play.
 *
 * A finished debate's end card is drawn inside the player, and its vote, its voter list and its way
 * into the claims panel are not media controls: only its replay asks to play. The voter list is
 * portalled out of this DOM but its clicks still bubble through React's tree, so a target outside
 * the wrapper is let go too. And the combined player opens the native full-screen player, so it
 * cannot play over another card.
 */
export function clickAsksToPlay(event: React.MouseEvent<HTMLElement>): boolean {
  const target = event.target;
  if (target instanceof Node && !event.currentTarget.contains(target)) return false;
  if (!(target instanceof Element)) return true;
  if (target.closest('[data-debate-end-card]') !== null && target.closest('[data-end-card-replay]') === null) {
    return false;
  }
  return target.closest('[data-debate-combined-player]') === null;
}

function isTappedBy(tapped: TappedDebate | null, debateId: string, owner: string) {
  return tapped !== null && tapped.owner === owner && ID.equals(tapped.debateId, debateId);
}
