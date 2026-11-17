import { cookies } from 'next/headers';

import { bearerToken, verifyPrivyIdentityToken } from '~/core/auth/server/privy-identity-token';
import {
  LEGACY_WALLET_ADDRESS,
  WALLET_SESSION,
  WALLET_SESSION_COOKIE_OPTIONS,
  readWalletSessionFrom,
  signWalletSession,
} from '~/core/auth/server/wallet-session';
import { WALLET_SESSION_HINT } from '~/core/auth/wallet-session-shared';

import { getClientIp } from '../client-ip';
import { isSameOrigin } from '../same-origin';
import { checkWalletSessionIpRateLimit } from './rate-limit';

/**
 * `issued`: the request had no valid session for this wallet, so its page rendered signed out.
 * `unverified` (401): the token did not verify. `unconfigured` (503): no secret; retrying won't help.
 */
export type WalletSessionStatus = 'unchanged' | 'renewed' | 'issued' | 'unverified' | 'unconfigured' | 'rate_limited';
export type WalletSessionResponse = { wallet: string | null; status: WalletSessionStatus };

const json = (status: number, body: WalletSessionResponse, headers?: HeadersInit) =>
  Response.json(body, { status, headers });

/** Not httpOnly: the client reads it to know there is a session to clear. */
const HINT_OPTIONS = { ...WALLET_SESSION_COOKIE_OPTIONS, httpOnly: false } as const;

/**
 * Issues `walletSession` for the verified Privy token's wallet; writes only on change or renewal.
 * A route handler, since a Server Action cookie write re-renders the page.
 */
export async function POST(req: Request) {
  if (!isSameOrigin(req)) return new Response(null, { status: 403 });

  const limit = await checkWalletSessionIpRateLimit(getClientIp(req));
  if (!limit.ok) {
    return json(429, { wallet: null, status: 'rate_limited' }, { 'Retry-After': String(limit.retryAfter) });
  }

  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? '';
  const identity = await verifyPrivyIdentityToken(bearerToken(req.headers.get('authorization')), { appId });
  if (!identity?.walletAddress) return json(401, { wallet: null, status: 'unverified' });

  const cookieStore = await cookies();
  if (cookieStore.has(LEGACY_WALLET_ADDRESS)) cookieStore.delete(LEGACY_WALLET_ADDRESS);

  const current = readWalletSessionFrom(cookieStore);
  const sameWallet = current?.address.toLowerCase() === identity.walletAddress;
  if (sameWallet && !current.renewalDue) {
    if (!cookieStore.has(WALLET_SESSION_HINT)) cookieStore.set(WALLET_SESSION_HINT, '1', HINT_OPTIONS);
    return json(200, { wallet: identity.walletAddress, status: 'unchanged' });
  }

  const session = signWalletSession(identity.walletAddress);
  if (!session) return json(503, { wallet: null, status: 'unconfigured' });
  cookieStore.set(WALLET_SESSION, session, WALLET_SESSION_COOKIE_OPTIONS);
  cookieStore.set(WALLET_SESSION_HINT, '1', HINT_OPTIONS);

  return json(200, { wallet: identity.walletAddress, status: sameWallet ? 'renewed' : 'issued' });
}

/** Clears server identity on sign-out, or when Privy has no session. Only ever makes the caller anonymous. */
export async function DELETE(req: Request) {
  if (!isSameOrigin(req)) return new Response(null, { status: 403 });
  const cookieStore = await cookies();
  for (const name of [WALLET_SESSION, WALLET_SESSION_HINT, LEGACY_WALLET_ADDRESS]) {
    if (cookieStore.has(name)) cookieStore.delete(name);
  }
  return new Response(null, { status: 204 });
}
