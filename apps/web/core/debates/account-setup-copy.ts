import { accountRefusalReason } from './api';
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

/** An action's error for display: the setup copy for a session refusal, otherwise its own message. */
export function debatesErrorMessage(error: Error) {
  return accountSetupMessage(error) ?? error.message;
}
