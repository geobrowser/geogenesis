import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { Provider, createStore } from 'jotai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DebatesHubButton } from './debates-hub-button';
import { debatesHubAtom } from '~/atoms';

const mocks = vi.hoisted(() => ({
  ready: true,
  authenticated: true,
  incomingRequestCount: 0,
}));

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

  it('keeps announcing the pending request count while signed in', () => {
    mocks.incomingRequestCount = 3;
    renderButton();

    expect(screen.getByRole('button', { name: 'Debates, 3 pending requests' })).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  /**
   * GEO-2689. A megaphone on its own does not say "debates", and the button had nothing else to go
   * on. The word has to agree with what the button already answers to — the panel it opens is
   * headed "Debates" and so is its own accessible name, and a control that shows one name while
   * answering to another is worse than one showing none.
   */
  describe('label', () => {
    it('says what the button is for', () => {
      renderButton();

      expect(screen.getByText('Debates')).toBeInTheDocument();
    });

    it('shows the same word the button answers to', () => {
      renderButton();

      const button = screen.getByRole('button', { name: 'Debates' });

      expect(button).toHaveTextContent('Debates');
    });

    // The count is the reason the accessible name is written by hand, and it has to keep winning
    // over the visible text now that there is some.
    it('still announces the pending count rather than reading out the label and a bare number', () => {
      mocks.incomingRequestCount = 2;
      renderButton();

      expect(screen.getByRole('button', { name: 'Debates, 2 pending requests' })).toBeInTheDocument();
      expect(screen.getByText('Debates')).toBeInTheDocument();
      expect(screen.getByText('2')).toBeInTheDocument();
    });

    // Phones have the least room in the navbar, so the label is dropped there — but only the
    // visible one. `aria-label` still names the button for anyone reading it that way.
    it('drops the visible label on phones without dropping the name', () => {
      renderButton();

      expect(screen.getByText('Debates')).toHaveClass('sm:hidden');
      expect(screen.getByRole('button', { name: 'Debates' })).toBeInTheDocument();
    });
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
