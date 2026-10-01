import '@testing-library/jest-dom/vitest';
import { act, cleanup, renderHook } from '@testing-library/react';

import * as React from 'react';

import { Provider, createStore } from 'jotai';
import { afterEach, describe, expect, it } from 'vitest';

import { useEntityCommentsPanel } from './use-entity-comments-panel';
import { useEntitySidePanel } from './use-entity-side-panel';
import { entityCommentsPanelAtom, entitySidePanelAtom } from '~/atoms';

afterEach(cleanup);

/**
 * The app has one right-hand panel slot. Both panels are app-level overlays at the same position,
 * so two open at once simply covered each other — the reported symptom was closing one and finding
 * the other still there.
 */
function renderBothPanels() {
  const store = createStore();
  const wrapper = ({ children }: { children: React.ReactNode }) => <Provider store={store}>{children}</Provider>;

  const { result } = renderHook(() => ({ side: useEntitySidePanel(), comments: useEntityCommentsPanel() }), {
    wrapper,
  });

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

  it('still replaces a panel of its own kind', () => {
    const { store, result } = renderBothPanels();

    act(() => result.current.side.openSidePanel('entity-1', 'space-1', false));
    act(() => result.current.side.openSidePanel('entity-2', 'space-1', false));

    expect(store.get(entitySidePanelAtom)?.entityId).toBe('entity-2');
  });
});
