import { cleanup, render, screen } from '@testing-library/react';

import { Provider, createStore } from 'jotai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { graphExplorerActiveAtom } from '~/atoms';

import { GraphExplorerPage } from './graph-explorer-page';

const TOPIC = '4ed3162278994f29bde7a6f7cf60e28e';
const flags = vi.hoisted(() => ({ graphExplorer: true }));

vi.mock('next/navigation', () => ({
  usePathname: () => `/explore/graph/${TOPIC}`,
  useSearchParams: () => new URLSearchParams(`topic=${TOPIC}`),
}));
vi.mock('~/core/state/feature-flags', () => ({ useFeatureFlag: () => flags.graphExplorer }));
vi.mock('~/core/hooks/use-hydrated', () => ({ useHydrated: () => true }));
vi.mock('~/core/graph-explorer/use-graph-navigation', () => ({ useGraphNavigation: () => vi.fn() }));
vi.mock('~/core/graph-explorer/use-graph-explorer', () => ({ useTopicGraphScope: () => null }));
vi.mock('~/core/topics/use-topic-space-scope', () => ({ useTopicSpaceScope: () => undefined }));
vi.mock('~/core/sync/use-store', () => ({ useQueryEntity: () => ({ entity: null }) }));
vi.mock('~/design-system/prefetch-link', () => ({
  PrefetchLink: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));
vi.mock('./graph-viewer', () => ({ GraphViewer: () => <div data-testid="viewer" /> }));

let store: ReturnType<typeof createStore>;
beforeEach(() => {
  flags.graphExplorer = true;
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

  it('is not available with the flag off, and keeps the app chrome', () => {
    flags.graphExplorer = false;
    renderPage();
    expect(screen.getByRole('heading', { name: 'Not available yet' })).toBeTruthy();
    expect(screen.queryByTestId('viewer')).toBeNull();
    expect(store.get(graphExplorerActiveAtom)).toBe(false);
  });
});
