import { act, cleanup, fireEvent, render } from '@testing-library/react';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { ActionSurfaceArticle } from '~/core/action-context-provider';
import type { ExploreFeedItem } from '~/core/explore/explore-card-item';

import { ExploreCardSurface } from '~/partials/explore/explore-card-chrome';

/** GEO-3234. Explore cards feed the seen store from the impression and click tracking they have. */
const capture = vi.hoisted(() => vi.fn());
const store = vi.hoisted(() => ({ recordImpression: vi.fn(), recordEngagement: vi.fn() }));
vi.mock('~/core/analytics', () => ({ capture, analyticsContextRevision: () => 0 }));
vi.mock('~/core/explore/seen-demotion/seen-store', () => ({ seenStore: () => store }));

const observers = new Map<Element, IntersectionObserverCallback>();
beforeEach(() => {
  window.history.replaceState({}, '', '/explore');
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(private callback: IntersectionObserverCallback) {}
      observe = (element: Element) => observers.set(element, this.callback);
      disconnect() {}
    }
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  observers.clear();
  capture.mockReset();
  store.recordImpression.mockReset();
  store.recordEngagement.mockReset();
});

const ITEM = {
  entityId: 'e1',
  spaceId: 'space',
  types: [],
  ranking: { version: 'best-1+seen.1', seenDemoted: true },
} as unknown as ExploreFeedItem;

function mount() {
  return render(
    <ExploreCardSurface item={ITEM} itemPosition={4}>
      <ActionSurfaceArticle>
        <button>Open</button>
      </ActionSurfaceArticle>
    </ExploreCardSurface>
  );
}

it('records a view when the card is shown, with the demotion marker on the impression', () => {
  const { container } = mount();
  const article = container.querySelector('article')!;
  act(() =>
    observers.get(article)!(
      [{ target: article, isIntersecting: true, intersectionRatio: 1 } as unknown as IntersectionObserverEntry],
      {} as IntersectionObserver
    )
  );

  expect(store.recordImpression).toHaveBeenCalledWith('e1', expect.any(String));
  const impression = capture.mock.calls.find(([event]) => event === 'component_impression')!;
  expect(impression[1]).toMatchObject({ feed_version: 'best-1+seen.1', feed_seen_demoted: true });
});

it('records engagement on any click inside the card', () => {
  const { getByRole } = mount();
  fireEvent.click(getByRole('button', { name: 'Open' }));
  expect(store.recordEngagement).toHaveBeenCalledWith('e1');
});
