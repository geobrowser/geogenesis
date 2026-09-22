import { act, cleanup, renderHook, waitFor } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Debate } from '~/core/debates/api';

import { useDebateSystemShare } from './use-debate-system-share';

const mocks = vi.hoisted(() => ({
  capture: vi.fn(),
  share: vi.fn(),
  canShare: vi.fn(),
  setToast: vi.fn(),
  useDebateMedia: vi.fn(),
  usePreparedSocialVideo: vi.fn(),
  preparedSocialVideoFile: vi.fn(),
}));

vi.mock('~/core/analytics', () => ({ capture: mocks.capture }));
vi.mock('~/core/hooks/use-toast', () => ({ useToast: () => [null, mocks.setToast] }));
vi.mock('~/core/debates/hooks', () => ({ useDebateMedia: mocks.useDebateMedia }));
vi.mock('../social-video-share', async importActual => ({
  ...(await importActual<typeof import('../social-video-share')>()),
  usePreparedSocialVideo: mocks.usePreparedSocialVideo,
  preparedSocialVideoFile: mocks.preparedSocialVideoFile,
}));

const DEBATE_ID = '4c81561d-1f95-4131-9cdd-dd20ab831ba2';
const SPACE_ID = 'space-1';
const DEBATE_URL = `http://localhost:3000/space/${SPACE_ID}/4c81561d1f9541319cdddd20ab831ba2`;

// Only `id` and `claim.claim` are read, and a whole Debate here would be fixture noise nothing
// asserts on.
const debate = { id: DEBATE_ID, claim: { claim: 'Debates are useful' } } as unknown as Debate;

const preparedVideo = new File([new Uint8Array([1, 2, 3])], `debate-${DEBATE_ID}-social.mp4`, { type: 'video/mp4' });

/** Whether the media lookup found a social cut for this debate, and whether it answered at all. */
function stubMedia({ socialVideo, isError = false }: { socialVideo: boolean; isError?: boolean }) {
  mocks.useDebateMedia.mockImplementation((_debateId: string, enabled: boolean) => ({
    data: !enabled || isError ? undefined : { artifacts: socialVideo ? [{ kind: 'social_video' }] : [] },
    isSuccess: enabled && !isError,
    isError: enabled && isError,
  }));
}

/** The render's state, mutable so a test can advance it across a rerender. */
let prepared = {
  status: 'preparing' as 'preparing' | 'ready' | 'error',
  progressPercent: null as number | null,
  error: null as string | null,
};

function stubPreparation(next: Partial<typeof prepared>) {
  prepared = { ...prepared, ...next };
}

function renderShare({ enabled = true, onRefused = vi.fn() } = {}) {
  const rendered = renderHook(() => useDebateSystemShare(debate, SPACE_ID, { enabled, onRefused }));
  return { ...rendered, onRefused };
}

beforeEach(() => {
  vi.resetAllMocks();
  prepared = { status: 'preparing', progressPercent: null, error: null };
  mocks.usePreparedSocialVideo.mockImplementation(() => ({ ...prepared, retry: vi.fn() }));
  mocks.preparedSocialVideoFile.mockReturnValue(null);
  mocks.canShare.mockReturnValue(true);
  mocks.share.mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'share', { configurable: true, value: mocks.share });
  Object.defineProperty(navigator, 'canShare', { configurable: true, value: mocks.canShare });
  stubMedia({ socialVideo: true });
});

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(navigator, 'share');
  Reflect.deleteProperty(navigator, 'canShare');
});

describe('useDebateSystemShare', () => {
  // The point of waiting on the tap rather than rendering in the background: a viewer who never
  // shares never pays for a cut. This is what the pre-sheet button got wrong.
  it('fetches nothing until the first tap', () => {
    const { result } = renderShare();

    expect(result.current.status).toBe('idle');
    expect(mocks.useDebateMedia).toHaveBeenLastCalledWith(DEBATE_ID, false);
    expect(mocks.usePreparedSocialVideo).toHaveBeenLastCalledWith(DEBATE_ID, {
      enabled: false,
      includePreview: false,
    });

    act(() => result.current.onShare());

    expect(result.current.status).toBe('preparing');
    expect(mocks.useDebateMedia).toHaveBeenLastCalledWith(DEBATE_ID, true);
    expect(mocks.usePreparedSocialVideo).toHaveBeenLastCalledWith(DEBATE_ID, {
      enabled: true,
      includePreview: false,
    });
    expect(mocks.share).not.toHaveBeenCalled();
  });

  it('reports the cut download progress while it waits', () => {
    const { result, rerender } = renderShare();
    act(() => result.current.onShare());

    stubPreparation({ progressPercent: 42 });
    rerender();

    expect(result.current.status).toBe('preparing');
    expect(result.current.progressPercent).toBe(42);
  });

  it('ignores a second tap while it is preparing', () => {
    const { result } = renderShare();

    act(() => result.current.onShare());
    act(() => result.current.onShare());

    expect(result.current.status).toBe('preparing');
    expect(mocks.share).not.toHaveBeenCalled();
  });

  it('hands the video to the OS sheet as soon as the cut lands', async () => {
    const { result, rerender } = renderShare();
    act(() => result.current.onShare());

    stubPreparation({ status: 'ready' });
    mocks.preparedSocialVideoFile.mockReturnValue(preparedVideo);
    await act(async () => rerender());

    expect(mocks.share).toHaveBeenCalledWith({ title: 'Debates are useful', files: [preparedVideo] });
    await waitFor(() =>
      expect(mocks.capture).toHaveBeenCalledWith('debate_share_action', {
        debate_id: DEBATE_ID,
        space_id: SPACE_ID,
        method: 'native_share',
        payload: 'video',
      })
    );
  });

  // Rendering a video outlives the tap's transient activation, so the hand-off above can be
  // refused for reasons the next tap fixes. The cut is in memory by then, so that tap is instant.
  it('arms the button when the tap that asked for the video has expired', async () => {
    mocks.share.mockRejectedValue(new DOMException('Permission denied', 'NotAllowedError'));

    const { result, rerender, onRefused } = renderShare();
    act(() => result.current.onShare());

    stubPreparation({ status: 'ready' });
    mocks.preparedSocialVideoFile.mockReturnValue(preparedVideo);
    await act(async () => rerender());

    await waitFor(() => expect(mocks.setToast).toHaveBeenCalled());
    expect(result.current.status).toBe('armed');
    // Not a capability refusal, so the in-app sheet stays out of it.
    expect(onRefused).not.toHaveBeenCalled();

    mocks.share.mockResolvedValue(undefined);
    act(() => result.current.onShare());

    expect(mocks.share).toHaveBeenLastCalledWith({ title: 'Debates are useful', files: [preparedVideo] });
  });

  it('shares a cut already in memory on the first tap, with no wait', () => {
    mocks.preparedSocialVideoFile.mockReturnValue(preparedVideo);

    const { result } = renderShare();
    act(() => result.current.onShare());

    expect(result.current.status).toBe('idle');
    expect(mocks.useDebateMedia).toHaveBeenLastCalledWith(DEBATE_ID, false);
    expect(mocks.share).toHaveBeenCalledWith({ title: 'Debates are useful', files: [preparedVideo] });
  });

  it('arms for a link share when the debate has no cut to wait for', async () => {
    stubMedia({ socialVideo: false });

    const { result } = renderShare();
    await act(async () => result.current.onShare());

    await waitFor(() => expect(result.current.status).toBe('armed'));
    expect(mocks.usePreparedSocialVideo).toHaveBeenLastCalledWith(DEBATE_ID, {
      enabled: false,
      includePreview: false,
    });
    expect(mocks.setToast).toHaveBeenCalled();

    act(() => result.current.onShare());

    expect(mocks.share).toHaveBeenCalledWith({
      title: 'Debates are useful',
      text: 'Debates are useful. Watch the debate on Geo!',
      url: DEBATE_URL,
    });
  });

  it('arms for a link share when the cut fails to render, and says why', async () => {
    const { result, rerender } = renderShare();
    act(() => result.current.onShare());

    stubPreparation({ status: 'error', error: 'Video preparation stalled.' });
    await act(async () => rerender());

    await waitFor(() => expect(result.current.status).toBe('armed'));
    expect(mocks.setToast).toHaveBeenCalled();

    act(() => result.current.onShare());
    expect(mocks.share).toHaveBeenCalledWith(expect.objectContaining({ url: DEBATE_URL }));
  });

  // The refusal PR #2271 was written for: `canShare` says yes and `share` declines anyway. Inside
  // the gesture there is no expired activation to blame, so this is the platform saying no.
  it('falls back to the in-app sheet when a share inside the tap is refused outright', async () => {
    mocks.preparedSocialVideoFile.mockReturnValue(preparedVideo);
    mocks.share.mockRejectedValue(new DOMException('Permission denied', 'NotAllowedError'));

    const { result, onRefused } = renderShare();
    act(() => result.current.onShare());

    await waitFor(() => expect(onRefused).toHaveBeenCalled());
    expect(mocks.setToast).not.toHaveBeenCalled();
  });

  it('reports nothing when the OS sheet is dismissed', async () => {
    mocks.preparedSocialVideoFile.mockReturnValue(preparedVideo);
    mocks.share.mockRejectedValue(new DOMException('Share canceled', 'AbortError'));

    const { result, onRefused } = renderShare();
    act(() => result.current.onShare());

    await waitFor(() => expect(mocks.share).toHaveBeenCalled());
    expect(onRefused).not.toHaveBeenCalled();
    expect(mocks.capture).not.toHaveBeenCalled();
  });

  it('stays out of the way entirely on a layout that uses the in-app sheet', () => {
    const { result } = renderShare({ enabled: false });

    act(() => result.current.onShare());

    expect(result.current.status).toBe('idle');
    expect(mocks.useDebateMedia).toHaveBeenLastCalledWith(DEBATE_ID, false);
  });
});
