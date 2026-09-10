import { render } from '@testing-library/react';

import * as React from 'react';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DeepLinkHandler } from './deep-link-handler';

const mocks = {
  pathname: '/explore',
  search: '',
  ready: true,
  authenticated: false,
  openSignIn: vi.fn(),
  signInOptions: null as { redirectTo?: string; analytics?: Record<string, unknown> } | null,
  openHub: vi.fn(),
  replaceState: vi.fn(),
};

vi.mock('next/navigation', () => ({
  usePathname: () => mocks.pathname,
  useSearchParams: () => new URLSearchParams(mocks.search),
}));

vi.mock('@geogenesis/auth', () => ({
  usePrivy: () => ({ ready: mocks.ready, authenticated: mocks.authenticated }),
}));

vi.mock('~/core/hooks/use-privy-sign-in', () => ({
  usePrivySignIn: (_onComplete: unknown, options: (typeof mocks)['signInOptions']) => {
    mocks.signInOptions = options;
    return mocks.openSignIn;
  },
}));

vi.mock('~/core/debates/matchmaking/use-debates-hub', () => ({
  useDebatesHub: () => ({
    isOpen: false,
    activeTab: 'claims',
    open: mocks.openHub,
    close: vi.fn(),
    toggle: vi.fn(),
    setTab: vi.fn(),
  }),
}));

/**
 * Both links are hosted here and both read `modal`, so the cases that matter are the ones where
 * they could interfere: each must act only on its own value, and clear only its own trigger.
 */
describe('DeepLinkHandler', () => {
  beforeEach(() => {
    mocks.pathname = '/explore';
    mocks.search = '';
    mocks.ready = true;
    mocks.authenticated = false;
    mocks.signInOptions = null;
    mocks.openSignIn.mockReset();
    mocks.openHub.mockReset();
    mocks.replaceState.mockReset();
    window.location.hash = '';
    vi.spyOn(window.history, 'replaceState').mockImplementation(mocks.replaceState);
  });

  it('stays out of the way of an ordinary page load', () => {
    render(<DeepLinkHandler />);

    expect(mocks.openSignIn).not.toHaveBeenCalled();
    expect(mocks.openHub).not.toHaveBeenCalled();
    expect(mocks.replaceState).not.toHaveBeenCalled();
  });

  describe('the sign-in link', () => {
    it('opens the dialog and clears the trigger', () => {
      mocks.search = 'modal=signin&via=marketing';

      render(<DeepLinkHandler />);

      expect(mocks.openSignIn).toHaveBeenCalledTimes(1);
      expect(mocks.replaceState).toHaveBeenCalledWith(null, '', '/explore');
    });

    it('does not open the hub', () => {
      mocks.search = 'modal=signin';

      render(<DeepLinkHandler />);

      expect(mocks.openHub).not.toHaveBeenCalled();
    });

    // A login dialog over a live session is noise; the link has done its job by landing them here.
    it('does not open the dialog for someone already signed in, but still clears', () => {
      mocks.search = 'modal=signin';
      mocks.authenticated = true;

      render(<DeepLinkHandler />);

      expect(mocks.openSignIn).not.toHaveBeenCalled();
      expect(mocks.replaceState).toHaveBeenCalledWith(null, '', '/explore');
    });

    // `authenticated` reads false while Privy restores, so acting early would show the login to a
    // signed-in viewer — the case above, missed by a few hundred milliseconds.
    it('waits for Privy before deciding', () => {
      mocks.search = 'modal=signin';
      mocks.ready = false;

      const { rerender } = render(<DeepLinkHandler />);
      expect(mocks.openSignIn).not.toHaveBeenCalled();
      expect(mocks.replaceState).not.toHaveBeenCalled();

      mocks.ready = true;
      rerender(<DeepLinkHandler />);

      expect(mocks.openSignIn).toHaveBeenCalledTimes(1);
    });

    // Signing up runs onboarding, which pushes the viewer back to the recorded destination. Left
    // as the arrival URL that would be the trigger again.
    it('records the cleaned URL as the post-auth destination', () => {
      mocks.search = 'modal=signin&via=marketing';

      render(<DeepLinkHandler />);

      expect(mocks.signInOptions?.redirectTo).toBe('/explore');
      expect(mocks.signInOptions?.analytics).toEqual({ link_source: 'marketing' });
    });
  });

  describe('the debates link', () => {
    it('opens the hub and clears the trigger', () => {
      mocks.search = 'modal=debates&via=email';

      render(<DeepLinkHandler />);

      expect(mocks.openHub).toHaveBeenCalledTimes(1);
      expect(mocks.replaceState).toHaveBeenCalledWith(null, '', '/explore');
    });

    it('does not open the sign-in dialog', () => {
      mocks.search = 'modal=debates';

      render(<DeepLinkHandler />);

      expect(mocks.openSignIn).not.toHaveBeenCalled();
    });

    // `undefined` rather than a tab, so `open()` applies the hub's own landing tab instead of this
    // module having a second opinion about what that is.
    it('leaves the landing tab to the hub when the link names none', () => {
      mocks.search = 'modal=debates';

      render(<DeepLinkHandler />);

      expect(mocks.openHub).toHaveBeenCalledWith(undefined);
    });

    it('opens on the tab the link named', () => {
      mocks.search = 'modal=debates&modalTarget=people';

      render(<DeepLinkHandler />);

      expect(mocks.openHub).toHaveBeenCalledWith('people');
    });

    // Signed-out narrowing is the hub's (`visibleTab`, GEO-2725), so a signed-in-only tab is
    // passed straight through rather than second-guessed here.
    it('passes a signed-in-only tab to the hub unchanged', () => {
      mocks.search = 'modal=debates&modalTarget=requests';

      render(<DeepLinkHandler />);

      expect(mocks.openHub).toHaveBeenCalledWith('requests');
    });

    it('still opens when the target is unrecognised', () => {
      mocks.search = 'modal=debates&modalTarget=nonsense';

      render(<DeepLinkHandler />);

      expect(mocks.openHub).toHaveBeenCalledWith(undefined);
    });

    // The hub is open to signed-out viewers with Claims and People (GEO-2725), so unlike the
    // sign-in link this one has nothing to wait for.
    it('opens for a signed-out viewer without waiting on Privy', () => {
      mocks.search = 'modal=debates';
      mocks.ready = false;
      mocks.authenticated = false;

      render(<DeepLinkHandler />);

      expect(mocks.openHub).toHaveBeenCalledTimes(1);
    });
  });

  describe('the two together', () => {
    it('keeps any other param and the anchor the route was carrying', () => {
      mocks.pathname = '/space/space-1/entity-1';
      mocks.search = 'modal=debates&tabId=tab-2';
      window.location.hash = '#block-1';

      render(<DeepLinkHandler />);

      expect(mocks.replaceState).toHaveBeenCalledWith(null, '', '/space/space-1/entity-1?tabId=tab-2#block-1');
    });

    /**
     * The collision that moved attribution off `source`. A block link's trigger has to survive a
     * modal deep link on the same URL, or `block-reorder` never runs its reveal.
     */
    it('leaves a block link’s `source` intact', () => {
      mocks.pathname = '/space/space-1/entity-1';
      mocks.search = 'modal=debates&source=copy_link';
      window.location.hash = '#block-1';

      render(<DeepLinkHandler />);

      expect(mocks.replaceState).toHaveBeenCalledWith(null, '', '/space/space-1/entity-1?source=copy_link#block-1');
    });

    it('clears exactly once, no matter which link fired', () => {
      mocks.search = 'modal=debates';

      render(<DeepLinkHandler />);

      expect(mocks.replaceState).toHaveBeenCalledTimes(1);
    });
  });
});
