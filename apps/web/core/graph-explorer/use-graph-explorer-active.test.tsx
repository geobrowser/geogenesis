import { renderHook } from '@testing-library/react';

import { Provider, createStore } from 'jotai';
import { describe, expect, it, vi } from 'vitest';

import { isGraphExplorerPath, useGraphExplorerActive } from './use-graph-explorer-active';
import { graphExplorerUnavailableAtom } from '~/atoms';

const nav = vi.hoisted(() => ({ pathname: '/explore/graph/abc' }));
vi.mock('next/navigation', () => ({ usePathname: () => nav.pathname }));

describe('isGraphExplorerPath', () => {
  it('matches one explorer page and nothing around it', () => {
    expect(isGraphExplorerPath('/explore/graph/abc')).toBe(true);
    expect(isGraphExplorerPath('/explore/graph/abc/')).toBe(true);
    expect(isGraphExplorerPath('/explore/graph')).toBe(false);
    expect(isGraphExplorerPath('/explore/graph/abc/more')).toBe(false);
    expect(isGraphExplorerPath('/explore')).toBe(false);
    expect(isGraphExplorerPath(null)).toBe(false);
  });
});

describe('useGraphExplorerActive', () => {
  const active = (pathname: string, unavailable: boolean) => {
    nav.pathname = pathname;
    const store = createStore();
    store.set(graphExplorerUnavailableAtom, unavailable);
    return renderHook(useGraphExplorerActive, {
      wrapper: ({ children }) => <Provider store={store}>{children}</Provider>,
    }).result.current;
  };

  it('hides the chrome on the graph path unless the page says it is not the explorer', () => {
    expect(active('/explore/graph/abc', false)).toBe(true);
    expect(active('/explore/graph/abc', true)).toBe(false);
    expect(active('/space/s/e', false)).toBe(false);
  });
});
