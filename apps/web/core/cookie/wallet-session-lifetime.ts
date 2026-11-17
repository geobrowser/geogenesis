/**
 * Wallet session lifetime. It bounds how long a lapsed Privy login keeps working on the server.
 * No imports, so the client can use these without bundling the signing module.
 */
export const WALLET_SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

/** A session older than this is re-issued on the next sync. */
export const WALLET_SESSION_RENEW_AFTER_SECONDS = 7 * 24 * 60 * 60;

/** Issues (POST) and clears (DELETE) the session. */
export const WALLET_SESSION_ROUTE = '/api/wallet-session';
