import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';

import { Provider, createStore } from 'jotai';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Z_LAYERS } from '~/core/z-layers';

import { EntityCommentsPanel } from './entity-comments-panel';
import { commentsPanelHostElementAtom, slideUpOpenCountAtom } from '~/atoms';

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
  it('draws above a slide-up when one is open', () => {
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
    // The mobile layer has to be raised with it: `md:` is a max-width breakpoint here, so a
    // media-query rule of equal specificity beats the unprefixed one and would strand the bottom
    // sheet under the slide-up. Exactly one mobile z class, or stylesheet order decides which wins.
    expect(panel.className).toContain(`md:z-[${Z_LAYERS.commentsPanelOverSlideUp}]`);
    expect(panel.className).not.toContain('md:z-[80]');
  });

  /**
   * A docked panel belongs to its own page, and on mobile it is `md:fixed` — a bottom sheet. Raising
   * it would float it over a slide-up it has nothing to do with, so the raise is the overlay's alone.
   */
  it('leaves a docked panel at its own layer even while a slide-up is open', () => {
    const store = createStore();
    store.set(slideUpOpenCountAtom, 1);

    const { container } = render(
      <Provider store={store}>
        <EntityCommentsPanel entityId="entity-1" spaceId="space-1" onClose={vi.fn()} presentation="docked" />
      </Provider>
    );

    const panel = container.querySelector('[data-entity-comments-panel]')!;
    expect(panel.className).toContain('md:z-[80]');
    expect(panel.className).not.toContain(`z-[${Z_LAYERS.commentsPanelOverSlideUp}]`);
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
    expect(panel.className).toContain('md:z-[80]');
    expect(panel.className).not.toContain(`z-[${Z_LAYERS.commentsPanelOverSlideUp}]`);
  });

  /**
   * The app-wide review sheet can open while a page holding a docked panel stays mounted. Registering
   * the host there would tell `SlideUp` a raised overlay is above it, so it would hand the first
   * Escape to a panel the reader cannot see — and would exempt that panel from the sheet's scroll
   * lock, which is the one thing the lock is for.
   */
  it('registers the shared host only for an overlay', () => {
    const store = createStore();

    const docked = render(
      <Provider store={store}>
        <EntityCommentsPanel entityId="entity-1" spaceId="space-1" onClose={vi.fn()} presentation="docked" />
      </Provider>
    );
    expect(store.get(commentsPanelHostElementAtom)).toBeNull();
    docked.unmount();

    render(
      <Provider store={store}>
        <EntityCommentsPanel entityId="entity-1" spaceId="space-1" onClose={vi.fn()} presentation="overlay" />
      </Provider>
    );
    expect(store.get(commentsPanelHostElementAtom)).not.toBeNull();
  });

  /** And a docked panel must not disturb the overlay's registration, since both can be mounted at once. */
  it('leaves an overlay registration alone when a docked panel mounts beside it', () => {
    const store = createStore();

    const { rerender } = render(
      <Provider store={store}>
        <EntityCommentsPanel entityId="entity-1" spaceId="space-1" onClose={vi.fn()} presentation="overlay" />
      </Provider>
    );

    const overlayHost = store.get(commentsPanelHostElementAtom);
    expect(overlayHost).not.toBeNull();

    rerender(
      <Provider store={store}>
        <EntityCommentsPanel entityId="entity-1" spaceId="space-1" onClose={vi.fn()} presentation="overlay" />
        <EntityCommentsPanel entityId="entity-2" spaceId="space-1" onClose={vi.fn()} presentation="docked" />
      </Provider>
    );

    // The same element, not merely some element: writing null would clear it and writing its own node
    // would hand the sheet the wrong panel to defer to.
    expect(store.get(commentsPanelHostElementAtom)).toBe(overlayHost);
  });

  /**
   * A docked panel sits behind a sheet, so a press aimed at the sheet is not aimed at it — and
   * `SlideUp` no longer defers, so without this both would close on one press.
   */
  it('does not take Escape while a slide-up is open over a docked panel', () => {
    const onClose = vi.fn();
    const store = createStore();
    store.set(slideUpOpenCountAtom, 1);

    render(
      <Provider store={store}>
        <EntityCommentsPanel entityId="entity-1" spaceId="space-1" onClose={onClose} presentation="docked" />
      </Provider>
    );

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(onClose).not.toHaveBeenCalled();
  });

  // An overlay over a sheet *is* the top layer, so it still answers.
  it('still takes Escape as an overlay over a slide-up', () => {
    const onClose = vi.fn();
    const store = createStore();
    store.set(slideUpOpenCountAtom, 1);

    render(
      <Provider store={store}>
        <EntityCommentsPanel entityId="entity-1" spaceId="space-1" onClose={onClose} presentation="overlay" />
      </Provider>
    );

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(onClose).toHaveBeenCalled();
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
