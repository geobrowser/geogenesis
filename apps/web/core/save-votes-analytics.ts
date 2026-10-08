import { snapshotActionContext } from '~/core/action-context';
import { capture } from '~/core/analytics';
import { recordAction } from '~/core/analytics-operations';
import { type AuthAttempt, isSignedInOutcome } from '~/core/auth-attempt';

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
 * What this tab's sign-in means for the votes on the device:
 *
 * - `save`: a save prompt started it and it completed. Only now may they be published.
 * - `pending`: a save prompt started it and it hasn't finished. Privy reports a user before its dialog
 *   is done, and the visitor can still back out — after which Privy signs them out — so nothing is
 *   published yet (GEO-3243).
 * - `abandoned`: a save prompt started it and the visitor exited after Privy had signed them in. Privy
 *   signs them out next, but may still report the account for a moment; the votes wait for that
 *   sign-out and stay on the device for the next save, rather than being cleared as somebody else's.
 * - `not_save`: something else started it, or the visitor closed it before anyone signed in.
 * - `elsewhere`: no attempt in this tab, so the sign-in happened in another one, which decides.
 *
 * The attempt is the authorization to save, rather than a flag of our own: it is already recorded per
 * press, survives the OAuth redirect in this tab, is replaced by any later sign-in, and is marked
 * `closed` or `left_after_*` when the visitor leaves it.
 */
export type SaveVotesSignIn = 'save' | 'pending' | 'abandoned' | 'not_save' | 'elsewhere';

export function saveVotesSignIn(attempt: AuthAttempt | undefined): SaveVotesSignIn {
  if (!attempt) return 'elsewhere';
  if (attempt.properties.auth_intent !== SAVE_VOTES_ANALYTICS.auth_intent) return 'not_save';
  if (attempt.outcome === undefined) return 'pending';
  if (attempt.outcome === 'left_after_sign_up' || attempt.outcome === 'left_after_sign_in') return 'abandoned';
  return isSignedInOutcome(attempt.outcome) ? 'save' : 'not_save';
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
