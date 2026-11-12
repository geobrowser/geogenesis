import type { RedirectedPendingAction } from './pending-actions';
import type { PendingCommentComposerIntent } from './pending-comment-intents';

/**
 * Saves pending actions (a vote, a follow) and an open comment box across a Google sign-in.
 *
 * Google sign-in leaves the page and comes back, and the pending actions queue is only in memory,
 * so it would be lost. We save the actions before the page is left, and add them back to the queue
 * when Google returns to the same sign-in attempt.
 *
 * Uses sessionStorage because Google returns to the same tab. The saved actions are removed as soon
 * as they are read, so a reload can't run them twice.
 */
export const REDIRECT_PENDING_ACTIONS_KEY = 'geo.pending-actions.redirect.v1';

/** Saved actions older than this are ignored. */
export const REDIRECT_PENDING_ACTIONS_MAX_AGE_MS = 30 * 60 * 1000;

/** What a page saves before it is left for Google. */
export type RedirectedPresses = {
  actions: RedirectedPendingAction[];
  commentComposer: PendingCommentComposerIntent | null;
};

type Stored = RedirectedPresses & { v: 1; attemptId: string; savedAt: number };

const NOTHING: RedirectedPresses = { actions: [], commentComposer: null };

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

function isAction(value: unknown): value is RedirectedPendingAction {
  if (!value || typeof value !== 'object') return false;
  const action = value as Record<string, unknown>;
  return (
    typeof action.id === 'string' &&
    typeof action.label === 'string' &&
    (action.requires === 'auth' || action.requires === 'personalSpace') &&
    (action.intent === undefined || typeof action.intent === 'string') &&
    !!action.context &&
    typeof action.context === 'object'
  );
}

function isCommentComposer(value: unknown): value is PendingCommentComposerIntent {
  if (!value || typeof value !== 'object') return false;
  const composer = value as Record<string, unknown>;
  return (
    typeof composer.entityId === 'string' &&
    (composer.replyToCommentId === null || typeof composer.replyToCommentId === 'string')
  );
}

function decode(raw: string | null): Stored | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<Stored>;
    if (value?.v !== 1 || typeof value.attemptId !== 'string' || typeof value.savedAt !== 'number') return null;
    if (!Array.isArray(value.actions)) return null;
    return {
      v: 1,
      attemptId: value.attemptId,
      savedAt: value.savedAt,
      actions: value.actions.filter(isAction),
      commentComposer: isCommentComposer(value.commentComposer) ? value.commentComposer : null,
    };
  } catch {
    return null;
  }
}

/** Saves `actions` and the comment box for this sign-in attempt. Nothing to save clears what was saved. */
export function saveRedirectPendingActions(
  attemptId: string,
  actions: readonly RedirectedPendingAction[],
  commentComposer: PendingCommentComposerIntent | null = null
) {
  const store = storage();
  if (!store) return;
  try {
    if (actions.length === 0 && !commentComposer) {
      store.removeItem(REDIRECT_PENDING_ACTIONS_KEY);
      return;
    }
    const stored: Stored = { v: 1, attemptId, savedAt: Date.now(), actions: [...actions], commentComposer };
    store.setItem(REDIRECT_PENDING_ACTIONS_KEY, JSON.stringify(stored));
  } catch {}
}

/**
 * Reads and removes what was saved. Returns nothing if it was saved for a different attempt or is
 * too old.
 */
export function takeRedirectPendingActions(attemptId: string): RedirectedPresses {
  const store = storage();
  if (!store) return NOTHING;
  let stored: Stored | null;
  try {
    stored = decode(store.getItem(REDIRECT_PENDING_ACTIONS_KEY));
    store.removeItem(REDIRECT_PENDING_ACTIONS_KEY);
  } catch {
    return NOTHING;
  }
  if (!stored || stored.attemptId !== attemptId) return NOTHING;
  if (Date.now() - stored.savedAt > REDIRECT_PENDING_ACTIONS_MAX_AGE_MS) return NOTHING;
  return { actions: stored.actions, commentComposer: stored.commentComposer };
}

/** Removes any saved actions, e.g. when the page didn't come back from Google or sign-in failed. */
export function dropRedirectPendingActions() {
  try {
    storage()?.removeItem(REDIRECT_PENDING_ACTIONS_KEY);
  } catch {}
}
