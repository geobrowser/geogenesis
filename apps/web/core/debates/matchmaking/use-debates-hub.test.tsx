import { act, renderHook } from '@testing-library/react';

import * as React from 'react';

import { Provider, createStore } from 'jotai';
import { describe, expect, it } from 'vitest';

import { useDebatesHub } from './use-debates-hub';

function renderHub() {
  const store = createStore();
  const wrapper = ({ children }: { children: React.ReactNode }) => <Provider store={store}>{children}</Provider>;
  return { store, ...renderHook(() => useDebatesHub(), { wrapper }) };
}

// GEO-3431: a link's scheduled request outlines its card only until the hub is opened on anything
// else, so a stale outline never comes back.
describe('useDebatesHub focused request', () => {
  it('holds the request a link opened the hub on', () => {
    const { result } = renderHub();

    act(() => result.current.open('requests', 'request-1'));
    expect(result.current.activeTab).toBe('requests');
    expect(result.current.focusedRequestId).toBe('request-1');
  });

  it('forgets it on every other way of moving the hub', () => {
    const { result } = renderHub();
    const moves: [string, () => void][] = [
      ['open', () => result.current.open('requests')],
      ['setTab', () => result.current.setTab('requests')],
      ['close', () => result.current.close()],
      ['toggle', () => result.current.toggle()],
    ];
    for (const [name, move] of moves) {
      act(() => result.current.open('requests', 'request-1'));
      act(move);
      expect([name, result.current.focusedRequestId]).toEqual([name, null]);
    }
  });
});

describe('useDebatesHub landing tab', () => {
  it('opens on Lobby', () => {
    // The list you can always act on. The panel is closed far more often than it is left on a
    // tab, so this is what most opens land on.
    const { result } = renderHub();

    act(() => result.current.open());

    expect(result.current.activeTab).toBe('lobby');
  });

  it('opens on Lobby from the navbar toggle too', () => {
    const { result } = renderHub();

    act(() => result.current.toggle());

    expect(result.current.isOpen).toBe(true);
    expect(result.current.activeTab).toBe('lobby');
  });

  it('reports Lobby while closed, so the first open has somewhere to land', () => {
    const { result } = renderHub();

    expect(result.current.isOpen).toBe(false);
    expect(result.current.activeTab).toBe('lobby');
  });

  it('still honours an explicit tab, which is how a caller deep-links a list', () => {
    const { result } = renderHub();

    act(() => result.current.open('requests'));
    expect(result.current.activeTab).toBe('requests');

    act(() => result.current.setTab('explore'));
    expect(result.current.activeTab).toBe('explore');
  });

  it('forgets the tab on close, so the next open lands on Lobby again', () => {
    // The atom holds no tab while closed, which is what makes the default apply every time
    // rather than only on the first open of a session.
    const { result } = renderHub();

    act(() => result.current.open('people'));
    expect(result.current.activeTab).toBe('people');

    act(() => result.current.close());
    act(() => result.current.open());

    expect(result.current.activeTab).toBe('lobby');
  });
});
