import { beforeEach, describe, expect, it, vi } from 'vitest';

/** A forged cookie must never reach `loggedInLimit`: it would spend the named wallet's allowance. */

const mocks = vi.hoisted(() => {
  const blocked = async () => ({ success: false, reset: Date.now() + 60_000, limit: 0, remaining: 0 });
  return {
    jar: new Map<string, string>(),
    loggedIn: vi.fn(blocked),
    anon: vi.fn(blocked),
    ipCeiling: vi.fn(blocked),
  };
});

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (mocks.jar.has(name) ? { name, value: mocks.jar.get(name)! } : undefined),
  }),
}));
vi.mock('./rate-limit', () => ({
  loggedInLimit: { limit: mocks.loggedIn },
  anonLimit: { limit: mocks.anon },
  ipCeilingLimit: { limit: mocks.ipCeiling },
  editLimit: { limit: mocks.loggedIn },
}));

const { LEGACY_WALLET_ADDRESS, WALLET_SESSION, signWalletSession } = await import('~/core/cookie/wallet-session');

const WALLET = '0x' + '3'.repeat(40);

type Handler = (req: Request, ctx?: unknown) => Promise<Response>;
const ROUTES: [string, () => Promise<Handler>][] = [
  ['chat', async () => (await import('./route')).POST],
  ['compact', async () => (await import('./compact/route')).POST],
  ['research', async () => (await import('./research/route')).POST],
  ['title', async () => (await import('./title/route')).POST],
  ['inject', async () => (await import('./inject/route')).POST],
  ['inject/[jobId]', async () => (await import('./inject/[jobId]/route')).GET as Handler],
  ['inject-followups', async () => (await import('./inject-followups/route')).POST],
  ['proxy-image', async () => (await import('./proxy-image/route')).POST],
  ['search-images', async () => (await import('./search-images/route')).POST],
  ['web-fetch', async () => (await import('./web-fetch/route')).POST],
  ['classify-url', async () => (await import('./classify-url/route')).POST],
];

function request() {
  return new Request('https://example.test/api/chat', {
    method: 'POST',
    headers: { host: 'example.test', origin: 'https://example.test', 'x-forwarded-for': '203.0.113.7' },
    // A body every route accepts up to its limiter (classify-url validates the url first).
    body: JSON.stringify({ url: 'https://example.com/article' }),
  });
}

const ctx = { params: Promise.resolve({ jobId: '00000000-0000-0000-0000-000000000000' }) };

beforeEach(() => {
  mocks.jar.clear();
  mocks.loggedIn.mockClear();
  mocks.anon.mockClear();
  mocks.ipCeiling.mockClear();
});

describe.each(ROUTES)('%s route', (_name, load) => {
  it.each([
    ['legacy bare-address cookie', () => mocks.jar.set(LEGACY_WALLET_ADDRESS, WALLET)],
    [
      'hand-made session cookie',
      () => mocks.jar.set(WALLET_SESSION, `v1.${WALLET}.${Math.floor(Date.now() / 1000)}.x`),
    ],
  ])('gives a %s no signed-in allowance', async (_label, forge) => {
    forge();
    const handler = await load();
    await handler(request(), ctx);
    expect(mocks.loggedIn).not.toHaveBeenCalled();
  });

  it('keys the signed-in limit on a verified session', async () => {
    mocks.jar.set(WALLET_SESSION, signWalletSession(WALLET)!);
    const handler = await load();
    await handler(request(), ctx);
    expect(mocks.loggedIn).toHaveBeenCalledWith(WALLET);
  });
});
