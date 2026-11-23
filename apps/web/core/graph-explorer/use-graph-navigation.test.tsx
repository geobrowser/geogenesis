import { act, renderHook } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { goBack, graphHistoryHref, recentre, startGraphHistory } from './history';
import { useGraphNavigation } from './use-graph-navigation';

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

const id = (n: number) => n.toString(16).padStart(32, '0');
const params = new URLSearchParams({ topic: id(9), space: id(8) });

beforeEach(() => window.sessionStorage.clear());
afterEach(() => vi.clearAllMocks());

describe('useGraphNavigation', () => {
  it('pushes each hop, keeping the topic and space', () => {
    const start = startGraphHistory(id(1));
    const { result } = renderHook(() => useGraphNavigation(start, params));
    act(() => result.current(recentre(start, id(2))));
    expect(router.push).toHaveBeenCalledWith(`/explore/graph/${id(2)}?topic=${id(9)}&space=${id(8)}&trail=${id(1)}`, {
      scroll: false,
    });
  });

  it('goes back with the browser after its own push, including after a reload', () => {
    const start = startGraphHistory(id(1));
    const hop = recentre(start, id(2));
    const first = renderHook(() => useGraphNavigation(start, params));
    act(() => first.result.current(hop));
    first.unmount();

    // A reload remounts on the pushed URL; sessionStorage still knows it came from a push.
    const reloaded = renderHook(() => useGraphNavigation(hop, params));
    act(() => reloaded.result.current(goBack(hop)));
    expect(router.back).toHaveBeenCalledTimes(1);
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('replaces on a shared deep link, where the browser has nothing of ours to go back to', () => {
    const deepLink = { centreId: id(2), back: [id(1)] };
    const { result } = renderHook(() => useGraphNavigation(deepLink, params));
    act(() => result.current(goBack(deepLink)));
    expect(router.back).not.toHaveBeenCalled();
    expect(router.replace).toHaveBeenCalledWith(graphHistoryHref(startGraphHistory(id(1)), params), { scroll: false });
  });

  it('treats clicking the node it came from as Back', () => {
    const start = startGraphHistory(id(1));
    const hop = recentre(start, id(2));
    const { result, rerender } = renderHook(({ history }) => useGraphNavigation(history, params), {
      initialProps: { history: start },
    });
    act(() => result.current(hop));
    rerender({ history: hop });
    act(() => result.current(recentre(hop, id(1))));
    expect(router.back).toHaveBeenCalledTimes(1);
  });

  it('does nothing for the centre itself', () => {
    const start = startGraphHistory(id(1));
    const { result } = renderHook(() => useGraphNavigation(start, params));
    act(() => result.current(start));
    expect(router.push).not.toHaveBeenCalled();
  });
});
