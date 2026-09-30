import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';

import * as React from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RECORDING_URL_STALE_MS, useRecordingPlaybackUrl } from './hooks';

const mocks = vi.hoisted(() => ({
  getRecordingUrl: vi.fn(),
  userId: 'user-a' as string | null,
}));

vi.mock('@geogenesis/auth', () => ({
  usePrivy: () => ({
    ready: true,
    authenticated: mocks.userId !== null,
    user: mocks.userId ? { id: mocks.userId } : null,
  }),
}));

vi.mock('~/core/auth/identity-token', () => ({
  getCachedIdentityToken: vi.fn(),
  useIdentityTokenSync: vi.fn(),
}));

vi.mock('./api', async importOriginal => ({
  ...(await importOriginal<typeof import('./api')>()),
  getRecordingUrl: mocks.getRecordingUrl,
}));

/**
 * GEO-2965. The signed-URL lookup was a mutation, so every card that mounted, and every return to
 * one the feed had unmounted, cost two round trips before either video could start opening.
 */
describe('useRecordingPlaybackUrl', () => {
  let signed = 0;

  beforeEach(() => {
    vi.useFakeTimers();
    signed = 0;
    mocks.userId = 'user-a';
    mocks.getRecordingUrl.mockReset();
    mocks.getRecordingUrl.mockImplementation((debateId: string, filename: string) =>
      Promise.resolve({ url: `https://r2.test/${debateId}/${filename}?sig=${++signed}` })
    );
  });

  afterEach(() => vi.useRealTimers());

  function setup() {
    const queryClient = new QueryClient();
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result, rerender } = renderHook(() => useRecordingPlaybackUrl(), { wrapper });
    return { result, rerender, queryClient };
  }

  const slot1 = { debateId: 'debate-1', filename: 'slot1.webm' };

  it('signs a recording once and hands the same URL to the next card that asks', async () => {
    const { result } = setup();

    const first = await result.current.lookup(slot1);
    const second = await result.current.lookup(slot1);

    expect(second).toEqual(first);
    expect(mocks.getRecordingUrl).toHaveBeenCalledTimes(1);
  });

  it('shares one request between two cards asking at the same moment', async () => {
    const { result } = setup();

    const [a, b] = await Promise.all([result.current.lookup(slot1), result.current.lookup(slot1)]);

    expect(a).toEqual(b);
    expect(mocks.getRecordingUrl).toHaveBeenCalledTimes(1);
  });

  it('signs each recording separately', async () => {
    const { result } = setup();

    await result.current.lookup(slot1);
    await result.current.lookup({ debateId: 'debate-1', filename: 'slot2.webm' });

    expect(mocks.getRecordingUrl).toHaveBeenCalledTimes(2);
  });

  // geo-chat's presign lasts 15 minutes and a playback keeps using its URL for the whole debate,
  // so a cached URL is only handed out while it still has most of its life left.
  it('signs again once the cached URL is too old to start a playback from', async () => {
    const { result } = setup();
    const first = await result.current.lookup(slot1);

    vi.advanceTimersByTime(RECORDING_URL_STALE_MS - 1);
    expect(await result.current.lookup(slot1)).toEqual(first);

    vi.advanceTimersByTime(2);
    const later = await result.current.lookup(slot1);

    expect(later).not.toEqual(first);
    expect(mocks.getRecordingUrl).toHaveBeenCalledTimes(2);
  });

  it('keeps the whole cache life inside the presign lifetime', () => {
    // PRESIGN_EXPIRES_DEFAULT in geo-chat's crates/attachments/src/storage.rs.
    const presignLifetimeMs = 15 * 60 * 1000;
    expect(RECORDING_URL_STALE_MS).toBeLessThanOrEqual(presignLifetimeMs / 2);
  });

  // `refreshSlotUrl` asks because the URL it holds may be what is broken. Reading the cache there
  // would hand it the same dead URL back.
  it('refresh always signs anew, and every later lookup gets the new URL', async () => {
    const { result } = setup();
    const first = await result.current.lookup(slot1);

    const refreshed = await result.current.refresh(slot1);
    expect(refreshed).not.toEqual(first);

    expect(await result.current.lookup(slot1)).toEqual(refreshed);
    expect(mocks.getRecordingUrl).toHaveBeenCalledTimes(2);
  });

  it('does not hand one viewer a URL signed for another', async () => {
    const { result, rerender } = setup();
    await result.current.lookup(slot1);

    mocks.userId = 'user-b';
    rerender();
    await result.current.lookup(slot1);

    expect(mocks.getRecordingUrl).toHaveBeenCalledTimes(2);
  });

  it('reports a failed signature to the caller instead of retrying it', async () => {
    const { result } = setup();
    mocks.getRecordingUrl.mockRejectedValueOnce(new Error('recording_not_found'));

    await expect(result.current.lookup(slot1)).rejects.toThrow('recording_not_found');
    expect(mocks.getRecordingUrl).toHaveBeenCalledTimes(1);

    // And the failure is not cached: the next activation asks again.
    await result.current.lookup(slot1);
    expect(mocks.getRecordingUrl).toHaveBeenCalledTimes(2);
  });
});
