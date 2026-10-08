'use client';

import { useSyncExternalStore } from 'react';

/**
 * Whether the "Save your votes" sheet is open, and why (GEO-3214).
 *
 * Module-level rather than an atom for the same reason as `local-votes`: the navbar opens a save
 * sign-in, and its tests mock `jotai` wholesale.
 */
export type SaveVotesPromptReason = 'threshold' | 'single_claim' | 'repeat' | 'return_visit' | 'inline_save';

/**
 * Where a vote was cast. A claim page or a debate's end card has no second claim beside it to vote
 * on, so waiting for a second vote there would mean the ask never comes.
 */
export type SavePromptSurface = 'feed' | 'single';

/** The vote counts at which the sheet opens on its own: first ask, then once more. */
export const FIRST_ASK_AT = { feed: 2, single: 1 } as const;
export const SECOND_ASK_AT = 5;

/** Marks the browser session in which the visitor has already voted or been asked. */
const SESSION_KEY = 'geo:save-votes-prompted';

let current: SaveVotesPromptReason | null = null;
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

/** The open reason outside React, for tests and for code that decides without rendering. */
export function readSaveVotesPrompt(): SaveVotesPromptReason | null {
  return current;
}

export function openSaveVotesPrompt(reason: SaveVotesPromptReason) {
  markPromptedThisSession();
  if (current === reason) return;
  current = reason;
  emit();
}

export function closeSaveVotesPrompt() {
  if (current === null) return;
  current = null;
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
    if (count < FIRST_ASK_AT[surface]) return null;
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
