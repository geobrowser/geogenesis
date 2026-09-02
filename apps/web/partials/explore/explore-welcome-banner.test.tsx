import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { Provider, createStore } from 'jotai';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ExploreWelcomeBanner } from './explore-welcome-banner';
import { debatesHubAtom, dismissedNoticesAtom } from '~/atoms';

// Deliberately the literal rather than an import of the component's `WELCOME_BANNER_ID`. The id is
// a persistence contract: it is already in real users' localStorage, and renaming it re-shows the
// banner to everyone who has dismissed it. Importing the const would let a rename slip through
// green; hardcoding it means the rename has to be a conscious edit here too.
const PERSISTED_NOTICE_ID = 'exploreWelcomeCurator';

function renderBanner(store = createStore()) {
  render(
    <Provider store={store}>
      <ExploreWelcomeBanner />
    </Provider>
  );

  return store;
}

const hubLink = () => screen.getByRole('button', { name: 'debate hub' });

// `dismissedNoticesAtom` is an `atomWithStorage`, so a fresh `createStore()` is not a fresh slate —
// it rehydrates from localStorage, and a dismissal in one case would otherwise hide the banner in
// every case after it.
beforeEach(() => localStorage.clear());

afterEach(cleanup);

describe('ExploreWelcomeBanner', () => {
  it('opens the debates hub on the claims tab when the inline link is clicked', async () => {
    const store = renderBanner();
    expect(store.get(debatesHubAtom)).toBeNull();

    await userEvent.click(hubLink());

    // Claims is where the copy points the reader — taking a position on a claim is the first step,
    // not requests or matches.
    expect(store.get(debatesHubAtom)).toEqual({ tab: 'claims' });
  });

  // The link and the dismiss button sit in the same card, and the panel overlays the page the
  // banner is on. Opening the hub shouldn't cost the user the banner underneath it.
  it('keeps the banner visible after opening the hub', async () => {
    const store = renderBanner();

    await userEvent.click(hubLink());

    expect(store.get(dismissedNoticesAtom)).not.toContain(PERSISTED_NOTICE_ID);
    expect(hubLink()).toBeInTheDocument();
  });

  it('dismisses without opening the hub', async () => {
    const store = renderBanner();

    await userEvent.click(screen.getByRole('button', { name: 'Dismiss welcome banner' }));

    expect(store.get(debatesHubAtom)).toBeNull();
    expect(screen.queryByRole('button', { name: 'debate hub' })).not.toBeInTheDocument();
  });

  // Pins the stored value itself, not just the round trip: users who dismissed the curator-era
  // banner must stay dismissed now that the copy is debate-focused.
  it('dismisses under the notice id already persisted for existing users', async () => {
    const store = renderBanner();

    await userEvent.click(screen.getByRole('button', { name: 'Dismiss welcome banner' }));

    expect(store.get(dismissedNoticesAtom)).toEqual([PERSISTED_NOTICE_ID]);
  });

  it('stays hidden once the notice has already been dismissed', () => {
    const store = createStore();
    store.set(dismissedNoticesAtom, [PERSISTED_NOTICE_ID]);
    renderBanner(store);

    expect(screen.queryByRole('button', { name: 'debate hub' })).not.toBeInTheDocument();
  });
});
