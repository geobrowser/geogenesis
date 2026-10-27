'use client';

import { useSyncExternalStore } from 'react';

/**
 * Whether the "Save your votes" sheet is open, and why (GEO-3214).
 *
 * Module-level rather than an atom for the same reason as `local-votes`: the navbar opens the sheet,
 * and its tests mock `jotai` wholesale.
 */
export type SaveVotesPromptReason =
  | 'threshold'
  | 'single_claim'
  | 'repeat'
  | 'return_visit'
  | 'inline_save'
  /** An email's vote link put a side on this device (GEO-3374). */
  | 'email_link'
  | SaveVotesPressReason;

/**
 * A "Save N votes" sign-in button: the navbar's, or the debate feed's phone bar (GEO-3415). Pressed,
 * it opens the sheet as a centred dialog (GEO-3400), and the reason says which button it was.
 */
export type SaveVotesPressReason = 'navbar' | 'debate_feed_bar';

/**
 * Whether the sheet opens as a centred dialog rather than the corner card. A press on a "Save N
 * votes" button asked for it, so it comes forward (GEO-3400). So does an email's vote link (GEO-3374):
 * the reader came to vote, and logging in is the only step left, so the ask shouldn't wait in a corner
 * a screen away from the pills. The follow-up ask at five votes also comes forward.
 */
export function opensSaveVotesCentered(reason: SaveVotesPromptReason | null): boolean {
  return reason === 'navbar' || reason === 'debate_feed_bar' || reason === 'email_link' || reason === 'repeat';
}

/**
 * Where a vote was cast. Feeds, claim pages and debate end cards all ask after the first vote;
 * keeping the surface preserves each ask's reason in analytics.
 */
export type SavePromptSurface = 'feed' | 'single';

/** The vote counts at which the sheet opens on its own: first ask, then once more. */
export const FIRST_ASK_AT = 1;
export const SECOND_ASK_AT = 5;

/** Marks the browser session in which the visitor has already voted or been asked. */
const SESSION_KEY = 'geo:save-votes-prompted';

let current: SaveVotesPromptReason | null = null;
/** The lobby the sheet was opened from, which changes its copy; `null` everywhere else. */
let currentLobbyName: string | null = null;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit() {
  listeners.forEach(listener => listener());
}

export function useSaveVotesPrompt(): SaveVotesPromptReason | null {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => null
  );
}

export function useSaveVotesPromptLobbyName(): string | null {
  return useSyncExternalStore(
    subscribe,
    () => currentLobbyName,
    () => null
  );
}

/** The open reason outside React, for tests and for code that decides without rendering. */
export function readSaveVotesPrompt(): SaveVotesPromptReason | null {
  return current;
}

export function openSaveVotesPrompt(reason: SaveVotesPromptReason, options?: { lobbyName?: string }) {
  markPromptedThisSession();
  const lobbyName = options?.lobbyName?.trim() || null;
  if (current === reason && currentLobbyName === lobbyName) return;
  current = reason;
  currentLobbyName = lobbyName;
  emit();
}

/** Back to the sheet's usual copy, for a lobby the visitor has left; the sheet stays as it is. */
export function clearSaveVotesPromptLobby() {
  if (currentLobbyName === null) return;
  currentLobbyName = null;
  emit();
}

export function closeSaveVotesPrompt() {
  if (current === null) return;
  current = null;
  currentLobbyName = null;
  emit();
}

/**
 * Which automatic ask, if any, a newly cast local vote should open. Only casts count — removing or
 * switching a vote doesn't make the visitor any more invested.
 */
export function savePromptReasonAfterVote({
  count,
  surface,
  shownCount,
}: {
  count: number;
  surface: SavePromptSurface;
  shownCount: number;
}): SaveVotesPromptReason | null {
  if (shownCount === 0) {
    if (count < FIRST_ASK_AT) return null;
    return surface === 'single' ? 'single_claim' : 'threshold';
  }
  if (shownCount === 1 && count >= SECOND_ASK_AT) return 'repeat';
  return null;
}

export function markPromptedThisSession() {
  try {
    window.sessionStorage.setItem(SESSION_KEY, '1');
  } catch {
    // Storage blocked: the return-visit ask just may come once more than it should.
  }
}

export function wasPromptedThisSession() {
  try {
    return window.sessionStorage.getItem(SESSION_KEY) === '1';
  } catch {
    return true;
  }
}
