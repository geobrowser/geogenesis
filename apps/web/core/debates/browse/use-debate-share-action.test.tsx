import { act, cleanup, renderHook, waitFor } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Debate } from '~/core/debates/api';

import { forgetPreparedSocialVideo, rememberPreparedSocialVideo } from '../social-video-share';
import { useDebateShareAction } from './use-debate-share-action';

const mocks = vi.hoisted(() => ({
  capture: vi.fn(),
  share: vi.fn(),
  canShare: vi.fn(),
}));

vi.mock('~/core/analytics', () => ({ capture: mocks.capture }));

const DEBATE_ID = '4c81561d-1f95-4131-9cdd-dd20ab831ba2';
const SPACE_ID = 'space-1';

// Only `id` and `claim.claim` are read, and a whole Debate here would be fixture noise the test
// never asserts on.
const debate = { id: DEBATE_ID, claim: { claim: 'Debates are useful' } } as unknown as Debate;

const preparedVideo = new File([new Uint8Array([1, 2, 3])], `debate-${DEBATE_ID}-social.mp4`, { type: 'video/mp4' });

/**
 * Stub the viewport. `mobile` is the project's `lg:` breakpoint (`max-width: 1023px`); `touch` is
 * the coarse pointer that tells a phone from a desktop window dragged narrow. They default
 * together because that is the only combination a real phone reports.
 */
function stubLayout({ mobile, touch = mobile }: { mobile: boolean; touch?: boolean }) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: query.includes('pointer') ? touch : mobile,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))
  );
}

function stubShareSheet(share: unknown, canShare?: unknown) {
  if (share === undefined) Reflect.deleteProperty(navigator, 'share');
  else Object.defineProperty(navigator, 'share', { configurable: true, value: share });

  if (canShare === undefined) Reflect.deleteProperty(navigator, 'canShare');
  else Object.defineProperty(navigator, 'canShare', { configurable: true, value: canShare });
}

beforeEach(() => {
  vi.resetAllMocks();
  forgetPreparedSocialVideo();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  stubShareSheet(undefined, undefined);
});

describe('useDebateShareAction', () => {
  it('opens the in-app sheet on desktop rather than the OS one', () => {
    stubLayout({ mobile: false });
    stubShareSheet(mocks.share, mocks.canShare);

    const { result } = renderHook(() => useDebateShareAction(debate, SPACE_ID));

    expect(result.current.opensDialog).toBe(true);
    act(() => result.current.onShare());

    expect(result.current.open).toBe(true);
    expect(mocks.share).not.toHaveBeenCalled();
  });

  // The whole point of the mobile path: the debate's link goes out on the tap, with no wait for a
  // video nobody asked for. Regression guard for the behaviour PR #2310 removed on both layouts.
  it('shares the debate link through the OS sheet on mobile, without opening the in-app sheet', async () => {
    stubLayout({ mobile: true });
    mocks.share.mockResolvedValue(undefined);
    stubShareSheet(mocks.share, mocks.canShare);

    const { result } = renderHook(() => useDebateShareAction(debate, SPACE_ID));

    expect(result.current.opensDialog).toBe(false);
    act(() => result.current.onShare());

    expect(result.current.open).toBe(false);
    expect(mocks.canShare).not.toHaveBeenCalled();
    expect(mocks.share).toHaveBeenCalledWith({
      title: 'Debates are useful',
      text: 'Debates are useful. Watch the debate on Geo!',
      url: `${window.location.origin}/space/${SPACE_ID}/4c81561d1f9541319cdddd20ab831ba2`,
    });

    await waitFor(() =>
      expect(mocks.capture).toHaveBeenCalledWith('debate_share_action', {
        debate_id: DEBATE_ID,
        space_id: SPACE_ID,
        method: 'native_share',
        payload: 'link',
      })
    );
  });

  it('shares a social cut already in memory instead of the link', async () => {
    stubLayout({ mobile: true });
    mocks.share.mockResolvedValue(undefined);
    mocks.canShare.mockReturnValue(true);
    stubShareSheet(mocks.share, mocks.canShare);
    rememberPreparedSocialVideo(DEBATE_ID, preparedVideo);

    const { result } = renderHook(() => useDebateShareAction(debate, SPACE_ID));
    act(() => result.current.onShare());

    expect(mocks.share).toHaveBeenCalledWith({ title: 'Debates are useful', files: [preparedVideo] });

    await waitFor(() =>
      expect(mocks.capture).toHaveBeenCalledWith(
        'debate_share_action',
        expect.objectContaining({ method: 'native_share', payload: 'video' })
      )
    );
  });

  it('shares the link when the cut in memory belongs to another debate', () => {
    stubLayout({ mobile: true });
    mocks.share.mockResolvedValue(undefined);
    mocks.canShare.mockReturnValue(true);
    stubShareSheet(mocks.share, mocks.canShare);
    rememberPreparedSocialVideo('another-debate', preparedVideo);

    const { result } = renderHook(() => useDebateShareAction(debate, SPACE_ID));
    act(() => result.current.onShare());

    expect(mocks.share).toHaveBeenCalledWith(expect.objectContaining({ url: expect.any(String) }));
  });

  // Desktop Chrome has `navigator.share`, so width alone would swap this window's share surface.
  it('keeps the in-app sheet in a narrow desktop window', () => {
    stubLayout({ mobile: true, touch: false });
    mocks.share.mockResolvedValue(undefined);
    stubShareSheet(mocks.share, mocks.canShare);

    const { result } = renderHook(() => useDebateShareAction(debate, SPACE_ID));

    expect(result.current.opensDialog).toBe(true);
    act(() => result.current.onShare());

    expect(result.current.open).toBe(true);
    expect(mocks.share).not.toHaveBeenCalled();
  });

  it('keeps the in-app sheet on a mobile browser with no OS share sheet', () => {
    stubLayout({ mobile: true });
    stubShareSheet(undefined, undefined);

    const { result } = renderHook(() => useDebateShareAction(debate, SPACE_ID));

    expect(result.current.opensDialog).toBe(true);
    act(() => result.current.onShare());
    expect(result.current.open).toBe(true);
  });

  // `NotAllowedError` is the browser declining the capability, so reopening the OS sheet refuses
  // identically. The in-app sheet asks nothing of the platform.
  it('falls back to the in-app sheet when the OS sheet refuses outright', async () => {
    stubLayout({ mobile: true });
    mocks.share.mockRejectedValue(new DOMException('Permission denied', 'NotAllowedError'));
    stubShareSheet(mocks.share, mocks.canShare);

    const { result } = renderHook(() => useDebateShareAction(debate, SPACE_ID));
    act(() => result.current.onShare());

    await waitFor(() => expect(result.current.open).toBe(true));
    expect(mocks.capture).not.toHaveBeenCalled();
  });

  it('reports nothing and opens nothing when the OS sheet is dismissed', async () => {
    stubLayout({ mobile: true });
    mocks.share.mockRejectedValue(new DOMException('Share canceled', 'AbortError'));
    stubShareSheet(mocks.share, mocks.canShare);

    const { result } = renderHook(() => useDebateShareAction(debate, SPACE_ID));
    act(() => result.current.onShare());

    await waitFor(() => expect(mocks.share).toHaveBeenCalled());
    expect(result.current.open).toBe(false);
    expect(mocks.capture).not.toHaveBeenCalled();
  });
});
