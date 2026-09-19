import { act, render } from '@testing-library/react';

import * as React from 'react';

import { Provider, createStore } from 'jotai';
import { afterEach, describe, expect, it } from 'vitest';

import { SLIDE_UP_OPEN_ATTRIBUTE, SlideUpBodyState } from './slide-up-body-state';
import { slideUpOpenCountAtom } from '~/atoms';

afterEach(() => {
  document.documentElement.removeAttribute(SLIDE_UP_OPEN_ATTRIBUTE);
  document.body.removeAttribute(SLIDE_UP_OPEN_ATTRIBUTE);
});

function mount(store: ReturnType<typeof createStore>) {
  return render(
    <Provider store={store}>
      <SlideUpBodyState />
    </Provider>
  );
}

function isMarked() {
  return (
    document.body.hasAttribute(SLIDE_UP_OPEN_ATTRIBUTE) &&
    document.documentElement.hasAttribute(SLIDE_UP_OPEN_ATTRIBUTE)
  );
}

describe('SlideUpBodyState', () => {
  it('leaves the document unmarked with no sheet open', () => {
    mount(createStore());

    expect(isMarked()).toBe(false);
  });

  /**
   * What the mark is for: a slide-up sits at 10000 and anything radix portals to the body lands at
   * `z-index: auto` beneath it, so a popover opened from inside a sheet needs CSS to lift it out.
   */
  it('marks the document while a sheet is open', () => {
    const store = createStore();
    store.set(slideUpOpenCountAtom, 1);

    mount(store);

    expect(isMarked()).toBe(true);
  });

  it('unmarks it once the last sheet closes', () => {
    const store = createStore();
    store.set(slideUpOpenCountAtom, 1);
    mount(store);

    act(() => {
      store.set(slideUpOpenCountAtom, 0);
    });

    expect(isMarked()).toBe(false);
  });

  /**
   * The reason this lives in one always-mounted component rather than in the sheets: with two open,
   * no individual sheet knows whether it is the last one out, and the one closing is often unmounting
   * as it decrements.
   */
  it('stays marked while a second sheet is still open', () => {
    const store = createStore();
    store.set(slideUpOpenCountAtom, 2);
    mount(store);

    act(() => {
      store.set(slideUpOpenCountAtom, 1);
    });

    expect(isMarked()).toBe(true);
  });
});
