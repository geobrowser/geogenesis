import { cookies } from 'next/headers';

import { bearerToken, verifyPrivyIdentityToken } from '~/core/auth/server/privy-identity-token';
import {
  LEGACY_WALLET_ADDRESS,
  WALLET_SESSION,
  WALLET_SESSION_COOKIE_OPTIONS,
  readWalletSessionFrom,
  signWalletSession,
} from '~/core/cookie/wallet-session';

import { isSameOrigin } from '../same-origin';

export type WalletSessionStatus = 'unchanged' | 'renewed' | 'issued';
export type WalletSessionResponse = { wallet: string | null; status: WalletSessionStatus | 'unverified' };

const json = (status: number, body: WalletSessionResponse) => Response.json(body, { status });

/**
 * Issues `walletSession` for the verified Privy token's wallet; writes only on change or renewal.
 * A route handler, since a Server Action cookie write re-renders the page.
 */
export async function POST(req: Request) {
  if (!isSameOrigin(req)) return new Response(null, { status: 403 });

  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? '';
  const identity = await verifyPrivyIdentityToken(bearerToken(req.headers.get('authorization')), { appId });
  if (!identity?.walletAddress) return json(401, { wallet: null, status: 'unverified' });

  const cookieStore = await cookies();
  if (cookieStore.has(LEGACY_WALLET_ADDRESS)) cookieStore.delete(LEGACY_WALLET_ADDRESS);

  const current = readWalletSessionFrom(cookieStore);
  const sameWallet = current?.address.toLowerCase() === identity.walletAddress;
  if (sameWallet && !current.renewalDue) return json(200, { wallet: identity.walletAddress, status: 'unchanged' });

  const session = signWalletSession(identity.walletAddress);
  if (!session) return json(503, { wallet: null, status: 'unverified' });
  cookieStore.set(WALLET_SESSION, session, WALLET_SESSION_COOKIE_OPTIONS);

  return json(200, { wallet: identity.walletAddress, status: sameWallet ? 'renewed' : 'issued' });
}

/**
 * Clears server identity: sign-out, and the feed's stale-session cleanup when Privy has no session
 * (see `useClearStaleWalletCookie`). Deleting only ever makes the caller anonymous.
 */
export async function DELETE(req: Request) {
  if (!isSameOrigin(req)) return new Response(null, { status: 403 });
  const cookieStore = await cookies();
  if (cookieStore.has(WALLET_SESSION)) cookieStore.delete(WALLET_SESSION);
  if (cookieStore.has(LEGACY_WALLET_ADDRESS)) cookieStore.delete(LEGACY_WALLET_ADDRESS);
  return new Response(null, { status: 204 });
}
