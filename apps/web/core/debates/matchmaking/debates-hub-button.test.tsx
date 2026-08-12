import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { Provider, createStore } from 'jotai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DebatesHubButton } from './debates-hub-button';
import { debatesHubAtom } from '~/atoms';

const mocks = vi.hoisted(() => ({
  debatesEnabled: true,
  ready: true,
  authenticated: true,
  incomingRequestCount: 0,
}));

vi.mock('~/core/state/feature-flags', () => ({ useDebatesEnabled: () => mocks.debatesEnabled }));

vi.mock('../hooks', () => ({
  useGeoChatAuth: () => ({ ready: mocks.ready, authenticated: mocks.authenticated, accountKey: 'user-a' }),
  useDebateActivity: () => ({ data: { incoming_request_count: mocks.incomingRequestCount } }),
}));

vi.mock('./hooks', () => ({
  useDebateRequests: () => ({ data: undefined, isLoading: false, error: null }),
}));

function renderButton() {
  return render(
    <Provider store={createStore()}>
      <DebatesHubButton />
    </Provider>
  );
}

beforeEach(() => {
  mocks.debatesEnabled = true;
  mocks.ready = true;
  mocks.authenticated = true;
  mocks.incomingRequestCount = 0;
});

afterEach(cleanup);

describe('DebatesHubButton', () => {
  it('shows for a signed-in user', () => {
    renderButton();
    expect(screen.getByRole('button', { name: 'Debates' })).toBeInTheDocument();
  });

  it('stays hidden for a signed-out visitor', () => {
    mocks.authenticated = false;
    renderButton();
    // The hub is the only opener for the panel, and every tab behind it needs an identity.
    expect(screen.queryByRole('button', { name: /Debates/ })).not.toBeInTheDocument();
  });

  it('stays hidden until Privy has restored the session', () => {
    // `authenticated` is false while Privy is still resolving, so a returning user sees the button
    // appear late rather than watching it flash in and out.
    mocks.ready = false;
    mocks.authenticated = false;
    renderButton();

    expect(screen.queryByRole('button', { name: /Debates/ })).not.toBeInTheDocument();
  });

  it('stays hidden when debates are switched off, even signed in', () => {
    mocks.debatesEnabled = false;
    renderButton();
    expect(screen.queryByRole('button', { name: /Debates/ })).not.toBeInTheDocument();
  });

  it('keeps announcing the pending request count while signed in', () => {
    mocks.incomingRequestCount = 3;
    renderButton();

    expect(screen.getByRole('button', { name: 'Debates, 3 pending requests' })).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('leaves the hub closed when there is no button to open it', () => {
    mocks.authenticated = false;
    const store = createStore();
    render(
      <Provider store={store}>
        <DebatesHubButton />
      </Provider>
    );

    expect(store.get(debatesHubAtom)).toBeNull();
  });
});
