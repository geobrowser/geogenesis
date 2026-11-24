/** Wallet session constants shared by server and client. No imports, so the client bundles none of the signing code. */

/** Bounds how long a lapsed Privy login keeps working on the server. */
export const WALLET_SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

/** A session older than this is re-issued on the next sync. */
export const WALLET_SESSION_RENEW_AFTER_SECONDS = 7 * 24 * 60 * 60;

/** Issues (POST) and clears (DELETE) the session. */
export const WALLET_SESSION_ROUTE = '/api/wallet-session';

/**
 * Readable companion to the httpOnly session, so the client knows a session may exist and needs
 * clearing on sign-out. A hint only: the server never trusts it.
 */
export const WALLET_SESSION_HINT = 'walletSessionHint';
