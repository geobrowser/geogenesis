import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';

import { Provider, createStore } from 'jotai';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Z_LAYERS } from '~/core/z-layers';

import { EntityCommentsPanel } from './entity-comments-panel';
import { slideUpOpenCountAtom } from '~/atoms';

vi.mock('~/core/hooks/use-comments', () => ({
  useComments: () => ({ comments: [], totalCount: 3, isLoading: false, error: null, refetch: vi.fn() }),
}));

vi.mock('./comments-section', () => ({
  CommentSection: () => <div>Comment section</div>,
}));

afterEach(cleanup);

describe('EntityCommentsPanel', () => {
  /**
   * A slide-up — the proposal review sheet, the edit review — sits at z-10000. Opened over one at
   * 150, this panel draws underneath it and reads as not opening at all, which is exactly how it
   * was reported (GEO-2907).
   */
  it('clears a slide-up when one is open', () => {
    const store = createStore();
    store.set(slideUpOpenCountAtom, 1);

    const { container } = render(
      <Provider store={store}>
        <EntityCommentsPanel entityId="entity-1" spaceId="space-1" onClose={vi.fn()} presentation="overlay" />
      </Provider>
    );

    const panel = container.querySelector('[data-entity-comments-panel]')!;
    expect(panel.className).toContain(`z-[${Z_LAYERS.commentsPanelOverSlideUp}]`);
    expect(panel.className).not.toContain('z-[150]');
  });

  // And stays under the entity side panel's own layer when there is no sheet, which is the order
  // those two are meant to stack in.
  it('sits at its usual layer with no slide-up open', () => {
    const store = createStore();

    const { container } = render(
      <Provider store={store}>
        <EntityCommentsPanel entityId="entity-1" spaceId="space-1" onClose={vi.fn()} presentation="overlay" />
      </Provider>
    );

    const panel = container.querySelector('[data-entity-comments-panel]')!;
    expect(panel.className).toContain('z-[150]');
    expect(panel.className).not.toContain(`z-[${Z_LAYERS.commentsPanelOverSlideUp}]`);
  });

  it('closes on Escape', () => {
    const onClose = vi.fn();
    render(<EntityCommentsPanel entityId="entity-1" spaceId="space-1" onClose={onClose} />);

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(onClose).toHaveBeenCalled();
  });

  // Opening a comment author's profile stacks the entity side panel above this
  // one. Both listen on the window, so without deferring, a single press would
  // dismiss both layers at once instead of just the one on top.
  it('leaves Escape to the entity side panel stacked above it', () => {
    const onClose = vi.fn();
    const sidePanel = document.createElement('aside');
    sidePanel.setAttribute('data-entity-side-panel', '');
    document.body.appendChild(sidePanel);

    render(<EntityCommentsPanel entityId="entity-1" spaceId="space-1" onClose={onClose} />);
    fireEvent.keyDown(window, { key: 'Escape' });

    expect(onClose).not.toHaveBeenCalled();
    sidePanel.remove();
  });

  it('ignores Escape while composing text', () => {
    const onClose = vi.fn();
    render(<EntityCommentsPanel entityId="entity-1" spaceId="space-1" onClose={onClose} />);

    fireEvent.keyDown(window, { key: 'Escape', isComposing: true });

    expect(onClose).not.toHaveBeenCalled();
  });
});
