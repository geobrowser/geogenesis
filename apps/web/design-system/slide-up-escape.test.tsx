import { act, fireEvent, render } from '@testing-library/react';

import * as React from 'react';

import { Provider, createStore } from 'jotai';
import { describe, expect, it, vi } from 'vitest';

import { SlideUp } from './slide-up';
import { commentsPanelHostElementAtom } from '~/atoms';

/**
 * Escape belongs to the sheet on top. Every open sheet listens on the window, so without that rule one
 * press closes the sheet underneath as well as the one the reader is looking at — the same
 * one-layer-per-press rule the comments panel follows for the entity side panel above it.
 */
describe('SlideUp Escape ownership', () => {
  it('closes a lone sheet', () => {
    const setIsOpen = vi.fn();

    render(
      <Provider store={createStore()}>
        <SlideUp isOpen setIsOpen={setIsOpen}>
          <div>only</div>
        </SlideUp>
      </Provider>
    );

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(setIsOpen).toHaveBeenCalledWith(false);
  });

  it('closes only the sheet on top when two are open', () => {
    const closeUnder = vi.fn();
    const closeOver = vi.fn();

    render(
      <Provider store={createStore()}>
        <SlideUp isOpen setIsOpen={closeUnder}>
          <div>under</div>
        </SlideUp>
        <SlideUp isOpen setIsOpen={closeOver}>
          <div>over</div>
        </SlideUp>
      </Provider>
    );

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(closeOver).toHaveBeenCalledWith(false);
    expect(closeUnder).not.toHaveBeenCalled();
  });

  it('gives Escape back to the lower sheet once the upper one closes', () => {
    const closeUnder = vi.fn();
    const store = createStore();

    const { rerender } = render(
      <Provider store={store}>
        <SlideUp isOpen setIsOpen={closeUnder}>
          <div>under</div>
        </SlideUp>
        <SlideUp isOpen setIsOpen={vi.fn()}>
          <div>over</div>
        </SlideUp>
      </Provider>
    );

    rerender(
      <Provider store={store}>
        <SlideUp isOpen setIsOpen={closeUnder}>
          <div>under</div>
        </SlideUp>
        <SlideUp isOpen={false} setIsOpen={vi.fn()}>
          <div>over</div>
        </SlideUp>
      </Provider>
    );

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(closeUnder).toHaveBeenCalledWith(false);
  });

  it('still defers to a raised panel over the topmost sheet', () => {
    const setIsOpen = vi.fn();
    const store = createStore();

    render(
      <Provider store={store}>
        <SlideUp isOpen setIsOpen={setIsOpen}>
          <div>sheet</div>
        </SlideUp>
      </Provider>
    );

    // A comments panel opened from inside the sheet registers itself as the layer above.
    const panel = document.createElement('aside');
    document.body.append(panel);
    // Through `act`, or the listener's closure still has the pre-write value when the key fires.
    act(() => {
      store.set(commentsPanelHostElementAtom, panel);
    });

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(setIsOpen).not.toHaveBeenCalled();
    panel.remove();
  });
});
