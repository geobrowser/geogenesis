import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { Provider, createStore } from 'jotai';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { EntityCommentsPanelHost } from './entity-comments-panel-host';
import { entityCommentsPanelAtom } from '~/atoms';

vi.mock('./entity-comments-panel', () => ({
  EntityCommentsPanel: ({ entityId, onClose }: { entityId: string; onClose: () => void }) => (
    <aside data-entity-comments-panel>
      <span>Comments for {entityId}</span>
      <button onClick={onClose}>Close</button>
    </aside>
  ),
}));

afterEach(cleanup);

function renderHost() {
  const store = createStore();
  store.set(entityCommentsPanelAtom, { entityId: 'entity-1', spaceId: 'space-1' });
  const view = render(
    <Provider store={store}>
      <div data-testid="page">Page behind the panel</div>
      <EntityCommentsPanelHost />
    </Provider>
  );
  return { store, view };
}

describe('EntityCommentsPanelHost', () => {
  it('closes when the reader clicks the page behind it', () => {
    const { store } = renderHost();
    expect(screen.getByText('Comments for entity-1')).toBeInTheDocument();

    fireEvent.pointerDown(screen.getByTestId('page'));

    expect(store.get(entityCommentsPanelAtom)).toBeNull();
  });

  it('stays open for clicks inside the panel', () => {
    const { store } = renderHost();

    fireEvent.pointerDown(screen.getByText('Comments for entity-1'));

    expect(store.get(entityCommentsPanelAtom)).not.toBeNull();
  });

  // Radix portals these out of the panel's DOM subtree, but to the reader they
  // are part of it — dismissing on them would close the panel mid-interaction.
  it('stays open for menus portalled out of the panel', () => {
    const { store } = renderHost();
    const menu = document.createElement('div');
    menu.setAttribute('role', 'menu');
    document.body.appendChild(menu);

    fireEvent.pointerDown(menu);

    expect(store.get(entityCommentsPanelAtom)).not.toBeNull();
    menu.remove();
  });

  // Clicking another card's comment button should move the panel to that
  // entity, not dismiss it and leave the reader with nothing.
  it('stays open for another comment button, which switches it', () => {
    const { store } = renderHost();
    const opener = document.createElement('button');
    opener.setAttribute('data-entity-comments-opener', '');
    document.body.appendChild(opener);

    fireEvent.pointerDown(opener);

    expect(store.get(entityCommentsPanelAtom)).not.toBeNull();
    opener.remove();
  });
});
