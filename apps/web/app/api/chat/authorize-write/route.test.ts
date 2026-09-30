import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockCookieValue = vi.fn<() => string | undefined>(() => undefined);
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => ({ value: mockCookieValue() }) }),
}));

const buildWriteContextMock = vi.fn();
vi.mock('../tools/write/context', () => ({
  buildWriteContext: (args: { walletAddress: string | null }) => buildWriteContextMock(args),
}));

const { POST } = await import('./route');
const { signWalletSession } = await import('~/core/cookie/wallet-session');

const WALLET = '0x' + '1'.repeat(40);

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
  vi.stubEnv('WALLET_SESSION_SECRET', 'test-secret');
  mockCookieValue.mockReset();
  buildWriteContextMock.mockReset();
});

afterEach(() => vi.unstubAllEnvs());

describe('authorize-write', () => {
  const guest = {
    kind: 'guest',
    walletAddress: null,
    isMember: async () => false,
    checkEditRateLimit: async () => ({ ok: true }),
  };

  it('identifies the caller by the wallet in a signed session', async () => {
    mockCookieValue.mockReturnValue(signWalletSession(WALLET)!);
    buildWriteContextMock.mockReturnValue(guest);

    await POST(makeRequest({ spaceId: SPACE, toolName: 'setEntityValue' }));

    expect(buildWriteContextMock).toHaveBeenCalledWith({ walletAddress: WALLET });
  });

  // GEO-3107: a bare address in the cookie used to be taken at its word.
  it('treats a hand-written wallet cookie as signed out', async () => {
    mockCookieValue.mockReturnValue(WALLET);
    buildWriteContextMock.mockReturnValue(guest);

    const res = await POST(makeRequest({ spaceId: SPACE, toolName: 'setEntityValue' }));

    expect(buildWriteContextMock).toHaveBeenCalledWith({ walletAddress: null });
    expect(await res.json()).toEqual({ ok: false, error: 'not_signed_in' });
  });

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

  it('returns not_authorized for a member who does not belong to the target space', async () => {
    mockCookieValue.mockReturnValue(signWalletSession(WALLET)!);
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
    mockCookieValue.mockReturnValue(signWalletSession(WALLET)!);
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
    mockCookieValue.mockReturnValue(signWalletSession(WALLET)!);
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
    mockCookieValue.mockReturnValue(signWalletSession(WALLET)!);
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
