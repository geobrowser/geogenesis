import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { downloadSocialVideo, handoffPreparedSocialVideo } from './social-video-share';

const mocks = vi.hoisted(() => ({
  capture: vi.fn(),
  share: vi.fn(),
  canShare: vi.fn(),
  downloadClick: vi.fn(),
}));

vi.mock('~/core/analytics', () => ({ capture: mocks.capture }));

const preparedFile = new File([new Uint8Array([1, 2, 3])], 'debate-debate-1-social.mp4', {
  type: 'video/mp4',
});

beforeEach(() => {
  vi.resetAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('handoffPreparedSocialVideo', () => {
  it('probes only the file payload and shares only the claim title and MP4', async () => {
    mocks.canShare.mockReturnValue(true);
    mocks.share.mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: mocks.canShare });
    Object.defineProperty(navigator, 'share', { configurable: true, value: mocks.share });

    const handoff = handoffPreparedSocialVideo({
      debateId: 'debate-1',
      title: 'Debates are useful',
      file: preparedFile,
      downloadUrl: 'blob:https://geo.test/social-video',
    });

    expect(mocks.canShare).toHaveBeenCalledWith({ files: [preparedFile] });
    expect(mocks.share).toHaveBeenCalledWith({ title: 'Debates are useful', files: [preparedFile] });
    await expect(handoff).resolves.toBe('native_share');
    expect(mocks.capture).toHaveBeenCalledWith('debate_social_video_handoff_resolved', {
      debate_id: 'debate-1',
      method: 'native_share',
    });
  });

  // Preston, on production: "Failed to execute 'share' on 'Navigator': Permission denied".
  //
  // `canShare` said yes and `share` refused anyway, which it is allowed to do — the probe answers
  // whether the payload is shareable in principle, not whether this browser will accept it. The
  // click should still hand over the video rather than surfacing a dead end.
  it('falls back to the download when the browser refuses a share it said it could do', async () => {
    mocks.canShare.mockReturnValue(true);
    mocks.share.mockRejectedValue(
      new DOMException("Failed to execute 'share' on 'Navigator': Permission denied", 'NotAllowedError')
    );
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: mocks.canShare });
    Object.defineProperty(navigator, 'share', { configurable: true, value: mocks.share });

    await expect(
      handoffPreparedSocialVideo({
        debateId: 'debate-1',
        title: 'Debates are useful',
        file: preparedFile,
        downloadUrl: 'blob:https://geo.test/social-video',
      })
    ).resolves.toBe('download');

    // Reported as a resolved handoff, tagged so the rate of it is visible rather than inferred.
    expect(mocks.capture).toHaveBeenCalledWith('debate_social_video_handoff_resolved', {
      debate_id: 'debate-1',
      method: 'download',
      fell_back_from: 'native_share',
      error_name: 'NotAllowedError',
    });
  });

  // The one refusal that must not fall back: closing the share sheet is a decision, and quietly
  // downloading the file instead would override it.
  it('does not download when the person cancels the share sheet', async () => {
    mocks.canShare.mockReturnValue(true);
    mocks.share.mockRejectedValue(new DOMException('Share canceled', 'AbortError'));
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: mocks.canShare });
    Object.defineProperty(navigator, 'share', { configurable: true, value: mocks.share });

    await expect(
      handoffPreparedSocialVideo({
        debateId: 'debate-1',
        title: 'Debates are useful',
        file: preparedFile,
        downloadUrl: 'blob:https://geo.test/social-video',
      })
    ).rejects.toThrow('Share canceled');
    expect(mocks.capture).not.toHaveBeenCalledWith(
      'debate_social_video_handoff_resolved',
      expect.objectContaining({ method: 'download' })
    );
  });

  it.each([
    ['unsupported', () => false],
    [
      'throwing',
      () => {
        throw new TypeError('Unsupported share payload');
      },
    ],
  ])('downloads when file sharing is %s', async (_label, capabilityProbe) => {
    mocks.canShare.mockImplementation(capabilityProbe);
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: mocks.canShare });
    Object.defineProperty(navigator, 'share', { configurable: true, value: mocks.share });
    Object.defineProperty(HTMLAnchorElement.prototype, 'click', {
      configurable: true,
      value: mocks.downloadClick,
    });

    await expect(
      handoffPreparedSocialVideo({
        debateId: 'debate-1',
        title: 'Debates are useful',
        file: preparedFile,
        downloadUrl: 'blob:https://geo.test/social-video',
      })
    ).resolves.toBe('download');

    expect(mocks.share).not.toHaveBeenCalled();
    expect(mocks.downloadClick).toHaveBeenCalledTimes(1);
    const downloadLink = mocks.downloadClick.mock.instances[0] as HTMLAnchorElement;
    expect(downloadLink.href).toBe('blob:https://geo.test/social-video');
    expect(downloadLink.download).toBe('debate-debate-1-social.mp4');
    expect(mocks.capture).toHaveBeenCalledWith('debate_social_video_handoff_resolved', {
      debate_id: 'debate-1',
      method: 'download',
    });
  });

  it('rethrows native share cancellation without failure analytics', async () => {
    const cancellation = new DOMException('Cancelled', 'AbortError');
    mocks.canShare.mockReturnValue(true);
    mocks.share.mockRejectedValue(cancellation);
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: mocks.canShare });
    Object.defineProperty(navigator, 'share', { configurable: true, value: mocks.share });

    await expect(
      handoffPreparedSocialVideo({
        debateId: 'debate-1',
        title: 'Debates are useful',
        file: preparedFile,
        downloadUrl: 'blob:https://geo.test/social-video',
      })
    ).rejects.toBe(cancellation);

    expect(mocks.capture).not.toHaveBeenCalledWith('debate_social_video_handoff_failed', expect.anything());
  });

  // Deliberately unchanged by the fallback: a generic failure might succeed next time, so the
  // error and the retry that reuses the prepared file are still the right answer. Only a refusal a
  // retry cannot change falls back — see the NotAllowedError case above.
  it('reports non-cancellation native share failures and leaves retry to the caller', async () => {
    const failure = new Error('Share service unavailable');
    mocks.canShare.mockReturnValue(true);
    mocks.share.mockRejectedValue(failure);
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: mocks.canShare });
    Object.defineProperty(navigator, 'share', { configurable: true, value: mocks.share });

    await expect(
      handoffPreparedSocialVideo({
        debateId: 'debate-1',
        title: 'Debates are useful',
        file: preparedFile,
        downloadUrl: 'blob:https://geo.test/social-video',
      })
    ).rejects.toBe(failure);

    expect(mocks.capture).toHaveBeenCalledWith('debate_social_video_handoff_failed', {
      debate_id: 'debate-1',
      method: 'native_share',
      error_name: 'Error',
    });
  });

  it('removes the temporary download link and reports a failed fallback download', async () => {
    const failure = new Error('Download blocked');
    mocks.canShare.mockReturnValue(false);
    mocks.downloadClick.mockImplementation(() => {
      throw failure;
    });
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: mocks.canShare });
    Object.defineProperty(navigator, 'share', { configurable: true, value: mocks.share });
    Object.defineProperty(HTMLAnchorElement.prototype, 'click', {
      configurable: true,
      value: mocks.downloadClick,
    });

    await expect(
      handoffPreparedSocialVideo({
        debateId: 'debate-1',
        title: 'Debates are useful',
        file: preparedFile,
        downloadUrl: 'blob:https://geo.test/social-video',
      })
    ).rejects.toBe(failure);

    expect(document.querySelector('a[download="debate-debate-1-social.mp4"]')).toBeNull();
    expect(mocks.capture).toHaveBeenCalledWith('debate_social_video_handoff_failed', {
      debate_id: 'debate-1',
      method: 'download',
      error_name: 'Error',
    });
  });
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

  it('turns browser fetch failures into an actionable preparation error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    await expect(
      downloadSocialVideo('https://video.test/social.mp4', new AbortController().signal, vi.fn())
    ).rejects.toThrow('Could not download the social video. Check your connection and try again.');
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
