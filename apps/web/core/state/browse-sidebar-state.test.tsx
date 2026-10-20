import { act, renderHook } from '@testing-library/react';

import * as React from 'react';

import { Provider, createStore, useAtom } from 'jotai';
import { beforeEach, describe, expect, it } from 'vitest';

import { browseSidebarOpenAtom, browseSidebarShownAtom, useBrowseSidebarPageDefault } from './browse-sidebar-state';

let store: ReturnType<typeof createStore>;
const wrapper = ({ children }: { children: React.ReactNode }) => <Provider store={store}>{children}</Provider>;

beforeEach(() => {
  store = createStore();
  store.set(browseSidebarOpenAtom, true);
});

describe('browse sidebar page default', () => {
  it('collapses the sidebar while the page is open, without touching the stored choice', () => {
    const { unmount } = renderHook(() => useBrowseSidebarPageDefault(false), { wrapper });
    expect(store.get(browseSidebarShownAtom)).toBe(false);
    expect(store.get(browseSidebarOpenAtom)).toBe(true);

    unmount();
    expect(store.get(browseSidebarShownAtom)).toBe(true);
  });

  it('lets the person open it anyway, which is stored as their choice', () => {
    const { result } = renderHook(
      () => {
        useBrowseSidebarPageDefault(false);
        return useAtom(browseSidebarShownAtom);
      },
      { wrapper }
    );
    expect(result.current[0]).toBe(false);

    act(() => result.current[1](true));
    expect(result.current[0]).toBe(true);
    expect(store.get(browseSidebarOpenAtom)).toBe(true);
  });
});
