import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  jar: new Map<string, string>(),
  resolve: vi.fn(async () => 'person-space'),
  fetch: vi.fn(async () => new Response(JSON.stringify([{ rsvpStatus: 'accepted' }]))),
}));

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (mocks.jar.has(name) ? { name, value: mocks.jar.get(name)! } : undefined),
  }),
}));
vi.mock('~/core/browse/resolve-member-space-from-wallet', () => ({ resolveMemberSpaceFromWallet: mocks.resolve }));

const { GET } = await import('./route');
const { LEGACY_WALLET_ADDRESS, WALLET_SESSION, signWalletSession } = await import('~/core/auth/server/wallet-session');

const WALLET = '0x' + '5'.repeat(40);

beforeEach(() => {
  mocks.jar.clear();
  vi.clearAllMocks();
  vi.stubEnv('CURATOR_BACKEND_URL', 'https://curator.test');
  vi.stubGlobal('fetch', mocks.fetch);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('GET /api/community-call/rsvp-status', () => {
  it.each([
    ['a legacy bare-address cookie', () => mocks.jar.set(LEGACY_WALLET_ADDRESS, WALLET)],
    [
      'a hand-made session cookie',
      () => mocks.jar.set(WALLET_SESSION, `v1.${WALLET}.${Math.floor(Date.now() / 1000)}.x`),
    ],
  ])("does not look up another person's RSVPs for %s", async (_label, forge) => {
    forge();
    const res = await GET();
    expect(await res.json()).toEqual({ hasRsvp: false, configured: true });
    expect(mocks.resolve).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('looks up the verified wallet', async () => {
    mocks.jar.set(WALLET_SESSION, signWalletSession(WALLET)!);
    await GET();
    expect(mocks.resolve).toHaveBeenCalledWith(expect.stringMatching(new RegExp(`^${WALLET}$`, 'i')));
  });
});
