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

/**
 * Whether a surface is holding playback to one debate at all.
 *
 * A card decides for itself whether enough of it is on screen to play, and that judgement is
 * calibrated for a stack of cards where nothing else arbitrates. Under a gate it is a second,
 * stricter arbiter that can only subtract — so a card the gate has chosen can sit in its own dead
 * band and never start, with tapping the reader's only way out. Knowing a gate is in force lets a
 * card ask the question it actually needs answered: is any of me on screen.
 */
export function useIsDebatePlaybackGated(): boolean {
  return React.useContext(DebatePlaybackContext) !== undefined;
}

/** Whether this debate may play. True wherever no gate is in force. */
export function useDebatePlaybackAllowed(debateId: string): boolean {
  const allowed = React.useContext(DebatePlaybackContext);

  if (allowed === undefined) return true;
  return allowed !== null && ID.equals(allowed, debateId);
}
