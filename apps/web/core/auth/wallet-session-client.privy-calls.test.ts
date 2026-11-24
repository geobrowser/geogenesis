import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * With the real shared token cache: a lasting session failure must not make the debates/calls poll
 * call Privy's `users/me` (`getIdentityToken`) more than a fixed few times per page.
 */

const mocks = vi.hoisted(() => ({ privyFetches: 0 }));

function jwt(n: number) {
  const payload = btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600, n }));
  return `h.${payload}.s`;
}

vi.mock('~/core/wallet/auth-hooks', () => ({
  getIdentityToken: async () => jwt(++mocks.privyFetches),
  useIdentityToken: () => ({ identityToken: null }),
}));

const { getCachedIdentityToken, setCachedIdentityToken } = await import('./identity-token');
const {
  NO_WALLET_RETRY_DELAYS_MS,
  SESSION_RETRY_DELAYS_MS,
  noteEmbeddedWallet,
  resetWalletSessionClientForTests,
  syncWalletSession,
} = await import('./wallet-session-client');

beforeEach(() => {
  vi.useFakeTimers();
  resetWalletSessionClientForTests();
  mocks.privyFetches = 0;
  setCachedIdentityToken(jwt(0));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe.each([
  ['invalid_token', 401, false, 1],
  ['unavailable', 503, false, 1],
  ['no_wallet', 403, false, NO_WALLET_RETRY_DELAYS_MS.length],
  ['no_wallet', 403, true, NO_WALLET_RETRY_DELAYS_MS.length + 1],
] as const)('a lasting %s (wallet seen: %s)', (status, code, walletSeen, maxCalls) => {
  it(`costs at most ${maxCalls} users/me calls per page`, async () => {
    if (walletSeen) noteEmbeddedWallet(() => {});
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ wallet: null, status }), { status: code }))
    );

    // A debates page polling every 2s for two minutes, posting whatever token it holds.
    for (let tick = 0; tick < 60; tick += 1) {
      const token = await getCachedIdentityToken();
      if (token) await syncWalletSession(token, () => {});
      await vi.advanceTimersByTimeAsync(2_000);
    }
    await vi.advanceTimersByTimeAsync(SESSION_RETRY_DELAYS_MS[1] * 2);

    expect(mocks.privyFetches).toBeLessThanOrEqual(maxCalls);
  });
});
