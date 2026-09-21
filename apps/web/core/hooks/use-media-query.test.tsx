import '@testing-library/jest-dom/vitest';
import { act, cleanup, renderHook } from '@testing-library/react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { useMediaQuery } from './use-media-query';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('useMediaQuery', () => {
  it('tracks query changes and removes its listener on unmount', () => {
    let matches = false;
    let onChange: (() => void) | undefined;
    const removeEventListener = vi.fn();
    const matchMedia = vi.fn((query: string) => ({
      get matches() {
        return matches;
      },
      media: query,
      onchange: null,
      addEventListener: (_event: string, listener: () => void) => {
        onChange = listener;
      },
      removeEventListener,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    vi.stubGlobal('matchMedia', matchMedia);

    const { result, unmount } = renderHook(() => useMediaQuery('(max-width: 639px)'));

    expect(result.current).toBe(false);
    expect(matchMedia).toHaveBeenCalledWith('(max-width: 639px)');

    act(() => {
      matches = true;
      onChange?.();
    });

    expect(result.current).toBe(true);

    unmount();
    expect(removeEventListener).toHaveBeenCalledWith('change', expect.any(Function));
  });
});
