/**
 * GEO-3550's one send switch, for the `auth_step` events and the funnel properties on the attempt
 * events. Off until the analytics registry's contract is deployed: the collector rejects a
 * growth-v2 event it has no contract for, failing its batch. Until then `auth_step` is only logged.
 */
export const SEND_AUTH_STEP = false;

/** Which sign-in UI the visitor was in. */
export type SignInSurface = 'box' | 'save_votes' | 'email_capture' | 'privy_modal';

export type SignInMethod = 'email' | 'google';

/** Privy's error code, or a fixed fallback. Never the message, which can carry the address. */
export function authErrorCode(error: unknown): string {
  const code =
    typeof error === 'object' && error !== null ? (error as { privyErrorCode?: unknown }).privyErrorCode : undefined;
  return typeof code === 'string' && /^[a-z0-9_]{1,64}$/.test(code) ? code : 'unknown_error';
}

/** Privy's `loginMethod`, as the funnel counts it; other methods go uncounted. */
export function signInMethodOf(loginMethod: string | null | undefined): SignInMethod | undefined {
  if (loginMethod === 'email' || loginMethod === 'google') return loginMethod;
  return undefined;
}
