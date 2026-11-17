import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  jar: new Map<string, string>(),
  resolve: vi.fn(async () => null),
  fetchFeed: vi.fn(async () => ({ items: [], nextCursor: null })),
}));

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (mocks.jar.has(name) ? { name, value: mocks.jar.get(name)! } : undefined),
  }),
}));
vi.mock('~/core/browse/resolve-member-space-from-wallet', () => ({ resolveMemberSpaceFromWalletSafe: mocks.resolve }));
vi.mock('~/core/explore/fetch-explore-feed', () => ({ fetchExploreFeed: mocks.fetchFeed }));
vi.mock('~/app/home/governance-home-space-ids', () => ({ getGovernanceHomeSpaceContext: vi.fn() }));

const { GET } = await import('./route');
const { LEGACY_WALLET_ADDRESS, WALLET_SESSION, signWalletSession } = await import('~/core/auth/server/wallet-session');

const WALLET = '0x' + '6'.repeat(40);
const request = () => new Request('https://example.test/api/activity/feed?spaceId=' + 'b'.repeat(32));

beforeEach(() => {
  mocks.jar.clear();
  vi.clearAllMocks();
});

describe('GET /api/activity/feed', () => {
  it.each([
    ['a legacy bare-address cookie', () => mocks.jar.set(LEGACY_WALLET_ADDRESS, WALLET)],
    [
      'a hand-made session cookie',
      () => mocks.jar.set(WALLET_SESSION, `v1.${WALLET}.${Math.floor(Date.now() / 1000)}.x`),
    ],
  ])('serves %s the signed-out feed', async (_label, forge) => {
    forge();
    await GET(request());
    expect(mocks.resolve).not.toHaveBeenCalled();
    expect(mocks.fetchFeed).toHaveBeenCalledWith(expect.objectContaining({ walletAddress: null }));
  });

  it('personalises for the verified wallet', async () => {
    mocks.jar.set(WALLET_SESSION, signWalletSession(WALLET)!);
    await GET(request());
    expect(mocks.resolve).toHaveBeenCalledOnce();
    expect(mocks.fetchFeed).toHaveBeenCalledWith(expect.objectContaining({ walletAddress: expect.any(String) }));
  });
});
