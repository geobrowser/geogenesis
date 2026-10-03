/**
 * How long the server trusts a wallet session, and when it re-issues one. No dependencies, so the
 * client sync can share these without pulling the signing module (and `node:crypto`) into a bundle.
 *
 * The session is a bearer credential, so its lifetime bounds how long a signed-out or revoked Privy
 * login keeps working on the server, including for someone who comes back after it lapsed with no
 * tab open to notice. Renewing it rides on the sync that already runs while the user is signed in,
 * and every renewal is a cookie write, which re-renders the page (#2672). Once a week per browser
 * keeps that rare; a month of headroom means an occasional user is not signed out of the server
 * between visits.
 */
export const WALLET_SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

/** A session older than this is re-issued on the next sync. Well inside the max age. */
export const WALLET_SESSION_RENEW_AFTER_SECONDS = 7 * 24 * 60 * 60;
