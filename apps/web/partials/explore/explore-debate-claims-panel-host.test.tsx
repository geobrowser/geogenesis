import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen } from '@testing-library/react';

import * as React from 'react';

import { Provider, createStore } from 'jotai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Debate } from '~/core/debates/api';

import { ExploreDebateClaimsPanelHost } from './explore-debate-claims-panel-host';
import { exploreDebateClaimsPanelAtom } from '~/atoms';

const pathname = { current: '/root/explore' };
vi.mock('next/navigation', () => ({ usePathname: () => pathname.current }));

vi.mock('~/core/debates/browse/debate-claims-panel', () => ({
  DebateClaimsPanel: ({ debate }: { debate: Debate }) => <aside data-testid="claims-panel">{debate.id}</aside>,
}));

const TARGET = { debateId: 'debate-1', debate: { id: 'debate-1' } as Debate, scope: {} };

beforeEach(() => {
  pathname.current = '/root/explore';
});

afterEach(cleanup);

function renderHost(store: ReturnType<typeof createStore>) {
  const tree = () => (
    <Provider store={store}>
      <ExploreDebateClaimsPanelHost />
    </Provider>
  );
  const view = render(tree());
  return {
    navigateTo(next: string) {
      pathname.current = next;
      view.rerender(tree());
    },
  };
}

// The atom outlives the route, and the same card is listed on profiles and activity feeds.
describe('ExploreDebateClaimsPanelHost', () => {
  it('draws the open debate', () => {
    const store = createStore();
    store.set(exploreDebateClaimsPanelAtom, TARGET);
    renderHost(store);

    expect(screen.getByTestId('claims-panel')).toHaveTextContent('debate-1');
  });

  it('closes when the reader navigates', () => {
    const store = createStore();
    store.set(exploreDebateClaimsPanelAtom, TARGET);

    renderHost(store).navigateTo('/space/space-1/person-1');

    expect(store.get(exploreDebateClaimsPanelAtom)).toBeNull();
    expect(screen.queryByTestId('claims-panel')).toBeNull();
  });

  // Mounted when the panel first opens, so closing on mount would shut it as it opened.
  it('keeps a panel opened on the current page', () => {
    const store = createStore();
    const { navigateTo } = renderHost(store);

    act(() => store.set(exploreDebateClaimsPanelAtom, TARGET));
    navigateTo('/root/explore');

    expect(screen.getByTestId('claims-panel')).toBeInTheDocument();
  });
});
