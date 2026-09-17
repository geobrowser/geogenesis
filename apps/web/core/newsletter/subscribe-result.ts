/**
 * What the subscribe endpoint can answer, as a closed set the popup switches on.
 *
 * A string union rather than a status code, because the caller's question is "what do I tell the
 * visitor" and three of these are not errors in any sense they would recognise: an address already
 * on the list is a success to the person typing it, and saying otherwise invites them to try again
 * with the same address.
 */
export type NewsletterSubscribeResult =
  /** On the list — newly added, or already there. The visitor is told the same thing either way. */
  | 'subscribed'
  /** The address did not look like one. The form says so and keeps what they typed. */
  | 'invalid-email'
  /** Too many attempts from this address or this network. */
  | 'rate-limited'
  /** Anything else: the provider was down, the credential is missing, the request failed. */
  | 'failed';

/** Matches the form's own check, so the server never rejects something the client called valid. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Deliberately permissive. The authority on whether an address exists is the mail that is sent to
 * it, not a regular expression — a stricter pattern here only turns real addresses away, and the
 * provider validates again on its side anyway. This catches typing nothing, typing a name, and
 * leaving off the domain, which is the whole of what a form check is good for.
 */
export function isLikelyEmail(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= 320 && EMAIL_PATTERN.test(trimmed);
}
