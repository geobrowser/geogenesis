import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  MIN_REMAINING_MS,
  presignedRemainingMs,
  resetStillResolutionsForTests,
  resolveStillUrl,
} from './resolve-still-redirect';

const DURABLE = 'https://chat.example/debates/d1/media/artifacts/speaker_still_slot_1/content';
const NOW = Date.parse('2026-10-19T20:00:00Z');

const signed = (date: string, expires = 21600) =>
  `https://acct.r2.cloudflarestorage.com/geo-chat/media/u/speaker_still_slot_1/h.jpg?X-Amz-Date=${date}&X-Amz-Expires=${expires}&X-Amz-Signature=abc`;

const redirect = (location: string | null, status = 302) =>
  vi.fn(async () => new Response(null, { status, headers: location ? { location } : {} })) as unknown as typeof fetch;

beforeEach(() => resetStillResolutionsForTests());
afterEach(() => vi.restoreAllMocks());

describe('presignedRemainingMs', () => {
  it('reads the validity left from the URL itself', () => {
    expect(presignedRemainingMs(signed('20261019T200000Z'), NOW)).toBe(21600 * 1000);
    expect(presignedRemainingMs(signed('20261019T170000Z'), NOW)).toBe(3 * 3600 * 1000);
  });

  it('is null when the URL does not say', () => {
    expect(presignedRemainingMs(DURABLE, NOW)).toBeNull();
    expect(presignedRemainingMs('not a url', NOW)).toBeNull();
  });
});

describe('resolveStillUrl', () => {
  it('returns the presigned target of the redirect, asking for it without following it', async () => {
    const target = signed('20261019T200000Z');
    const fetchImpl = redirect(target);
    expect(await resolveStillUrl(DURABLE, { fetchImpl, nowMs: () => NOW })).toBe(target);
    expect(fetchImpl).toHaveBeenCalledWith(DURABLE, expect.objectContaining({ redirect: 'manual', cache: 'no-store' }));
  });

  it('reuses a resolution instead of asking geo-chat again', async () => {
    const fetchImpl = redirect(signed('20261019T200000Z'));
    await resolveStillUrl(DURABLE, { fetchImpl, nowMs: () => NOW });
    await resolveStillUrl(DURABLE, { fetchImpl, nowMs: () => NOW + 60_000 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('keeps the durable URL when the answer is not a redirect', async () => {
    expect(await resolveStillUrl(DURABLE, { fetchImpl: redirect(null, 404), nowMs: () => NOW })).toBe(DURABLE);
    expect(await resolveStillUrl(DURABLE, { fetchImpl: redirect(null, 200), nowMs: () => NOW })).toBe(DURABLE);
  });

  it('does not remember a failure', async () => {
    await resolveStillUrl(DURABLE, { fetchImpl: redirect(null, 503), nowMs: () => NOW });
    const target = signed('20261019T200000Z');
    expect(await resolveStillUrl(DURABLE, { fetchImpl: redirect(target), nowMs: () => NOW })).toBe(target);
  });

  it('keeps the durable URL when the request fails or times out', async () => {
    const timedOut = vi.fn(async () => {
      throw new DOMException('timed out', 'TimeoutError');
    }) as unknown as typeof fetch;
    expect(await resolveStillUrl(DURABLE, { fetchImpl: timedOut, nowMs: () => NOW })).toBe(DURABLE);
  });

  it('keeps the durable URL when too little of the signature is left', async () => {
    const short = signed('20261019T200000Z', Math.floor(MIN_REMAINING_MS / 1000) - 60);
    expect(await resolveStillUrl(DURABLE, { fetchImpl: redirect(short), nowMs: () => NOW })).toBe(DURABLE);
  });

  it('keeps the durable URL for a target that is not a presigned https URL', async () => {
    expect(
      await resolveStillUrl(DURABLE, { fetchImpl: redirect('https://other.example/x.jpg'), nowMs: () => NOW })
    ).toBe(DURABLE);
    expect(
      await resolveStillUrl(DURABLE, {
        fetchImpl: redirect(signed('20261019T200000Z').replace('https:', 'http:')),
        nowMs: () => NOW,
      })
    ).toBe(DURABLE);
  });

  it('stops using a cached resolution once its signature has run down', async () => {
    const target = signed('20261019T200000Z');
    await resolveStillUrl(DURABLE, { fetchImpl: redirect(target), nowMs: () => NOW });
    const later = NOW + 2 * 3600 * 1000; // 4h left: under the floor less the cache lifetime
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    expect(await resolveStillUrl(DURABLE, { fetchImpl: redirect(target), nowMs: () => later })).toBe(DURABLE);
    vi.useRealTimers();
  });
});
