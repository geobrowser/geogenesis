import { bearerToken, verifyPrivyIdentityToken } from '~/core/auth/server/privy-identity-token';
import { resolveMemberSpaceFromWalletSafe } from '~/core/browse/resolve-member-space-from-wallet';
import { normId } from '~/core/utils/norm-id';

import { gaiaForYouConfigured } from './gaia-for-you';

/**
 * The personal space id of the person making this request, PROVEN by a Privy identity token, or
 * null. Never taken from anything the client merely states: the wallet cookie and any id in the
 * query are both writable by anyone, so For you only personalizes for a verified token.
 *
 * Reuses the space the request context already resolved when the cookie's wallet is the token's
 * wallet (the normal case), so a verified request costs no extra lookup.
 */
export async function resolveForYouViewer(
  request: Request,
  context: { walletAddress: string | null; personalMemberSpaceId: string | null },
  options: { verify?: typeof verifyPrivyIdentityToken; resolveSpace?: typeof resolveMemberSpaceFromWalletSafe } = {}
): Promise<string | null> {
  if (!gaiaForYouConfigured()) return null;
  const token = bearerToken(request.headers.get('authorization'));
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  if (!token || !appId) return null;

  const identity = await (options.verify ?? verifyPrivyIdentityToken)(token, { appId });
  const wallet = identity?.walletAddress;
  if (!wallet) return null;

  if (context.personalMemberSpaceId && context.walletAddress?.toLowerCase() === wallet) {
    return normId(context.personalMemberSpaceId);
  }
  const spaceId = await (options.resolveSpace ?? resolveMemberSpaceFromWalletSafe)(wallet);
  return spaceId ? normId(spaceId) : null;
}

const PERSONALIZED_CURSOR_PREFIX = 'p1:';

/**
 * A personalized scroll pins the moment it reads interests at, so its pages agree. The pin rides
 * in the cursor around the window cursor, which passes through untouched.
 */
export function decodePersonalizedCursor(raw: string | null, now = Date.now()): { asOf: string; inner: string | null } {
  if (raw?.startsWith(PERSONALIZED_CURSOR_PREFIX)) {
    const body = raw.slice(PERSONALIZED_CURSOR_PREFIX.length);
    const separator = body.indexOf(':');
    const ms = Number(separator >= 0 ? body.slice(0, separator) : NaN);
    if (Number.isSafeInteger(ms) && ms > 0) {
      return { asOf: new Date(ms).toISOString(), inner: body.slice(separator + 1) || null };
    }
  }
  return { asOf: new Date(now).toISOString(), inner: raw };
}

export function encodePersonalizedCursor(asOf: string, inner: string | null): string | null {
  if (inner === null) return null;
  return `${PERSONALIZED_CURSOR_PREFIX}${Date.parse(asOf)}:${inner}`;
}
