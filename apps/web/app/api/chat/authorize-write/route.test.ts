import { beforeEach, describe, expect, it, vi } from 'vitest';

const jar = vi.hoisted(() => new Map<string, string>());
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined) }),
}));

const buildWriteContextMock = vi.fn();
vi.mock('../tools/write/context', () => ({
  buildWriteContext: (args: { walletAddress: string | null }) => buildWriteContextMock(args),
}));

const { POST } = await import('./route');
const { LEGACY_WALLET_ADDRESS, WALLET_SESSION, signWalletSession } = await import('~/core/cookie/wallet-session');

const WALLET = '0x' + '1'.repeat(40);
const signIn = () => jar.set(WALLET_SESSION, signWalletSession(WALLET)!);

const SPACE = '11111111111111111111111111111111';

function makeRequest(body: unknown, opts: { sameOrigin?: boolean } = {}) {
  const headers = new Headers();
  const sameOrigin = opts.sameOrigin ?? true;
  if (sameOrigin) {
    headers.set('host', 'example.test');
    headers.set('origin', 'https://example.test');
  } else {
    headers.set('host', 'example.test');
    headers.set('origin', 'https://attacker.test');
  }
  return new Request('https://example.test/api/chat/authorize-write', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  jar.clear();
  buildWriteContextMock.mockReset();
});

describe('authorize-write', () => {
  it('returns not_signed_in when no wallet cookie is set', async () => {
    buildWriteContextMock.mockReturnValue({
      kind: 'guest',
      walletAddress: null,
      isMember: async () => false,
      checkEditRateLimit: async () => ({ ok: true }),
    });
    const res = await POST(makeRequest({ spaceId: SPACE, toolName: 'setEntityValue' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: false, error: 'not_signed_in' });
  });

  it('passes the verified session wallet to the write context', async () => {
    signIn();
    buildWriteContextMock.mockReturnValue({ kind: 'guest', walletAddress: null, isMember: async () => false });
    await POST(makeRequest({ spaceId: SPACE, toolName: 'setEntityValue' }));
    expect(buildWriteContextMock).toHaveBeenCalledWith({ walletAddress: WALLET });
  });

  it.each([
    ['a legacy bare-address cookie', () => jar.set(LEGACY_WALLET_ADDRESS, WALLET)],
    ['a hand-made session cookie', () => jar.set(WALLET_SESSION, `v1.${WALLET}.${Math.floor(Date.now() / 1000)}.x`)],
  ])('treats %s as signed out', async (_label, forge) => {
    forge();
    buildWriteContextMock.mockReturnValue({ kind: 'guest', walletAddress: null, isMember: async () => false });
    const res = await POST(makeRequest({ spaceId: SPACE, toolName: 'setEntityValue' }));
    expect(buildWriteContextMock).toHaveBeenCalledWith({ walletAddress: null });
    expect(await res.json()).toEqual({ ok: false, error: 'not_signed_in' });
  });

  it('returns not_authorized for a member who does not belong to the target space', async () => {
    signIn();
    buildWriteContextMock.mockReturnValue({
      kind: 'member',
      walletAddress: '0x' + '1'.repeat(40),
      personalSpaceId: async () => null,
      isMember: async () => false,
      checkEditRateLimit: async () => ({ ok: true }),
    });
    const res = await POST(makeRequest({ spaceId: SPACE, toolName: 'setEntityValue' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: false, error: 'not_authorized', spaceId: SPACE });
  });

  it('returns rate_limited when the edit limiter is exhausted', async () => {
    signIn();
    buildWriteContextMock.mockReturnValue({
      kind: 'member',
      walletAddress: '0x' + '1'.repeat(40),
      personalSpaceId: async () => null,
      isMember: async () => true,
      checkEditRateLimit: async () => ({ ok: false, retryAfter: 7 }),
    });
    const res = await POST(makeRequest({ spaceId: SPACE, toolName: 'setEntityValue' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: false, error: 'rate_limited', retryAfter: 7 });
  });

  it('passes for a member under the limit', async () => {
    signIn();
    buildWriteContextMock.mockReturnValue({
      kind: 'member',
      walletAddress: '0x' + '1'.repeat(40),
      personalSpaceId: async () => null,
      isMember: async () => true,
      checkEditRateLimit: async () => ({ ok: true }),
    });
    const res = await POST(makeRequest({ spaceId: SPACE, toolName: 'setEntityValue' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('toggleEditMode is space-agnostic but still consults the edit limiter', async () => {
    let limiterChecked = false;
    signIn();
    buildWriteContextMock.mockReturnValue({
      kind: 'member',
      walletAddress: '0x' + '1'.repeat(40),
      personalSpaceId: async () => null,
      isMember: async () => true,
      checkEditRateLimit: async () => {
        limiterChecked = true;
        return { ok: true };
      },
    });
    const res = await POST(makeRequest({ toolName: 'toggleEditMode' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(limiterChecked).toBe(true);
  });

  it('rejects unknown toolName', async () => {
    const res = await POST(makeRequest({ spaceId: SPACE, toolName: 'notARealTool' }));
    expect(res.status).toBe(400);
  });

  it('rejects missing spaceId for non-toggle tools', async () => {
    const res = await POST(makeRequest({ toolName: 'setEntityValue' }));
    expect(res.status).toBe(400);
  });

  it('rejects same-host requests with a mismatched origin', async () => {
    // isSameOrigin compares the Origin header's host to the Host header.
    // A mismatched origin fails the check regardless of NODE_ENV (the env
    // branch only matters for missing-origin requests in tests / dev).
    const res = await POST(makeRequest({ spaceId: SPACE, toolName: 'setEntityValue' }, { sameOrigin: false }));
    expect(res.status).toBe(403);
  });
});
