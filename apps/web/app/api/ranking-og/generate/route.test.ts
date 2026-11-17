import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  jar: new Map<string, string>(),
  ipLimit: vi.fn(async () => ({ ok: true }) as { ok: true } | { ok: false; retryAfter: number }),
  walletLimit: vi.fn(async () => ({ ok: true }) as const),
  canEdit: vi.fn(async () => true),
  personalData: vi.fn(async () => null),
}));

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (mocks.jar.has(name) ? { name, value: mocks.jar.get(name)! } : undefined),
  }),
}));
vi.mock('../rate-limit', () => ({
  checkRankingOgGenerateIpRateLimit: mocks.ipLimit,
  checkRankingOgWalletRateLimit: mocks.walletLimit,
  getClientIp: () => '203.0.113.7',
}));
vi.mock('../auth', async importOriginal => ({
  ...(await importOriginal<typeof import('../auth')>()),
  walletCanEditSpace: mocks.canEdit,
}));
vi.mock('~/core/blocks/ranking/ranking-og-data', () => ({
  getRankingOgCardData: mocks.personalData,
  getGlobalRankingOgCardData: vi.fn(async () => null),
}));

const { POST } = await import('./route');
const { LEGACY_WALLET_ADDRESS, WALLET_SESSION, signWalletSession } = await import('~/core/cookie/wallet-session');

const EDITOR = '0x' + '4'.repeat(40);
const ID = 'a'.repeat(32);

function request() {
  return new Request('https://example.test/api/ranking-og/generate', {
    method: 'POST',
    headers: { host: 'example.test', origin: 'https://example.test' },
    body: JSON.stringify({
      scope: 'personal',
      blockEntityId: ID,
      blockEntitySpaceId: ID,
      rankEntityId: ID,
      authorSpaceId: ID,
      ogVersion: 'v1',
      variants: ['landscape'],
    }),
  });
}

beforeEach(() => {
  mocks.jar.clear();
  vi.clearAllMocks();
});

describe('POST /api/ranking-og/generate', () => {
  it.each([
    ['a legacy bare-address cookie', () => mocks.jar.set(LEGACY_WALLET_ADDRESS, EDITOR)],
    [
      'a hand-made session cookie',
      () => mocks.jar.set(WALLET_SESSION, `v1.${EDITOR}.${Math.floor(Date.now() / 1000)}.x`),
    ],
  ])('refuses %s naming an editor', async (_label, forge) => {
    forge();
    const res = await POST(request());
    expect(res.status).toBe(403);
    expect(mocks.walletLimit).not.toHaveBeenCalled();
    expect(mocks.canEdit).not.toHaveBeenCalled();
  });

  it('caps requests per IP before reading the session', async () => {
    mocks.ipLimit.mockResolvedValueOnce({ ok: false, retryAfter: 30 });
    const res = await POST(request());
    expect(res.status).toBe(429);
    expect(mocks.walletLimit).not.toHaveBeenCalled();
  });

  it('lets a verified editor through to the editor check', async () => {
    mocks.jar.set(WALLET_SESSION, signWalletSession(EDITOR)!);
    const res = await POST(request());
    expect(mocks.walletLimit).toHaveBeenCalledWith(EDITOR);
    expect(mocks.canEdit).toHaveBeenCalledWith(EDITOR, ID);
    // No card data in this test, so it stops right after the checks.
    expect(res.status).toBe(400);
  });
});
