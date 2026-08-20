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

  it('aligns the header with the sidebar layout on the space home page', () => {
    render(<SpaceHeaderContentContainer hasSidebar>Header</SpaceHeaderContentContainer>);

    expect(screen.getByText('Header').dataset.entityPageContentVariant).toBe('with-sidebar');
  });

  it('aligns the header with the sidebar layout on /root', () => {
    navigation.pathname = '/root';

    render(<SpaceHeaderContentContainer hasSidebar>Header</SpaceHeaderContentContainer>);

    expect(screen.getByText('Header').dataset.entityPageContentVariant).toBe('with-sidebar');
  });

  it('aligns the header with the sidebar layout on the community tab', () => {
    navigation.pathname = '/space/test-space/community';

    render(<SpaceHeaderContentContainer hasSidebar>Header</SpaceHeaderContentContainer>);

    expect(screen.getByText('Header').dataset.entityPageContentVariant).toBe('with-sidebar');
  });

  it('drops the sidebar width on nested space routes, which render no rail', () => {
    navigation.pathname = '/space/test-space/activity';

    render(<SpaceHeaderContentContainer hasSidebar>Header</SpaceHeaderContentContainer>);

    expect(screen.getByText('Header').dataset.entityPageContentVariant).toBe('content');
  });

  it('drops the sidebar width on authored content tabs, which share the overview URL', () => {
    navigation.search = 'tabId=team-tab';

    render(<SpaceHeaderContentContainer hasSidebar>Header</SpaceHeaderContentContainer>);

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
});
