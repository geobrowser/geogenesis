import { GeoChatRequestError, accountRefusalReason } from './api';
import type { GeoChatRefusalReason } from './geo-chat-account-status';

/** Shown while geo-chat refuses the session for an account it has not registered yet. */
export const ACCOUNT_SETUP_MESSAGE = 'Setting up your account. This updates on its own.';
/** Shown while geo-chat cannot reach its own upstreams; an outage, not the viewer's account. */
export const DEBATES_UNREACHABLE_MESSAGE = 'Can’t reach debates right now. Retrying…';

export function refusalMessage(reason: GeoChatRefusalReason) {
  return reason === 'unreachable' ? DEBATES_UNREACHABLE_MESSAGE : ACCOUNT_SETUP_MESSAGE;
}

/** The friendly message for a session refusal that clears by itself, or null for anything else. */
export function accountSetupMessage(error: unknown): string | null {
  const reason = accountRefusalReason(error);
  return reason ? refusalMessage(reason) : null;
}

/** geo-chat's 409 when either person is already in another open pre-debate session (geo-chat#382). */
export const OPEN_SESSION_CODE = 'already_in_open_session';

export const OPEN_SESSION_MESSAGES = {
  viewer: 'You’re already in another debate session. Finish or leave it first.',
  other: 'The other person is already in another debate session.',
} as const;

/**
 * Words geo-chat's `already_in_open_session` refusal, which covers a challenge sent or accepted and a
 * scheduled room's join. geo-chat's message says which of the two is tied up, so that is what picks
 * the copy; null for any other error.
 */
export function openSessionRefusalMessage(error: unknown): string | null {
  if (!(error instanceof GeoChatRequestError) || error.code !== OPEN_SESSION_CODE) return null;
  return /other person/i.test(error.message) ? OPEN_SESSION_MESSAGES.other : OPEN_SESSION_MESSAGES.viewer;
}

/** An action's error for display: the setup copy for a session refusal, otherwise its own message. */
export function debatesErrorMessage(error: Error) {
  return openSessionRefusalMessage(error) ?? accountSetupMessage(error) ?? error.message;
}
