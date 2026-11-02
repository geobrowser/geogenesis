import { beforeEach, describe, expect, it, vi } from 'vitest';

import { requireRankingLabAdmin, resetRankingLabAdminCacheForTests } from './ranking-lab-admin';
import { GEO_CHAT_AUTHORIZATION_HEADER } from './ranking-lab-types';

const SPACE = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const WALLET = '0x00000000000000000000000000000000000000aa';

function geoChatToken(claims: Record<string, unknown>) {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'HS256' })}.${encode(claims)}.sig`;
}

function request(headers: Record<string, string>) {
  return new Request('https://example.test/api/explore/ranking-lab', { headers });
}

function signedIn(token = geoChatToken({ profile_space_id: SPACE, user_id: 'u1' }), privy = 'privy-token') {
  return request({ authorization: `Bearer ${privy}`, [GEO_CHAT_AUTHORIZATION_HEADER]: `Bearer ${token}` });
}

const verify = vi.fn(async () => ({ userId: 'did:privy:1', walletAddress: WALLET }));
const resolveSpace = vi.fn(async () => SPACE);
const status = (code: number) => vi.fn(async () => new Response('{}', { status: code }));
const deps = (fetcher: typeof fetch) => ({ verify, resolveSpace, fetcher, appId: 'app' });

beforeEach(() => {
  resetRankingLabAdminCacheForTests();
  verify.mockClear();
  resolveSpace.mockClear();
});

describe('the ranking lab admin gate', () => {
  it('asks geo-chat with the geo-chat token and lets an admin in as their space', async () => {
    const fetcher = status(200);
    const result = await requireRankingLabAdmin(signedIn(), deps(fetcher));
    expect(result).toEqual({ ok: true, admin: { spaceId: SPACE, geoChatUserId: 'u1' } });
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('/admin/debate-schedules');
    expect((init.headers as Record<string, string>).Authorization).toMatch(/^Bearer /);
  });

  it('needs both tokens', async () => {
    const fetcher = status(200);
    expect(await requireRankingLabAdmin(request({}), deps(fetcher))).toMatchObject({ ok: false, status: 401 });
    expect(await requireRankingLabAdmin(request({ authorization: 'Bearer privy' }), deps(fetcher))).toMatchObject({
      ok: false,
      status: 401,
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('refuses a Privy token that does not verify, before asking geo-chat', async () => {
    const fetcher = status(200);
    verify.mockResolvedValueOnce(null as never);
    expect(await requireRankingLabAdmin(signedIn(), deps(fetcher))).toMatchObject({ ok: false, status: 401 });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([403, 503])('refuses when geo-chat answers %i', async code => {
    expect(await requireRankingLabAdmin(signedIn(), deps(status(code)))).toMatchObject({
      ok: false,
      status: 403,
      code: 'not_admin',
    });
  });

  it('does not cache a 503, so an admin is let in once geo-chat answers again', async () => {
    expect(await requireRankingLabAdmin(signedIn(), deps(status(503)))).toMatchObject({ ok: false, code: 'not_admin' });
    expect(await requireRankingLabAdmin(signedIn(), deps(status(200)))).toMatchObject({ ok: true });
  });

  it('caches a 403', async () => {
    const fetcher = status(403);
    await requireRankingLabAdmin(signedIn(), deps(fetcher));
    await requireRankingLabAdmin(signedIn(), deps(fetcher));
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('refuses when the two tokens belong to different people', async () => {
    const token = geoChatToken({ profile_space_id: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', user_id: 'u2' });
    expect(await requireRankingLabAdmin(signedIn(token), deps(status(200)))).toMatchObject({
      ok: false,
      status: 403,
      code: 'identity_mismatch',
    });
  });

  it('treats a geo-chat failure as no answer, and does not cache it', async () => {
    const failing = vi.fn(async () => {
      throw new Error('down');
    });
    expect(await requireRankingLabAdmin(signedIn(), deps(failing as never))).toMatchObject({
      ok: false,
      status: 503,
    });
    expect(await requireRankingLabAdmin(signedIn(), deps(status(200)))).toMatchObject({ ok: true });
  });

  it('caches a definite answer per token pair', async () => {
    const fetcher = status(200);
    await requireRankingLabAdmin(signedIn(), deps(fetcher));
    await requireRankingLabAdmin(signedIn(), deps(fetcher));
    expect(fetcher).toHaveBeenCalledTimes(1);
    await requireRankingLabAdmin(signedIn(undefined, 'another-privy-token'), deps(fetcher));
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('is closed when Privy is not configured', async () => {
    expect(await requireRankingLabAdmin(signedIn(), { ...deps(status(200)), appId: undefined })).toMatchObject({
      ok: false,
      status: 503,
    });
  });
});
