/**
 * GEO-3550's send switch for `auth_step` and the attempt events' funnel properties. The collector
 * fails a whole batch holding an event it has no contract for, so this is the way to stop sending.
 */
export const SEND_AUTH_STEP = true;

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
