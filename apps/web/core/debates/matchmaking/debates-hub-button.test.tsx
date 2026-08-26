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
    expect(screen.getByRole('button', { name: 'Debate' })).toBeInTheDocument();
  });

  it('stays hidden for a signed-out visitor', () => {
    mocks.authenticated = false;
    renderButton();
    // The hub is the only opener for the panel, and every tab behind it needs an identity.
    expect(screen.queryByRole('button', { name: /Debate/ })).not.toBeInTheDocument();
  });

  it('stays hidden until Privy has restored the session', () => {
    // `authenticated` is false while Privy is still resolving, so a returning user sees the button
    // appear late rather than watching it flash in and out.
    mocks.ready = false;
    mocks.authenticated = false;
    renderButton();

    expect(screen.queryByRole('button', { name: /Debate/ })).not.toBeInTheDocument();
  });

  it('keeps announcing the pending request count while signed in', () => {
    mocks.incomingRequestCount = 3;
    renderButton();

    expect(screen.getByRole('button', { name: 'Debate, 3 pending requests' })).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  /**
   * GEO-2689. A megaphone on its own does not say "debate", and the button had nothing else to go
   * on. Whatever the word is, the button has to answer to it: a control that shows one name while
   * answering to another is worse than one showing none, so these pin the visible label and the
   * accessible name to each other rather than to a particular spelling.
   */
  describe('label', () => {
    it('says what the button is for', () => {
      renderButton();

      expect(screen.getByText('Debate')).toBeInTheDocument();
    });

    it('shows the same word the button answers to', () => {
      renderButton();

      const button = screen.getByRole('button');
      const visible = button.querySelector('span')?.textContent ?? '';

      // Read back rather than asserted twice over: the point is that the two agree, whichever word
      // is chosen, so this fails if either is edited without the other.
      expect(visible).not.toBe('');
      expect(button).toHaveAccessibleName(visible);
    });

    // The count is the reason the accessible name is written by hand, and it has to keep winning
    // over the visible text now that there is some.
    it('still announces the pending count rather than reading out the label and a bare number', () => {
      mocks.incomingRequestCount = 2;
      renderButton();

      expect(screen.getByRole('button', { name: 'Debate, 2 pending requests' })).toBeInTheDocument();
      expect(screen.getByText('Debate')).toBeInTheDocument();
      expect(screen.getByText('2')).toBeInTheDocument();
    });

    // Set in the browse sidebar's menu type so the two read as the same kind of navigation text,
    // rather than the navbar's heavier metadata weight.
    it('is set in the browse menu type', () => {
      renderButton();

      expect(screen.getByText('Debate')).toHaveClass('text-browseMenu');
    });

    // Phones have the least room in the navbar, so the label is dropped there — but only the
    // visible one. `aria-label` still names the button for anyone reading it that way.
    it('drops the visible label on phones without dropping the name', () => {
      renderButton();

      expect(screen.getByText('Debate')).toHaveClass('sm:hidden');
      expect(screen.getByRole('button', { name: 'Debate' })).toBeInTheDocument();
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
