import { bearerToken, verifyPrivyIdentityToken } from '~/core/auth/server/privy-identity-token';
import { resolveMemberSpaceFromWalletSafe } from '~/core/browse/resolve-member-space-from-wallet';
import { geoChatBaseUrl } from '~/core/debates/server/geo-chat-base-url';
import { normId } from '~/core/utils/norm-id';

import { GEO_CHAT_AUTHORIZATION_HEADER } from './ranking-lab-types';

/**
 * Who may use the ranking lab (GEO-3221): exactly the people who may use the debate scheduling
 * admin, by asking the same gate rather than keeping a second list.
 *
 * geo-chat holds that allowlist (personal space ids, GEO-2967) and answers it on its `/admin/*`
 * routes, which take a geo-chat session token rather than the Privy token, so the client sends
 * both: its Privy identity token in `Authorization`, as Explore's feed already does, and its
 * geo-chat access token in {@link GEO_CHAT_AUTHORIZATION_HEADER}. Then, before anything is read
 * or written:
 *
 * 1. The Privy token is verified here (ES256 against Privy's JWKS), giving the wallet.
 * 2. geo-chat is asked a cheap admin read with the geo-chat token: 200 is an admin, 403 (off the
 *    list) or 503 (no admins configured) is not.
 * 3. The two must be one person: the wallet's personal space has to be the space geo-chat's token
 *    names. That space id is who the config history records.
 *
 * A definite answer is cached per token pair for a minute; an error from geo-chat is not an answer
 * and is never cached. Nothing the client says about itself is trusted.
 */

const ADMIN_PROBE_PATH = '/admin/debate-schedules?limit=1&offset=0';
const ADMIN_PROBE_TIMEOUT_MS = 5_000;
const ADMIN_CACHE_TTL_MS = 60_000;
const ADMIN_CACHE_MAX_ENTRIES = 64;

export type RankingLabAdmin = { spaceId: string; geoChatUserId: string | null };

export type RankingLabAdminResult =
  { ok: true; admin: RankingLabAdmin } | { ok: false; status: 401 | 403 | 503; code: string };

type Deps = {
  verify?: typeof verifyPrivyIdentityToken;
  resolveSpace?: typeof resolveMemberSpaceFromWalletSafe;
  fetcher?: typeof fetch;
  appId?: string | undefined;
  now?: () => number;
};

const cache = new Map<string, { expiresAtMs: number; result: RankingLabAdminResult }>();

export function resetRankingLabAdminCacheForTests() {
  cache.clear();
}

/** The payload of a JWT whose signature someone else (geo-chat) has just checked. */
function jwtPayload(token: string): Record<string, unknown> | null {
  const segment = token.split('.')[1];
  if (!segment) return null;
  try {
    const json = Buffer.from(segment.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    const parsed = JSON.parse(json) as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

async function cacheKey(privyToken: string, geoChatToken: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${privyToken}\n${geoChatToken}`));
  return Buffer.from(digest).toString('hex');
}

export async function requireRankingLabAdmin(request: Request, deps: Deps = {}): Promise<RankingLabAdminResult> {
  const privyToken = bearerToken(request.headers.get('authorization'));
  const geoChatToken = bearerToken(request.headers.get(GEO_CHAT_AUTHORIZATION_HEADER));
  if (!privyToken || !geoChatToken) return { ok: false, status: 401, code: 'sign_in_required' };
  const appId = 'appId' in deps ? deps.appId : process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  if (!appId) return { ok: false, status: 503, code: 'auth_not_configured' };

  const now = deps.now ?? Date.now;
  const key = await cacheKey(privyToken, geoChatToken);
  const cached = cache.get(key);
  if (cached && cached.expiresAtMs > now()) return cached.result;
  if (cached) cache.delete(key);

  const remember = (result: RankingLabAdminResult) => {
    cache.set(key, { expiresAtMs: now() + ADMIN_CACHE_TTL_MS, result });
    while (cache.size > ADMIN_CACHE_MAX_ENTRIES) {
      const oldest = cache.keys().next().value;
      if (typeof oldest !== 'string') break;
      cache.delete(oldest);
    }
    return result;
  };

  const identity = await (deps.verify ?? verifyPrivyIdentityToken)(privyToken, { appId });
  if (!identity?.walletAddress) return { ok: false, status: 401, code: 'invalid_identity_token' };

  let probe: Response;
  try {
    probe = await (deps.fetcher ?? fetch)(`${geoChatBaseUrl()}${ADMIN_PROBE_PATH}`, {
      headers: { Authorization: `Bearer ${geoChatToken}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(ADMIN_PROBE_TIMEOUT_MS),
    });
  } catch {
    return { ok: false, status: 503, code: 'admin_check_unavailable' };
  }
  if (probe.status === 401) return { ok: false, status: 401, code: 'geo_chat_session_invalid' };
  if (probe.status === 403) return remember({ ok: false, status: 403, code: 'not_admin' });
  // geo-chat answers 503 both when no admins are configured and when it is briefly unavailable, so
  // a 503 is "not admin" for this request only: caching it would lock admins out for a minute.
  if (probe.status === 503) return { ok: false, status: 403, code: 'not_admin' };
  if (!probe.ok) return { ok: false, status: 503, code: 'admin_check_unavailable' };

  const claims = jwtPayload(geoChatToken);
  const claimedSpace = typeof claims?.profile_space_id === 'string' ? normId(claims.profile_space_id) : null;
  const walletSpace = await (deps.resolveSpace ?? resolveMemberSpaceFromWalletSafe)(identity.walletAddress);
  if (!claimedSpace || !walletSpace || normId(walletSpace) !== claimedSpace) {
    return remember({ ok: false, status: 403, code: 'identity_mismatch' });
  }

  return remember({
    ok: true,
    admin: {
      spaceId: claimedSpace,
      geoChatUserId: typeof claims?.user_id === 'string' ? claims.user_id : null,
    },
  });
}
