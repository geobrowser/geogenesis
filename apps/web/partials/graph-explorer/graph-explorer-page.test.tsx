import { cleanup, render, screen } from '@testing-library/react';

import { Provider, createStore } from 'jotai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GraphExplorerPage } from './graph-explorer-page';
import { graphExplorerActiveAtom } from '~/atoms';

const TOPIC = '4ed3162278994f29bde7a6f7cf60e28e';
const SPACE = '89bd89bf28ff8a0963faf92a8c905e20';
const flags = vi.hoisted(() => ({ graphExplorer: true, hydrated: true }));
const page = vi.hoisted(() => ({ search: '', close: undefined as { href: string; label: string } | null | undefined }));

vi.mock('next/navigation', () => ({
  usePathname: () => `/explore/graph/${TOPIC}`,
  useSearchParams: () => new URLSearchParams(`topic=${TOPIC}${page.search}`),
}));
vi.mock('~/core/state/feature-flags', () => ({ useFeatureFlag: () => flags.graphExplorer }));
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
  flags.graphExplorer = true;
  flags.hydrated = true;
  page.search = '';
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
  it('takes the screen while mounted and gives the app chrome back on leaving', () => {
    const { unmount } = renderPage();
    expect(screen.getByTestId('viewer')).toBeTruthy();
    expect(store.get(graphExplorerActiveAtom)).toBe(true);
    unmount();
    expect(store.get(graphExplorerActiveAtom)).toBe(false);
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

  it('renders the explorer shell and skeleton before hydration, whatever the flag', () => {
    flags.graphExplorer = false;
    flags.hydrated = false;
    renderPage();
    expect(screen.getByTestId('graph-explorer-shell')).toBeTruthy();
    expect(screen.getByTestId('graph-skeleton-stage').getAttribute('aria-busy')).toBe('true');
    expect(document.querySelectorAll('[data-skeleton-node]').length).toBeGreaterThan(10);
    expect(screen.queryByText('Not available yet')).toBeNull();
    expect(screen.queryByTestId('viewer')).toBeNull();
    expect(store.get(graphExplorerActiveAtom)).toBe(true);
  });

  it('is not available with the flag off, and keeps the app chrome', () => {
    flags.graphExplorer = false;
    renderPage();
    expect(screen.getByRole('heading', { name: 'Not available yet' })).toBeTruthy();
    expect(screen.queryByTestId('viewer')).toBeNull();
    expect(store.get(graphExplorerActiveAtom)).toBe(false);
  });
});
