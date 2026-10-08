import { snapshotActionContext } from '~/core/action-context';
import { capture } from '~/core/analytics';

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
export function captureLocalVoteDropped(reason: 'already_held' | 'other_sign_in', claimId: string, count: number) {
  try {
    capture('action_completed', {
      ...snapshotActionContext('save_votes_prompt', 'claim', claimId, {}, {}, { ignoreEventContext: true }),
      operation_id: crypto.randomUUID(),
      action_kind: 'local_vote_dropped',
      outcome: 'succeeded',
      reason,
      local_vote_count: count,
      action_context_version: 'v1',
      measurement_version: 'growth-v2',
    });
  } catch {
    /* Analytics never blocks a save. */
  }
}
