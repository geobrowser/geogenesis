import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';

import * as React from 'react';

import { Provider, createStore, useAtomValue, useSetAtom } from 'jotai';
import { afterEach, describe, expect, it } from 'vitest';

import type { Debate } from '~/core/debates/api';

import { useEntityCommentsPanel } from './use-entity-comments-panel';
import { useEntitySidePanel } from './use-entity-side-panel';
import {
  debateFeedPanelAtom,
  entityCommentsPanelAtom,
  entitySidePanelAtom,
  exploreDebateClaimsPanelAtom,
  openDebateFeedPanelAtom,
  openExploreDebateClaimsPanelAtom,
} from '~/atoms';

afterEach(cleanup);

/**
 * The app has one right-hand panel slot. These panels all draw at the same edge of the screen, so
 * two open at once simply covered each other — the reported symptom was closing one and finding the
 * other still there.
 */
function renderBothPanels() {
  const store = createStore();
  const wrapper = ({ children }: { children: React.ReactNode }) => <Provider store={store}>{children}</Provider>;

  const { result } = renderHook(
    () => ({
      side: useEntitySidePanel(),
      comments: useEntityCommentsPanel(),
      openExploreClaims: useSetAtom(openExploreDebateClaimsPanelAtom),
      openFeedPanel: useSetAtom(openDebateFeedPanelAtom),
    }),
    { wrapper }
  );

  return { store, result };
}

describe('the single entity panel slot', () => {
  it('closes the comments panel when an entity panel opens', () => {
    const { store, result } = renderBothPanels();

    act(() => result.current.comments.openComments('entity-1', 'space-1', 'claim'));
    expect(store.get(entityCommentsPanelAtom)).not.toBeNull();

    act(() => result.current.side.openSidePanel('entity-2', 'space-1', false));

    expect(store.get(entitySidePanelAtom)?.entityId).toBe('entity-2');
    expect(store.get(entityCommentsPanelAtom)).toBeNull();
  });

  it('closes the entity panel when the comments panel opens', () => {
    const { store, result } = renderBothPanels();

    act(() => result.current.side.openSidePanel('entity-2', 'space-1', false));
    expect(store.get(entitySidePanelAtom)).not.toBeNull();

    act(() => result.current.comments.openComments('entity-1', 'space-1', 'claim'));

    expect(store.get(entityCommentsPanelAtom)?.entityId).toBe('entity-1');
    expect(store.get(entitySidePanelAtom)).toBeNull();
  });

  it('leaves nothing open after closing the panel that replaced the other', () => {
    const { store, result } = renderBothPanels();

    act(() => result.current.comments.openComments('entity-1', 'space-1', 'claim'));
    act(() => result.current.side.openSidePanel('entity-2', 'space-1', false));
    act(() => result.current.side.closeSidePanel());

    expect(store.get(entitySidePanelAtom)).toBeNull();
    expect(store.get(entityCommentsPanelAtom)).toBeNull();
  });

  /*
   * Closing is not a cascade. With the slot exclusive the other panel is already shut, so a close
   * that also cleared it would be inventing a way to dismiss a panel nobody asked to dismiss — and
   * would fire on every close, including the first one of a session.
   */
  it('does not clear the other slot on close', () => {
    const { store, result } = renderBothPanels();

    act(() => result.current.side.openSidePanel('entity-2', 'space-1', false));

    act(() => store.set(entityCommentsPanelAtom, { entityId: 'entity-1', spaceId: 'space-1' }));

    act(() => result.current.side.closeSidePanel());

    expect(store.get(entityCommentsPanelAtom)).not.toBeNull();
  });

  it('closes the full-screen feed panel when an entity panel opens over it', () => {
    const { store, result } = renderBothPanels();

    act(() => result.current.openFeedPanel('claims'));
    act(() => result.current.side.openSidePanel('person-1', 'space-1', false));

    expect(store.get(entitySidePanelAtom)).not.toBeNull();
    expect(store.get(debateFeedPanelAtom)).toBeNull();
  });

  it('closes an entity panel when the feed opens one of its own', () => {
    const { store, result } = renderBothPanels();

    act(() => result.current.side.openSidePanel('person-1', 'space-1', false));
    act(() => result.current.openFeedPanel('comments'));

    expect(store.get(debateFeedPanelAtom)).toBe('comments');
    expect(store.get(entitySidePanelAtom)).toBeNull();
  });

  // Every panel in the slot against every other: whichever opened last is the only one left.
  it('leaves exactly one panel open whichever order they are opened in', () => {
    const { store, result } = renderBothPanels();

    act(() => result.current.comments.openComments('entity-1', 'space-1', 'claim'));
    act(() => result.current.openExploreClaims({ debateId: 'debate-1', debate: {} as Debate, scope: {} }));
    act(() => result.current.openFeedPanel('claims'));
    act(() => result.current.side.openSidePanel('entity-2', 'space-1', false));

    const open = [
      store.get(entitySidePanelAtom),
      store.get(entityCommentsPanelAtom),
      store.get(exploreDebateClaimsPanelAtom),
      store.get(debateFeedPanelAtom),
    ].filter(Boolean);

    expect(open).toHaveLength(1);
    expect(store.get(entitySidePanelAtom)?.entityId).toBe('entity-2');
  });

  it('still replaces a panel of its own kind', () => {
    const { store, result } = renderBothPanels();

    act(() => result.current.side.openSidePanel('entity-1', 'space-1', false));
    act(() => result.current.side.openSidePanel('entity-2', 'space-1', false));

    expect(store.get(entitySidePanelAtom)?.entityId).toBe('entity-2');
  });

  /*
   * The same thing counted as mounted panels, the way the reader sees it: a panel opened from a
   * control inside the open one replaces it, and closing that leaves none.
   */
  describe('opening from inside the open panel', () => {
    function Panels() {
      const side = useEntitySidePanel();
      const comments = useEntityCommentsPanel();
      return (
        <>
          {side.sidePanelTarget ? (
            <aside data-testid="open-panel">
              <button type="button" onClick={() => comments.openComments('entity-1', 'space-1', 'claim')}>
                Comments
              </button>
              <button type="button" onClick={side.closeSidePanel}>
                Close entity
              </button>
            </aside>
          ) : null}
          {comments.commentsTarget ? (
            <aside data-testid="open-panel">
              <button type="button" onClick={() => side.openSidePanel('author-1', 'space-1', false)}>
                Author
              </button>
              <button type="button" onClick={comments.closeComments}>
                Close comments
              </button>
            </aside>
          ) : null}
          <FeedPanel />
        </>
      );
    }
    function FeedPanel() {
      const open = useAtomValue(debateFeedPanelAtom);
      const side = useEntitySidePanel();
      return open ? (
        <aside data-testid="open-panel">
          <button type="button" onClick={() => side.openSidePanel('claim-1', 'space-1', false)}>
            Claim
          </button>
        </aside>
      ) : null;
    }
    function renderPanels() {
      const store = createStore();
      render(
        <Provider store={store}>
          <Panels />
        </Provider>
      );
      return store;
    }
    const mounted = () => screen.queryAllByTestId('open-panel').length;

    it('comments opened from the entity panel replace it', () => {
      const store = renderPanels();
      act(() => store.set(entitySidePanelAtom, { entityId: 'e', spaceId: 's', openedWithMainViewEditing: false }));
      expect(mounted()).toBe(1);

      fireEvent.click(screen.getByText('Comments'));
      expect(mounted()).toBe(1);
      expect(screen.getByText('Close comments')).toBeInTheDocument();

      fireEvent.click(screen.getByText('Close comments'));
      expect(mounted()).toBe(0);
    });

    it("a comment author's entity panel replaces the comments panel", () => {
      const store = renderPanels();
      act(() => store.set(entityCommentsPanelAtom, { entityId: 'e', spaceId: 's' }));

      fireEvent.click(screen.getByText('Author'));
      expect(mounted()).toBe(1);

      fireEvent.click(screen.getByText('Close entity'));
      expect(mounted()).toBe(0);
    });

    it("a claim opened from the full-screen feed's panel replaces it", () => {
      const store = renderPanels();
      act(() => store.set(debateFeedPanelAtom, 'claims'));

      fireEvent.click(screen.getByText('Claim'));
      expect(mounted()).toBe(1);

      fireEvent.click(screen.getByText('Close entity'));
      expect(mounted()).toBe(0);
    });
  });
});
