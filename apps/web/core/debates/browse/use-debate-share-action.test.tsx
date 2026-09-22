import { act, cleanup, renderHook } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Debate } from '~/core/debates/api';

import { useDebateShareAction } from './use-debate-share-action';

const mocks = vi.hoisted(() => ({
  share: vi.fn(),
  systemShare: vi.fn(),
  useDebateSystemShare: vi.fn(),
}));

vi.mock('./use-debate-system-share', () => ({ useDebateSystemShare: mocks.useDebateSystemShare }));

const debate = { id: 'debate-1', claim: { claim: 'Debates are useful' } } as unknown as Debate;

/**
 * Stub the viewport. `mobile` is the project's `lg:` breakpoint (`max-width: 1023px`); `touch` is
 * the coarse pointer that tells a phone from a desktop window dragged narrow. They default together
 * because that is the only combination a real phone reports.
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

function stubSystemShareSheet(present: boolean) {
  if (present) Object.defineProperty(navigator, 'share', { configurable: true, value: mocks.share });
  else Reflect.deleteProperty(navigator, 'share');
}

/** The last `enabled` the mobile hand-off was mounted with. */
function systemShareEnabled() {
  return mocks.useDebateSystemShare.mock.lastCall?.[2].enabled;
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.useDebateSystemShare.mockImplementation(() => ({
    status: 'idle',
    progressPercent: null,
    onShare: mocks.systemShare,
  }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, 'share');
});

describe('useDebateShareAction', () => {
  it('opens the in-app sheet on desktop rather than the OS one', () => {
    stubLayout({ mobile: false });
    stubSystemShareSheet(true);

    const { result } = renderHook(() => useDebateShareAction(debate, 'space-1'));

    expect(result.current.opensDialog).toBe(true);
    expect(systemShareEnabled()).toBe(false);

    act(() => result.current.onShare());

    expect(result.current.open).toBe(true);
    expect(mocks.systemShare).not.toHaveBeenCalled();
  });

  it('routes Share to the OS sheet on mobile, and announces no dialog', () => {
    stubLayout({ mobile: true });
    stubSystemShareSheet(true);

    const { result } = renderHook(() => useDebateShareAction(debate, 'space-1'));

    expect(result.current.opensDialog).toBe(false);
    expect(systemShareEnabled()).toBe(true);

    act(() => result.current.onShare());

    expect(mocks.systemShare).toHaveBeenCalled();
    expect(result.current.open).toBe(false);
  });

  // Desktop Chrome has `navigator.share`, so width alone would swap this window's share surface.
  it('keeps the in-app sheet in a narrow desktop window', () => {
    stubLayout({ mobile: true, touch: false });
    stubSystemShareSheet(true);

    const { result } = renderHook(() => useDebateShareAction(debate, 'space-1'));

    expect(result.current.opensDialog).toBe(true);
    act(() => result.current.onShare());

    expect(result.current.open).toBe(true);
    expect(mocks.systemShare).not.toHaveBeenCalled();
  });

  it('keeps the in-app sheet on a mobile browser with no OS share sheet', () => {
    stubLayout({ mobile: true });
    stubSystemShareSheet(false);

    const { result } = renderHook(() => useDebateShareAction(debate, 'space-1'));

    expect(result.current.opensDialog).toBe(true);
    act(() => result.current.onShare());
    expect(result.current.open).toBe(true);
  });

  it('surfaces the wait on the Share control while the cut renders', () => {
    stubLayout({ mobile: true });
    stubSystemShareSheet(true);
    mocks.useDebateSystemShare.mockImplementation(() => ({
      status: 'preparing',
      progressPercent: 42,
      onShare: mocks.systemShare,
    }));

    const { result } = renderHook(() => useDebateShareAction(debate, 'space-1'));

    expect(result.current.sharePending).toBe(true);
    expect(result.current.shareLabel).toBe('42%');
  });

  it('keeps the Share label while a cut of unknown size renders', () => {
    stubLayout({ mobile: true });
    stubSystemShareSheet(true);
    mocks.useDebateSystemShare.mockImplementation(() => ({
      status: 'preparing',
      progressPercent: null,
      onShare: mocks.systemShare,
    }));

    const { result } = renderHook(() => useDebateShareAction(debate, 'space-1'));

    expect(result.current.sharePending).toBe(true);
    expect(result.current.shareLabel).toBe('Share');
  });

  it('reads as an ordinary Share control once the cut is in hand', () => {
    stubLayout({ mobile: true });
    stubSystemShareSheet(true);
    mocks.useDebateSystemShare.mockImplementation(() => ({
      status: 'armed',
      progressPercent: null,
      onShare: mocks.systemShare,
    }));

    const { result } = renderHook(() => useDebateShareAction(debate, 'space-1'));

    expect(result.current.sharePending).toBe(false);
    expect(result.current.shareLabel).toBe('Share');
  });
});
