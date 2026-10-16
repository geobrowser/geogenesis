import '@testing-library/jest-dom/vitest';
import { cleanup, render } from '@testing-library/react';

import * as React from 'react';

import { Provider, createStore } from 'jotai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EntityPanelSlotReset } from './entity-panel-slot-reset';
import { debateFeedPanelAtom, exploreDebateClaimsPanelAtom } from '~/atoms';

const pathname = { current: '/root/explore' };
vi.mock('next/navigation', () => ({ usePathname: () => pathname.current }));

const OPEN = 'debate-1';
const FEED_OPEN = 'claims' as const;

beforeEach(() => {
  pathname.current = '/root/explore';
});

afterEach(cleanup);

function renderReset(store: ReturnType<typeof createStore>) {
  const view = render(
    <Provider store={store}>
      <EntityPanelSlotReset />
    </Provider>
  );
  return {
    view,
    navigateTo(next: string) {
      pathname.current = next;
      view.rerender(
        <Provider store={store}>
          <EntityPanelSlotReset />
        </Provider>
      );
    },
  };
}

/**
 * The panel is held in an atom so the feed has one of it rather than one per card. An atom outlives
 * the route, though, and `ExploreFeedCard` draws the same debate card on profiles and activity
 * feeds — so without this the panel reopened, unasked, the next time that debate was listed.
 */
describe('EntityPanelSlotReset', () => {
  it('closes an open claims panel when the reader navigates', () => {
    const store = createStore();
    store.set(exploreDebateClaimsPanelAtom, OPEN);

    renderReset(store).navigateTo('/space/space-1/person-1');

    expect(store.get(exploreDebateClaimsPanelAtom)).toBeNull();
  });

  /*
   * This component mounts once, under every route, so a panel opened on the page it is already on
   * must survive. Clearing on mount would shut the panel the moment it opened.
   */
  it('leaves a panel opened on the current page alone', () => {
    const store = createStore();
    renderReset(store);

    store.set(exploreDebateClaimsPanelAtom, OPEN);

    expect(store.get(exploreDebateClaimsPanelAtom)).not.toBeNull();
  });

  // The full-screen feed's panel was hoisted for the same reason and leaks the same way: its own
  // local state died with the route, the atom does not.
  it('closes the full-screen feed panel when the reader navigates', () => {
    const store = createStore();
    store.set(debateFeedPanelAtom, FEED_OPEN);

    renderReset(store).navigateTo('/space/space-1/person-1');

    expect(store.get(debateFeedPanelAtom)).toBeNull();
  });

  it('leaves it alone on a re-render that is not a navigation', () => {
    const store = createStore();
    store.set(exploreDebateClaimsPanelAtom, OPEN);

    store.set(debateFeedPanelAtom, FEED_OPEN);

    renderReset(store).navigateTo('/root/explore');

    expect(store.get(exploreDebateClaimsPanelAtom)).not.toBeNull();
    expect(store.get(debateFeedPanelAtom)).not.toBeNull();
  });
});
