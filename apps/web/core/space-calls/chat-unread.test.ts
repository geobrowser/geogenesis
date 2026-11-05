import { act, renderHook } from '@testing-library/react';

import { describe, expect, it } from 'vitest';

import { useChatUnreadMark } from './chat-unread';

describe('useChatUnreadMark', () => {
  it('marks an arrival while the chat is hidden, and clears once it shows', () => {
    const { result, rerender } = renderHook(({ showing }) => useChatUnreadMark(showing), {
      initialProps: { showing: false },
    });
    expect(result.current.mark).toBe(false);

    act(() => result.current.onArrival());
    expect(result.current.mark).toBe(true);

    rerender({ showing: true });
    expect(result.current.mark).toBe(false);

    // Seen: hiding it again does not bring the dot back.
    rerender({ showing: false });
    expect(result.current.mark).toBe(false);
  });

  it('ignores arrivals while the chat shows', () => {
    const { result, rerender } = renderHook(({ showing }) => useChatUnreadMark(showing), {
      initialProps: { showing: true },
    });
    act(() => result.current.onArrival());
    expect(result.current.mark).toBe(false);
    rerender({ showing: false });
    expect(result.current.mark).toBe(false);
  });
});
