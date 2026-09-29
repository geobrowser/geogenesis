import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { Provider, createStore } from 'jotai';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ExploreWelcomeBanner } from './explore-welcome-banner';
import { dismissedNoticesAtom } from '~/atoms';

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

const heading = () => screen.queryByRole('heading', { name: 'Welcome to Geo' });

// `dismissedNoticesAtom` is an `atomWithStorage`, so a fresh `createStore()` is not a fresh slate —
// it rehydrates from localStorage, and a dismissal in one case would otherwise hide the banner in
// every case after it.
beforeEach(() => localStorage.clear());

afterEach(cleanup);

describe('ExploreWelcomeBanner', () => {
  it('renders until dismissed', () => {
    renderBanner();

    expect(heading()).toBeInTheDocument();
  });

  it('hides when dismissed', async () => {
    renderBanner();

    await userEvent.click(screen.getByRole('button', { name: 'Dismiss welcome banner' }));

    expect(heading()).not.toBeInTheDocument();
  });

  // Pins the stored value itself, not just the round trip: users who dismissed an earlier
  // version of the banner must stay dismissed when the copy changes.
  it('dismisses under the notice id already persisted for existing users', async () => {
    const store = renderBanner();

    await userEvent.click(screen.getByRole('button', { name: 'Dismiss welcome banner' }));

    expect(store.get(dismissedNoticesAtom)).toEqual([PERSISTED_NOTICE_ID]);
  });

  it('stays hidden once the notice has already been dismissed', () => {
    const store = createStore();
    store.set(dismissedNoticesAtom, [PERSISTED_NOTICE_ID]);
    renderBanner(store);

    expect(heading()).not.toBeInTheDocument();
  });
});
