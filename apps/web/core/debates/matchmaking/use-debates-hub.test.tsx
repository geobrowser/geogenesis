import { act, renderHook } from '@testing-library/react';

import { Provider, createStore } from 'jotai';

import * as React from 'react';

import { describe, expect, it } from 'vitest';

import { debatesHubAtom } from '~/atoms';

import { useDebatesHub } from './use-debates-hub';

function renderHub() {
  const store = createStore();
  const wrapper = ({ children }: { children: React.ReactNode }) => <Provider store={store}>{children}</Provider>;
  return { store, ...renderHook(() => useDebatesHub(), { wrapper }) };
}

describe('useDebatesHub landing tab', () => {
  it('opens on Claims', () => {
    // The list you can always act on. The panel is closed far more often than it is left on a
    // tab, so this is what most opens land on.
    const { result } = renderHub();

    act(() => result.current.open());

    expect(result.current.activeTab).toBe('claims');
  });

  it('opens on Claims from the navbar toggle too', () => {
    const { result } = renderHub();

    act(() => result.current.toggle());

    expect(result.current.isOpen).toBe(true);
    expect(result.current.activeTab).toBe('claims');
  });

  it('reports Claims while closed, so the first open has somewhere to land', () => {
    const { result } = renderHub();

    expect(result.current.isOpen).toBe(false);
    expect(result.current.activeTab).toBe('claims');
  });

  it('still honours an explicit tab, which is how a caller deep-links a list', () => {
    const { result } = renderHub();

    act(() => result.current.open('requests'));
    expect(result.current.activeTab).toBe('requests');

    act(() => result.current.setTab('matches'));
    expect(result.current.activeTab).toBe('matches');
  });

  it('forgets the tab on close, so the next open lands on Claims again', () => {
    // The atom holds no tab while closed, which is what makes the default apply every time
    // rather than only on the first open of a session.
    const { result } = renderHub();

    act(() => result.current.open('people'));
    expect(result.current.activeTab).toBe('people');

    act(() => result.current.close());
    act(() => result.current.open());

    expect(result.current.activeTab).toBe('claims');
  });
});
