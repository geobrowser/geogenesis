import { afterEach, describe, expect, it, vi } from 'vitest';

import { downloadSocialVideo } from './social-video-share';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('downloadSocialVideo', () => {
  it('streams the MP4 and reports determinate byte progress when content length is present', async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2]));
        controller.enqueue(new Uint8Array([3, 4]));
        controller.close();
      },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(stream, {
          status: 200,
          headers: { 'content-length': '4', 'content-type': 'video/mp4' },
        })
      )
    );
    const progress = vi.fn();

    const blob = await downloadSocialVideo('https://video.test/social.mp4', new AbortController().signal, progress);

    expect(blob.type).toBe('video/mp4');
    expect(blob.size).toBe(4);
    expect(progress.mock.calls.map(([value]) => value)).toEqual([
      { receivedBytes: 0, totalBytes: 4 },
      { receivedBytes: 2, totalBytes: 4 },
      { receivedBytes: 4, totalBytes: 4 },
    ]);
  });

  it('keeps progress indeterminate when content length is unavailable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { 'content-type': 'application/octet-stream' },
        })
      )
    );
    const progress = vi.fn();

    const blob = await downloadSocialVideo('https://video.test/social.mp4', new AbortController().signal, progress);

    expect(blob.type).toBe('video/mp4');
    expect(progress.mock.calls.every(([value]) => value.totalBytes === null)).toBe(true);
  });

  it('surfaces failed downloads as retryable preparation errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 503 })));

    await expect(
      downloadSocialVideo('https://video.test/social.mp4', new AbortController().signal, vi.fn())
    ).rejects.toThrow('Could not download the social video (503).');
  });

  it('rejects an empty or truncated successful response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(new Uint8Array([1, 2]), {
          status: 200,
          headers: { 'content-length': '4', 'content-type': 'video/mp4' },
        })
      )
    );

    await expect(
      downloadSocialVideo('https://video.test/social.mp4', new AbortController().signal, vi.fn())
    ).rejects.toThrow('The social video download was incomplete.');
  });

  it('turns a stalled request into a retryable preparation error', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string | URL | Request, init?: RequestInit) => {
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true });
        });
      })
    );

    const download = downloadSocialVideo('https://video.test/social.mp4', new AbortController().signal, vi.fn(), 1_000);
    const rejection = expect(download).rejects.toThrow(
      'Video preparation stalled. Check your connection and try again.'
    );

    await vi.advanceTimersByTimeAsync(1_000);
    await rejection;
  });
});
