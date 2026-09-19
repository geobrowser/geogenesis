'use client';

import * as React from 'react';

import { ID } from '~/core/id';

/**
 * Which debate a surface will let play, where more than one is on screen.
 *
 * `undefined` means no gate at all — the explore feed and the full-screen feed
 * provide none, so nothing about them changes.
 */
const DebatePlaybackContext = React.createContext<string | null | undefined>(undefined);

/**
 * Holds playback to one debate (GEO-2859).
 *
 * `DebateExploreFeedCard` decides for itself whether to play, from how much of
 * it is on screen: 0.6 of the card visible starts it, 0.4 stops it. That is
 * right in the explore feed, where the cards are stacked and tall enough that
 * one of them clears 0.6 at a time.
 *
 * It is wrong in a row. The profile's Activity gallery puts several cards side
 * by side and every one of them is fully visible — ratio 1.0 for all — so every
 * one would start playing at once. This names the single debate allowed to, and
 * the card takes it as a veto over its own judgement rather than a replacement
 * for it: a card that is allowed but scrolled away still stops.
 */
export function DebatePlaybackGate({ allowedId, children }: { allowedId: string | null; children: React.ReactNode }) {
  return <DebatePlaybackContext.Provider value={allowedId}>{children}</DebatePlaybackContext.Provider>;
}

/** Whether this debate may play. True wherever no gate is in force. */
export function useDebatePlaybackAllowed(debateId: string): boolean {
  const allowed = React.useContext(DebatePlaybackContext);

  if (allowed === undefined) return true;
  return allowed !== null && ID.equals(allowed, debateId);
}

/**
 * Whether a gate is deciding at all, which changes what a card's own judgement
 * is *for*.
 *
 * Ungated, a card's intersection ratio answers "should I be the one playing" —
 * it is the only thing standing between a feed of cards and all of them playing
 * at once, so it is strict on purpose: 0.6 to start.
 *
 * Gated, that question is already answered, and a second stricter test can only
 * subtract. A card the gate has chosen but whose ratio sits in the dead band
 * never starts, and tapping is the reader's only way out — which is what a
 * 520px card in a 664px viewport spends much of its time doing. So a gated card
 * asks the easier question instead: am I on screen at all.
 */
export function useIsDebatePlaybackGated(): boolean {
  return React.useContext(DebatePlaybackContext) !== undefined;
}
