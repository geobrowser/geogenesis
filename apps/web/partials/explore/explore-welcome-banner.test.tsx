import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { Provider, createStore } from 'jotai';
import { afterEach, describe, expect, it } from 'vitest';

import { ExploreWelcomeBanner } from './explore-welcome-banner';
import { debatesHubAtom, dismissedNoticesAtom } from '~/atoms';

function renderBanner(store = createStore()) {
  render(
    <Provider store={store}>
      <ExploreWelcomeBanner />
    </Provider>
  );

  return store;
}

afterEach(cleanup);

describe('ExploreWelcomeBanner', () => {
  it('opens the debates hub on the claims tab when the inline link is clicked', async () => {
    const store = renderBanner();
    expect(store.get(debatesHubAtom)).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'debate hub' }));

    // Claims is the hub's default tab, and the one the banner's copy points at.
    expect(store.get(debatesHubAtom)).toEqual({ tab: 'claims' });
  });

  // The link and the dismiss button sit in the same card; opening the hub shouldn't cost the
  // user the banner, and dismissing shouldn't open a panel they didn't ask for.
  it('keeps the banner visible after opening the hub', async () => {
    const store = renderBanner();

    await userEvent.click(screen.getByRole('button', { name: 'debate hub' }));

    expect(store.get(dismissedNoticesAtom)).not.toContain('exploreWelcomeCurator');
    expect(screen.getByRole('button', { name: 'debate hub' })).toBeInTheDocument();
  });

  it('dismisses without opening the hub', async () => {
    const store = renderBanner();

    await userEvent.click(screen.getByRole('button', { name: 'Dismiss welcome banner' }));

    expect(store.get(debatesHubAtom)).toBeNull();
    expect(screen.queryByRole('button', { name: 'debate hub' })).not.toBeInTheDocument();
  });

  it('stays hidden once the notice has already been dismissed', () => {
    const store = createStore();
    store.set(dismissedNoticesAtom, ['exploreWelcomeCurator']);
    renderBanner(store);

    expect(screen.queryByRole('button', { name: 'debate hub' })).not.toBeInTheDocument();
  });
});
