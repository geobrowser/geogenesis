import { render } from '@testing-library/react';

import * as React from 'react';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DebatesPanelDeepLinkHandler } from './debates-panel-deep-link-handler';

const mocks = {
  pathname: '/explore',
  search: 'modal=debates',
  open: vi.fn(),
  replaceState: vi.fn(),
};

vi.mock('next/navigation', () => ({
  usePathname: () => mocks.pathname,
  useSearchParams: () => new URLSearchParams(mocks.search),
}));

vi.mock('~/core/debates/matchmaking/use-debates-hub', () => ({
  useDebatesHub: () => ({
    isOpen: false,
    activeTab: 'claims',
    open: mocks.open,
    close: vi.fn(),
    toggle: vi.fn(),
    setTab: vi.fn(),
  }),
}));

describe('DebatesPanelDeepLinkHandler', () => {
  beforeEach(() => {
    mocks.pathname = '/explore';
    mocks.search = 'modal=debates';
    mocks.open.mockReset();
    mocks.replaceState.mockReset();
    window.location.hash = '';
    vi.spyOn(window.history, 'replaceState').mockImplementation(mocks.replaceState);
  });

  it('opens the hub for a viewer who arrived on the link', () => {
    render(<DebatesPanelDeepLinkHandler />);

    expect(mocks.open).toHaveBeenCalledTimes(1);
  });

  // `undefined` rather than a tab, so `open()` applies the hub's own landing tab instead of this
  // module having a second opinion about what that is.
  it('leaves the landing tab to the hub when the link names none', () => {
    render(<DebatesPanelDeepLinkHandler />);

    expect(mocks.open).toHaveBeenCalledWith(undefined);
  });

  it('opens on the tab the link named', () => {
    mocks.search = 'modal=debates&modalTab=people';

    render(<DebatesPanelDeepLinkHandler />);

    expect(mocks.open).toHaveBeenCalledWith('people');
  });

  // Signed-out narrowing is the hub's (`visibleTab`, GEO-2725), so a signed-in-only tab is passed
  // straight through rather than second-guessed here.
  it('passes a signed-in-only tab to the hub unchanged', () => {
    mocks.search = 'modal=debates&modalTab=requests';

    render(<DebatesPanelDeepLinkHandler />);

    expect(mocks.open).toHaveBeenCalledWith('requests');
  });

  it('still opens when the tab is unrecognised', () => {
    mocks.search = 'modal=debates&modalTab=nonsense';

    render(<DebatesPanelDeepLinkHandler />);

    expect(mocks.open).toHaveBeenCalledWith(undefined);
  });

  // A trigger left in the address bar reopens on refresh, on back, and for whoever the viewer
  // sends the URL to — none of whom asked for the hub.
  it('clears the trigger from the URL', () => {
    mocks.search = 'modal=debates&modalTab=people&source=email';

    render(<DebatesPanelDeepLinkHandler />);

    expect(mocks.replaceState).toHaveBeenCalledWith(null, '', '/explore');
  });

  it('keeps any other param and the anchor the route was carrying', () => {
    mocks.pathname = '/space/space-1/entity-1';
    mocks.search = 'modal=debates&tabId=tab-2';
    window.location.hash = '#block-1';

    render(<DebatesPanelDeepLinkHandler />);

    expect(mocks.replaceState).toHaveBeenCalledWith(null, '', '/space/space-1/entity-1?tabId=tab-2#block-1');
  });

  it('stays out of the way of an ordinary page load', () => {
    mocks.search = '';

    render(<DebatesPanelDeepLinkHandler />);

    expect(mocks.open).not.toHaveBeenCalled();
    expect(mocks.replaceState).not.toHaveBeenCalled();
  });

  // Both handlers are mounted, and both read `modal`. Neither may act on — or clear — the other's
  // trigger.
  it('ignores the sign-in link rather than clearing it', () => {
    mocks.search = 'modal=signin&source=marketing';

    render(<DebatesPanelDeepLinkHandler />);

    expect(mocks.open).not.toHaveBeenCalled();
    expect(mocks.replaceState).not.toHaveBeenCalled();
  });

  // The params are cleared above, but Next does not necessarily resync `useSearchParams` in the
  // same tick, so something else writing a param can re-run this while the trigger is still there.
  it('opens once per arrival, even if the URL changes underneath it', () => {
    const { rerender } = render(<DebatesPanelDeepLinkHandler />);

    mocks.search = 'modal=debates&tabId=tab-2';
    rerender(<DebatesPanelDeepLinkHandler />);

    expect(mocks.open).toHaveBeenCalledTimes(1);
  });
});
