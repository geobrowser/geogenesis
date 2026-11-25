import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { useFeedSnap } from './use-feed-snap';

afterEach(cleanup);

describe('useFeedSnap', () => {
  it('snaps the page a card at a time below the navbar, and puts the page back when the feed leaves', () => {
    const root = document.documentElement;
    const { unmount } = renderHook(() => useFeedSnap(true));
    expect(root.style.scrollSnapType).toBe('y mandatory');
    expect(root.style.scrollPaddingTop).toBe('44px');
    expect(document.body.style.scrollSnapAlign).toBe('start');

    unmount();
    expect(root.style.scrollSnapType).toBe('');
    expect(root.style.scrollPaddingTop).toBe('');
    expect(document.body.style.scrollSnapAlign).toBe('');
  });

  it('leaves the page alone until it is enabled', () => {
    const { rerender } = renderHook(({ enabled }) => useFeedSnap(enabled), { initialProps: { enabled: false } });
    expect(document.documentElement.style.scrollSnapType).toBe('');
    rerender({ enabled: true });
    expect(document.documentElement.style.scrollSnapType).toBe('y mandatory');
    rerender({ enabled: false });
    expect(document.documentElement.style.scrollSnapType).toBe('');
  });
});
