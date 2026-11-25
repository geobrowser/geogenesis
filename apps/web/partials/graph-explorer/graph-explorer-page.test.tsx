import { cleanup, render, screen } from '@testing-library/react';

import { Provider, createStore } from 'jotai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GraphExplorerNotFound, GraphExplorerPage } from './graph-explorer-page';
import { graphExplorerUnavailableAtom } from '~/atoms';

const TOPIC = '4ed3162278994f29bde7a6f7cf60e28e';
const SPACE = '89bd89bf28ff8a0963faf92a8c905e20';
const flags = vi.hoisted(() => ({ hydrated: true }));
const page = vi.hoisted(() => ({
  search: '',
  topic: true,
  close: undefined as { href: string; label: string } | null | undefined,
}));

vi.mock('next/navigation', () => ({
  usePathname: () => `/explore/graph/${TOPIC}`,
  useSearchParams: () => new URLSearchParams(`${page.topic ? `topic=${TOPIC}` : ''}${page.search}`),
}));
vi.mock('~/core/hooks/use-hydrated', () => ({ useHydrated: () => flags.hydrated }));
vi.mock('~/core/graph-explorer/use-graph-navigation', () => ({ useGraphNavigation: () => vi.fn() }));
vi.mock('~/core/graph-explorer/use-graph-explorer', () => ({ useTopicGraphScope: () => null }));
vi.mock('~/core/topics/use-topic-space-scope', () => ({ useTopicSpaceScope: () => undefined }));
vi.mock('~/core/sync/use-store', () => ({ useQueryEntity: () => ({ entity: null }) }));
vi.mock('~/design-system/prefetch-link', () => ({
  PrefetchLink: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));
vi.mock('./graph-viewer', () => ({
  GraphViewer: ({ close }: { close: typeof page.close }) => {
    page.close = close;
    return <div data-testid="viewer" />;
  },
}));

let store: ReturnType<typeof createStore>;
beforeEach(() => {
  flags.hydrated = true;
  page.search = '';
  page.topic = true;
  page.close = undefined;
  store = createStore();
});
afterEach(cleanup);

const renderPage = () =>
  render(
    <Provider store={store}>
      <GraphExplorerPage entityId={TOPIC} />
    </Provider>
  );

describe('GraphExplorerPage', () => {
  // Like an unlisted video: the flag only hides the entry points, so it isn't read here at all.
  it('opens for anyone with a link and keeps the app chrome off', () => {
    renderPage();
    expect(screen.getByTestId('viewer')).toBeTruthy();
    expect(store.get(graphExplorerUnavailableAtom)).toBe(false);
  });

  it('always has a way out: the topic in its space, else Explore', () => {
    renderPage();
    expect(page.close?.href).toBe('/explore');
    cleanup();
    page.search = `&space=${SPACE}`;
    renderPage();
    expect(page.close?.href).toContain(SPACE);
    expect(page.close?.href).toContain(TOPIC);
  });

  it('renders the explorer shell and skeleton before hydration', () => {
    flags.hydrated = false;
    renderPage();
    expect(screen.getByTestId('graph-explorer-shell')).toBeTruthy();
    expect(screen.getByTestId('graph-skeleton-stage').getAttribute('aria-busy')).toBe('true');
    expect(document.querySelectorAll('[data-skeleton-node]').length).toBeGreaterThan(10);
    // One stage per side of the map's phone breakpoint, never both (the old 599/600 pair overlapped at 599px).
    const stages = [...screen.getByTestId('graph-skeleton-stage').children].filter(el =>
      el.hasAttribute('aria-hidden')
    );
    expect(stages.map(el => el.className.split(' ').filter(name => name.endsWith(':hidden')))).toEqual([
      ['graph-phone:hidden'],
      ['graph-wide:hidden'],
    ]);
    expect(screen.queryByTestId('viewer')).toBeNull();
    expect(store.get(graphExplorerUnavailableAtom)).toBe(false);
  });

  it('is not available without a topic, and gives the app chrome back until it leaves', () => {
    page.topic = false;
    const { unmount } = renderPage();
    expect(screen.getByRole('heading', { name: 'Not available yet' })).toBeTruthy();
    expect(screen.queryByTestId('viewer')).toBeNull();
    expect(store.get(graphExplorerUnavailableAtom)).toBe(true);
    unmount();
    expect(store.get(graphExplorerUnavailableAtom)).toBe(false);
  });
});

describe('GraphExplorerNotFound', () => {
  it('gives the app chrome back with a way out', () => {
    render(
      <Provider store={store}>
        <GraphExplorerNotFound />
      </Provider>
    );
    expect(screen.getByRole('heading', { name: 'Nothing to show' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Go to Explore' }).getAttribute('href')).toBe('/explore');
    expect(store.get(graphExplorerUnavailableAtom)).toBe(true);
  });
});
