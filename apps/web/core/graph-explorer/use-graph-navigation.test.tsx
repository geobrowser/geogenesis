import { act, renderHook } from '@testing-library/react';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { type GraphHistory, goBack, graphHistoryHref, recentre, startGraphHistory } from './history';
import { useGraphNavigation } from './use-graph-navigation';

const id = (n: number) => n.toString(16).padStart(32, '0');
const params = new URLSearchParams({ topic: id(9), space: id(8) });

const back = vi.spyOn(window.history, 'back').mockImplementation(() => {});
const push = vi.spyOn(window.history, 'pushState');
const replace = vi.spyOn(window.history, 'replaceState');

function navigate(from: GraphHistory, to: GraphHistory) {
  const { result } = renderHook(() => useGraphNavigation(from, params));
  act(() => result.current(to));
}

beforeEach(() => {
  window.history.replaceState(null, '', '/');
  vi.clearAllMocks();
});

describe('useGraphNavigation', () => {
  it('pushes each hop, keeping the topic and space, and marks where it came from', () => {
    const start = startGraphHistory(id(1));
    navigate(start, recentre(start, id(2)));
    expect(push).toHaveBeenCalledWith(
      { graphExplorer: { from: graphHistoryHref(start, params) } },
      '',
      `/explore/graph/${id(2)}?topic=${id(9)}&space=${id(8)}&trail=${id(1)}`
    );
  });

  it('goes back with the browser to the entry this one was pushed from', () => {
    const start = startGraphHistory(id(1));
    const hop = recentre(start, id(2));
    navigate(start, hop);
    navigate(hop, goBack(hop));
    expect(back).toHaveBeenCalledTimes(1);
    expect(replace).not.toHaveBeenCalled();
  });

  it('treats clicking the node it came from as Back', () => {
    const start = startGraphHistory(id(1));
    const hop = recentre(start, id(2));
    navigate(start, hop);
    navigate(hop, recentre(hop, id(1)));
    expect(back).toHaveBeenCalledTimes(1);
  });

  it('replaces on a deep link or bookmark, whose entry was not pushed from the previous centre', () => {
    const deepLink = { centreId: id(2), back: [id(1)] };
    window.history.replaceState(null, '', graphHistoryHref(deepLink, params));
    navigate(deepLink, goBack(deepLink));
    expect(back).not.toHaveBeenCalled();
    expect(replace).toHaveBeenLastCalledWith(null, '', graphHistoryHref(startGraphHistory(id(1)), params));
  });

  it('replaces when the entry was pushed from somewhere else', () => {
    const start = startGraphHistory(id(1));
    const hop = recentre(start, id(2));
    window.history.pushState(
      { graphExplorer: { from: '/explore/graph/elsewhere' } },
      '',
      graphHistoryHref(hop, params)
    );
    navigate(hop, goBack(hop));
    expect(back).not.toHaveBeenCalled();
  });

  it('does nothing for the centre itself', () => {
    const start = startGraphHistory(id(1));
    navigate(start, start);
    expect(push).not.toHaveBeenCalled();
  });
});
