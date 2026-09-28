import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import * as React from 'react';

import { Provider, createStore } from 'jotai';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SlideUp } from '~/design-system/slide-up';

import { CommentInput } from './comments-section';

afterEach(cleanup);

/**
 * The composer renders inside the proposal review sheet, whose window listener closes it on any Escape it
 * sees undefaulted — and closing that sheet navigates off the proposal. Cancelling a draft must not take
 * the screen, and the draft, with it.
 */
describe('CommentInput Escape', () => {
  it('cancels the draft without closing the sheet around it', () => {
    const onCancel = vi.fn();
    const setIsOpen = vi.fn();

    render(
      <Provider store={createStore()}>
        <SlideUp isOpen setIsOpen={setIsOpen}>
          <CommentInput onSubmit={vi.fn()} placeholder="Write a comment" onCancel={onCancel} />
        </SlideUp>
      </Provider>
    );

    fireEvent.keyDown(screen.getByPlaceholderText('Write a comment'), { key: 'Escape' });

    expect(onCancel).toHaveBeenCalled();
    expect(setIsOpen).not.toHaveBeenCalled();
  });

  it('leaves Escape to the sheet when there is no draft to cancel', () => {
    const setIsOpen = vi.fn();

    render(
      <Provider store={createStore()}>
        <SlideUp isOpen setIsOpen={setIsOpen}>
          <CommentInput onSubmit={vi.fn()} placeholder="Write a comment" />
        </SlideUp>
      </Provider>
    );

    fireEvent.keyDown(screen.getByPlaceholderText('Write a comment'), { key: 'Escape' });

    // No `onCancel`, so the composer has nothing to do with the press and the sheet still closes.
    expect(setIsOpen).toHaveBeenCalledWith(false);
  });
});
