import { cleanup, render, screen } from '@testing-library/react';

import { Provider, createStore } from 'jotai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SpaceChromeGate, SpaceHeaderContentContainer, SpaceHeaderContentGate } from './space-chrome-gate';
import { spaceSidebarHasContentAtom } from '~/atoms';

const navigation = vi.hoisted(() => ({
  pathname: '/space/test-space',
  search: '',
}));

vi.mock('next/navigation', () => ({
  usePathname: () => navigation.pathname,
  useSearchParams: () => new URLSearchParams(navigation.search),
}));

describe('space chrome layout', () => {
  beforeEach(() => {
    navigation.pathname = '/space/test-space';
    navigation.search = '';
  });

  afterEach(cleanup);

  it('renders the wide layout when a rail is present, regardless of route', () => {
    render(<SpaceHeaderContentContainer hasSidebar>Header</SpaceHeaderContentContainer>);

    expect(screen.getByText('Header').dataset.entityPageContentVariant).toBe('with-sidebar');
  });

  it('does not seed the sidebar width on nested space routes, which render no rail', () => {
    navigation.pathname = '/space/test-space/activity';
    const store = createStore();
    store.set(spaceSidebarHasContentAtom, null);

    render(
      <Provider store={store}>
        <SpaceHeaderContentGate serverHasSidebar isExternalTopic={false}>
          Header
        </SpaceHeaderContentGate>
      </Provider>
    );

    expect(screen.getByText('Header').dataset.entityPageContentVariant).toBe('content');
  });

  it('does not seed the sidebar width on authored content tabs, which share the overview URL', () => {
    navigation.search = 'tabId=team-tab';
    const store = createStore();
    store.set(spaceSidebarHasContentAtom, null);

    render(
      <Provider store={store}>
        <SpaceHeaderContentGate serverHasSidebar isExternalTopic={false}>
          Header
        </SpaceHeaderContentGate>
      </Provider>
    );

    expect(screen.getByText('Header').dataset.entityPageContentVariant).toBe('content');
  });

  it('keeps the readable header width when the home page has no sidebar', () => {
    render(<SpaceHeaderContentContainer hasSidebar={false}>Header</SpaceHeaderContentContainer>);

    expect(screen.getByText('Header').dataset.entityPageContentVariant).toBe('content');
  });

  it('hides the shared chrome on debate routes', () => {
    navigation.pathname = '/space/test-space/debates/debate-id';

    render(<SpaceChromeGate>Header</SpaceChromeGate>);

    expect(screen.queryByText('Header')).toBeNull();
  });

  it('collapses the header when the rail reports empty, even if the server seeded a rail', () => {
    navigation.pathname = '/root';
    const store = createStore();
    store.set(spaceSidebarHasContentAtom, false);

    render(
      <Provider store={store}>
        <SpaceHeaderContentGate serverHasSidebar isExternalTopic={false}>
          Header
        </SpaceHeaderContentGate>
      </Provider>
    );

    expect(screen.getByText('Header').dataset.entityPageContentVariant).toBe('content');
  });

  it('keeps the readable width on root until the Explore rail reports content', () => {
    navigation.pathname = '/root';
    const store = createStore();
    store.set(spaceSidebarHasContentAtom, null);

    render(
      <Provider store={store}>
        <SpaceHeaderContentGate serverHasSidebar={false} isExternalTopic={false}>
          Header
        </SpaceHeaderContentGate>
      </Provider>
    );

    expect(screen.getByText('Header').dataset.entityPageContentVariant).toBe('content');
  });

  it('widens the root header once the Explore rail reports content', () => {
    navigation.pathname = '/root';
    const store = createStore();
    store.set(spaceSidebarHasContentAtom, true);

    render(
      <Provider store={store}>
        <SpaceHeaderContentGate serverHasSidebar={false} isExternalTopic={false}>
          Header
        </SpaceHeaderContentGate>
      </Provider>
    );

    expect(screen.getByText('Header').dataset.entityPageContentVariant).toBe('with-sidebar');
  });

  it('keeps a non-root server-seeded header width until a rail has reported', () => {
    navigation.pathname = '/space/test-space';
    const store = createStore();
    store.set(spaceSidebarHasContentAtom, null);

    render(
      <Provider store={store}>
        <SpaceHeaderContentGate serverHasSidebar isExternalTopic={false}>
          Header
        </SpaceHeaderContentGate>
      </Provider>
    );

    expect(screen.getByText('Header').dataset.entityPageContentVariant).toBe('with-sidebar');
  });

  it('widens any tab once its rail reports content, not just the overview routes', () => {
    // A nested route that is not a seed route: the header still widens because the
    // rail itself reported content, so header width follows content on every tab.
    navigation.pathname = '/space/test-space/activity';
    const store = createStore();
    store.set(spaceSidebarHasContentAtom, true);

    render(
      <Provider store={store}>
        <SpaceHeaderContentGate serverHasSidebar={false} isExternalTopic={false}>
          Header
        </SpaceHeaderContentGate>
      </Provider>
    );

    expect(screen.getByText('Header').dataset.entityPageContentVariant).toBe('with-sidebar');
  });
});

/**
 * A person's Debates tab renders the same feed from the same route, but as a tab
 * rather than as the whole surface. Stripping the chrome there takes away the tab
 * bar that got you here.
 */
describe('keepChrome', () => {
  // The suite's cleanup lives in the describe above, so without this the second
  // case reads the first one's DOM and passes whatever the gate does.
  afterEach(cleanup);

  it('keeps the chrome on a debates route when asked', () => {
    navigation.pathname = '/space/f3dab79cb5a3d9d1759656dd5361d1c6/debates';

    render(
      <SpaceChromeGate keepChrome>
        <div>header</div>
      </SpaceChromeGate>
    );

    expect(screen.queryByText('header')).not.toBeNull();
  });

  it('still strips it everywhere else', () => {
    navigation.pathname = '/space/f3dab79cb5a3d9d1759656dd5361d1c6/debates';

    render(
      <SpaceChromeGate>
        <div>header</div>
      </SpaceChromeGate>
    );

    expect(screen.queryByText('header')).toBeNull();
  });
});
