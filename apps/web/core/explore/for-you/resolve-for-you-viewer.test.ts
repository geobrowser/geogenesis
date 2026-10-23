import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { decodePersonalizedCursor, encodePersonalizedCursor, resolveForYouViewer } from './resolve-for-you-viewer';

const SPACE = 'AAAAAAAA-0000-4000-8000-000000000001';
const WALLET = '0xabcdef0123456789abcdef0123456789abcdef01';

const request = (authorization?: string) =>
  new Request('https://example.test/api/explore/feed', { headers: authorization ? { authorization } : {} });

describe('resolveForYouViewer', () => {
  beforeEach(() => vi.stubEnv('GAIA_INTERNAL_TOKEN', 'x'.repeat(40)));
  afterEach(() => vi.unstubAllEnvs());

  const verify = vi.fn(async (token: string | null | undefined) =>
    token === 'good' ? { userId: 'did:privy:1', walletAddress: WALLET } : null
  );

  it('uses the already-resolved space when the token proves the cookie wallet', async () => {
    const resolveSpace = vi.fn();
    await expect(
      resolveForYouViewer(
        request('Bearer good'),
        { walletAddress: WALLET.toUpperCase().replace('0X', '0x'), personalMemberSpaceId: SPACE },
        { verify, resolveSpace }
      )
    ).resolves.toBe('aaaaaaaa000040008000000000000001');
    expect(resolveSpace).not.toHaveBeenCalled();
  });

  it("resolves the token's own wallet when the cookie names someone else", async () => {
    const resolveSpace = vi.fn(async () => 'bbbbbbbb000040008000000000000002');
    await expect(
      resolveForYouViewer(
        request('Bearer good'),
        { walletAddress: '0x1111111111111111111111111111111111111111', personalMemberSpaceId: SPACE },
        { verify, resolveSpace }
      )
    ).resolves.toBe('bbbbbbbb000040008000000000000002');
    expect(resolveSpace).toHaveBeenCalledWith(WALLET);
  });

  it('refuses without a verified token, whatever the cookie says', async () => {
    const context = { walletAddress: WALLET, personalMemberSpaceId: SPACE };
    await expect(resolveForYouViewer(request(), context, { verify })).resolves.toBeNull();
    await expect(resolveForYouViewer(request('Bearer forged'), context, { verify })).resolves.toBeNull();
  });

  it('is off when gaia is not configured', async () => {
    vi.stubEnv('GAIA_INTERNAL_TOKEN', '');
    const context = { walletAddress: WALLET, personalMemberSpaceId: SPACE };
    await expect(resolveForYouViewer(request('Bearer good'), context, { verify })).resolves.toBeNull();
  });
});

describe('personalized cursor', () => {
  it('pins the first page time and carries the window cursor through', () => {
    const first = decodePersonalizedCursor(null, Date.parse('2026-10-05T12:00:00.000Z'));
    expect(first).toEqual({ asOf: '2026-10-05T12:00:00.000Z', inner: null });
    const next = encodePersonalizedCursor(first.asOf, 'w1:22:');
    expect(decodePersonalizedCursor(next)).toEqual({ asOf: '2026-10-05T12:00:00.000Z', inner: 'w1:22:' });
  });

  it('passes a plain cursor through and ends with the feed', () => {
    expect(decodePersonalizedCursor('w1:44:', 0).inner).toBe('w1:44:');
    expect(encodePersonalizedCursor('2026-10-05T12:00:00.000Z', null)).toBeNull();
  });
});
