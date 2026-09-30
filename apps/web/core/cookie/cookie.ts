'use server';

import { cookies } from 'next/headers';

import { verifyPrivyIdentityToken } from './privy-identity-token';
import { WALLET_SESSION, WALLET_SESSION_MAX_AGE_SECONDS, readWalletCookie, signWalletSession } from './wallet-session';

/**
 * The unsigned cookie this replaced. It held a bare address anyone could set, so it is never
 * read any more — only deleted, the next time its holder connects or signs out (GEO-3107).
 */
const LEGACY_WALLET_ADDRESS = 'walletAddress';

type ConnectionChangeArgs =
  | {
      type: 'connect';
      /** A Privy identity token. The wallet is taken from it, never from the caller. */
      identityToken: string;
    }
  | {
      type: 'disconnect';
    };

/**
 * Writes only when the cookie would actually change. Next treats any cookie write inside a Server
 * Action as a revalidation: the client drops its prefetch cache and re-renders the current page
 * from the server, and if a deploy has shipped since the tab loaded, that re-render becomes a full
 * browser reload. Reading the cookie does not count as a revalidation.
 *
 * Returns the wallet the server now recognises, or null when it recognises none.
 */
export async function onConnectionChange(connectionChange: ConnectionChangeArgs): Promise<`0x${string}` | null> {
  const cookieStore = await cookies();
  const hasLegacyCookie = cookieStore.has(LEGACY_WALLET_ADDRESS);

  if (connectionChange.type === 'disconnect') {
    if (cookieStore.has(WALLET_SESSION)) cookieStore.delete(WALLET_SESSION);
    if (hasLegacyCookie) cookieStore.delete(LEGACY_WALLET_ADDRESS);
    return null;
  }

  const address = await verifyPrivyIdentityToken(connectionChange.identityToken);
  // An unverifiable token leaves the session as it was: it proves nothing about who is asking.
  if (!address) return readWalletCookie(cookieStore) ?? null;

  if (hasLegacyCookie) cookieStore.delete(LEGACY_WALLET_ADDRESS);
  if (readWalletCookie(cookieStore) === address) return address;

  const session = signWalletSession(address);
  if (!session) return null;

  // httpOnly: keeps page JS (and any injected script) from reading or replacing the session.
  // sameSite: 'lax': blocks cross-site sends so a CSRF can't ride it.
  // secure: required for sameSite outside dev.
  cookieStore.set(WALLET_SESSION, session, {
    maxAge: WALLET_SESSION_MAX_AGE_SECONDS,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  });
  return address;
}
