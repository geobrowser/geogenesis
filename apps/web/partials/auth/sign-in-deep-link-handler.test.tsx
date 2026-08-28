import { render } from '@testing-library/react';

import * as React from 'react';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SignInDeepLinkHandler } from './sign-in-deep-link-handler';

const mocks = {
  pathname: '/explore',
  search: 'modal=signin&source=marketing',
  ready: true,
  authenticated: false,
  openSignIn: vi.fn(),
  signInOptions: null as { redirectTo?: string; analytics?: Record<string, unknown> } | null,
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

describe('SignInDeepLinkHandler', () => {
  beforeEach(() => {
    mocks.pathname = '/explore';
    mocks.search = 'modal=signin&source=marketing';
    mocks.ready = true;
    mocks.authenticated = false;
    mocks.signInOptions = null;
    mocks.openSignIn.mockReset();
    mocks.replaceState.mockReset();
    // Set by one test below, and it would otherwise leak an anchor into every later assertion.
    window.location.hash = '';
    vi.spyOn(window.history, 'replaceState').mockImplementation(mocks.replaceState);
  });

  it('opens the sign-in dialog for a viewer who arrived on the link', () => {
    render(<SignInDeepLinkHandler />);

    expect(mocks.openSignIn).toHaveBeenCalledTimes(1);
  });

  // A trigger left in the address bar reopens on refresh, on back, and for whoever the viewer
  // sends the URL to — none of whom asked to sign in.
  it('clears the trigger from the URL', () => {
    render(<SignInDeepLinkHandler />);

    expect(mocks.replaceState).toHaveBeenCalledWith(null, '', '/explore');
  });

  // `replaceState` rewrites the whole URL, so an anchor missing from `cleanUrl` is an anchor
  // thrown away — and this app resolves linked blocks out of `window.location.hash`.
  it('keeps the anchor the viewer followed', () => {
    mocks.pathname = '/space/space-1/entity-1';
    mocks.search = 'modal=signin&source=email';
    window.location.hash = '#block-1';

    render(<SignInDeepLinkHandler />);

    expect(mocks.replaceState).toHaveBeenCalledWith(null, '', '/space/space-1/entity-1#block-1');
    expect(mocks.signInOptions?.redirectTo).toBe('/space/space-1/entity-1#block-1');
  });

  it('keeps any other param the route was carrying', () => {
    mocks.pathname = '/space/space-1/entity-1';
    mocks.search = 'modal=signin&source=marketing&tabId=tab-2';

    render(<SignInDeepLinkHandler />);

    expect(mocks.replaceState).toHaveBeenCalledWith(null, '', '/space/space-1/entity-1?tabId=tab-2');
  });

  // The ticket's stated behaviour: a login dialog over a live session is noise, and the link has
  // already done its job by landing them here.
  it('does not open the dialog for someone who is already signed in', () => {
    mocks.authenticated = true;

    render(<SignInDeepLinkHandler />);

    expect(mocks.openSignIn).not.toHaveBeenCalled();
    expect(mocks.replaceState).toHaveBeenCalledWith(null, '', '/explore');
  });

  // `authenticated` reads false while Privy is still restoring, so acting early would show the
  // login to a signed-in viewer — the case above, missed by a few hundred milliseconds.
  it('waits for Privy before deciding', () => {
    mocks.ready = false;

    const { rerender } = render(<SignInDeepLinkHandler />);
    expect(mocks.openSignIn).not.toHaveBeenCalled();
    expect(mocks.replaceState).not.toHaveBeenCalled();

    mocks.ready = true;
    rerender(<SignInDeepLinkHandler />);

    expect(mocks.openSignIn).toHaveBeenCalledTimes(1);
  });

  it('stays out of the way of an ordinary page load', () => {
    mocks.search = '';

    render(<SignInDeepLinkHandler />);

    expect(mocks.openSignIn).not.toHaveBeenCalled();
    expect(mocks.replaceState).not.toHaveBeenCalled();
  });

  // Another deep link — a different modal, an entity action — must not land on the login.
  it('ignores a modal it does not own', () => {
    mocks.search = 'modal=something-else';

    render(<SignInDeepLinkHandler />);

    expect(mocks.openSignIn).not.toHaveBeenCalled();
  });

  // The params are cleared above, but Next does not necessarily resync `useSearchParams` in the
  // same tick — so something else on the page writing a param of its own can re-run this while
  // the trigger is still visible, and a second dialog is not what the viewer asked for.
  it('opens once per arrival, even if the URL changes underneath it', () => {
    const { rerender } = render(<SignInDeepLinkHandler />);

    mocks.search = 'modal=signin&source=marketing&tabId=tab-2';
    rerender(<SignInDeepLinkHandler />);

    expect(mocks.openSignIn).toHaveBeenCalledTimes(1);
  });

  // Signing up runs onboarding, which pushes the viewer back to the recorded destination. Left as
  // the arrival URL that would be the trigger again, handing them the dialog they just came from.
  it('records the cleaned URL as the post-auth destination', () => {
    render(<SignInDeepLinkHandler />);

    expect(mocks.signInOptions?.redirectTo).toBe('/explore');
  });

  it('carries the attribution into the login event', () => {
    render(<SignInDeepLinkHandler />);

    expect(mocks.signInOptions?.analytics).toEqual({ link_source: 'marketing' });
  });

  it('sends no attribution when the link carried none', () => {
    mocks.search = 'modal=signin';

    render(<SignInDeepLinkHandler />);

    expect(mocks.signInOptions?.analytics).toEqual({ link_source: undefined });
  });
});
