/**
 * How long the server trusts a wallet session and when it re-issues one. No imports, so the client
 * sync can share these without bundling the signing module.
 *
 * The session is a bearer credential: its lifetime bounds how long a lapsed Privy login keeps
 * working on the server. Renewal rides on the sync that already runs while the user is signed in.
 */
export const WALLET_SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

/** A session older than this is re-issued on the next sync. */
export const WALLET_SESSION_RENEW_AFTER_SECONDS = 7 * 24 * 60 * 60;

/** Issues (POST) and clears (DELETE) the session. */
export const WALLET_SESSION_ROUTE = '/api/wallet-session';
