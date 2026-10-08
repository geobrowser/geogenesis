import { snapshotActionContext } from '~/core/action-context';
import { capture } from '~/core/analytics';
import { recordAction } from '~/core/analytics-operations';
import type { AuthAttempt } from '~/core/auth-attempt';

/**
 * Sign-ins a save prompt starts (GEO-3214): the sheet's email, its other ways in, and the navbar's
 * "Save N votes". `auth_control` says which; `local_vote_count` how many votes were waiting.
 */
export const SAVE_VOTES_ANALYTICS = {
  component: 'save_votes_prompt',
  auth_control: 'email',
  auth_trigger: 'control',
  auth_intent: 'save_votes',
  auth_continuation: 'queued',
  target_type: 'application',
  target_id: 'genesis',
  signup_surface: 'save_votes_prompt',
} as const;

/**
 * Whether `attempt` is a sign-in a save prompt started, and not one the visitor walked away from.
 *
 * The attempt is the authorization to save, rather than a flag of our own: it is already recorded per
 * press, survives the OAuth redirect in this tab, is replaced by any later sign-in, and is marked
 * `closed` when the sheet or Privy's dialog is dismissed.
 */
export function isSaveVotesSignIn(attempt: AuthAttempt | undefined) {
  if (!attempt || attempt.properties.auth_intent !== SAVE_VOTES_ANALYTICS.auth_intent) return false;
  // Still open, or signed in. Any way of leaving it — closed, superseded, or exited after signing in,
  // which Privy follows with a sign-out — is not a save.
  return attempt.outcome === undefined || attempt.outcome === 'signed_up' || attempt.outcome === 'signed_in';
}

export function saveVotesSignInProperties(auth_control: string, localVoteCount: number) {
  return { ...SAVE_VOTES_ANALYTICS, auth_control, local_vote_count: localVoteCount };
}

/** The sheet coming on screen. A plain capture: it is not inside an `ActionSurface` to measure. */
export function captureSaveVotesImpression(promptReason: string, localVoteCount: number) {
  try {
    capture('component_impression', {
      ...snapshotActionContext('save_votes_prompt', 'application', 'genesis', {}, {}, { ignoreEventContext: true }),
      presentation_instance_id: crypto.randomUUID(),
      action_context_version: 'v1',
      measurement_version: 'growth-v2',
      prompt_reason: promptReason,
      local_vote_count: localVoteCount,
    });
  } catch {
    /* Analytics never blocks the prompt. */
  }
}

/** A local vote nobody will publish: already held by the account, or a sign-in that wasn't a save. */
export function captureLocalVoteDropped(
  reason: 'already_held' | 'other_sign_in' | 'signed_out',
  vote: { entityId: string; responseKind: string },
  count: number
) {
  try {
    const targetType = vote.responseKind === 'curation' ? 'entity' : 'claim';
    recordAction(
      'local_vote_dropped',
      snapshotActionContext('save_votes_prompt', targetType, vote.entityId, {}, {}, { ignoreEventContext: true }),
      { drop_reason: reason, response_kind: vote.responseKind, entity_id: vote.entityId, local_vote_count: count }
    );
  } catch {
    /* Analytics never blocks a save. */
  }
}
