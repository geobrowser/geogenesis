import { renderHook } from '@testing-library/react';

import * as React from 'react';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useDeepLinkEffect, useDeepLinkParams } from './use-deep-link';

const mocks = {
  pathname: '/explore',
  search: 'modal=debates&modalTarget=people&via=email',
  replaceState: vi.fn(),
};

vi.mock('next/navigation', () => ({
  usePathname: () => mocks.pathname,
  useSearchParams: () => new URLSearchParams(mocks.search),
}));

beforeEach(() => {
  mocks.pathname = '/explore';
  mocks.search = 'modal=debates&modalTarget=people&via=email';
  mocks.replaceState.mockReset();
  window.location.hash = '';
  vi.spyOn(window.history, 'replaceState').mockImplementation(mocks.replaceState);
});

describe('useDeepLinkParams', () => {
  it('reads the link it owns', () => {
    const { result } = renderHook(() => useDeepLinkParams('debates'));

    expect(result.current).toMatchObject({ requested: true, target: 'people', via: 'email' });
  });

  it('does not claim another link’s trigger', () => {
    mocks.search = 'modal=signin&via=marketing';

    const { result } = renderHook(() => useDeepLinkParams('debates'));

    expect(result.current.requested).toBe(false);
  });

  it('carries the anchor into the cleaned URL', () => {
    mocks.pathname = '/space/space-1/entity-1';
    mocks.search = 'modal=debates&tabId=tab-2';
    window.location.hash = '#block-1';

    const { result } = renderHook(() => useDeepLinkParams('debates'));

    expect(result.current.cleanUrl).toBe('/space/space-1/entity-1?tabId=tab-2#block-1');
  });
});

describe('useDeepLinkEffect', () => {
  const arm = (run: () => void, overrides: { enabled?: boolean } = {}) =>
    renderHook(
      (props: { enabled?: boolean }) => {
        const link = useDeepLinkParams('debates');
        useDeepLinkEffect({ ...link, enabled: props.enabled, run });
      },
      { initialProps: { enabled: overrides.enabled ?? true } }
    );

  it('runs the action and clears the trigger', () => {
    const run = vi.fn();

    arm(run);

    expect(run).toHaveBeenCalledTimes(1);
    expect(mocks.replaceState).toHaveBeenCalledWith(null, '', '/explore');
  });

  it('does nothing on a URL that never carried the trigger', () => {
    mocks.search = '';
    const run = vi.fn();

    arm(run);

    expect(run).not.toHaveBeenCalled();
    expect(mocks.replaceState).not.toHaveBeenCalled();
  });

  // Both links share the `modal` key, so clearing has to be scoped to the value a hook owns —
  // otherwise mounting two of these means whichever runs first eats the other's link.
  it('leaves another link’s trigger in place', () => {
    mocks.search = 'modal=signin&via=marketing';
    const run = vi.fn();

    arm(run);

    expect(run).not.toHaveBeenCalled();
    expect(mocks.replaceState).not.toHaveBeenCalled();
  });

  // Next does not necessarily resync `useSearchParams` in the same tick as the `replaceState`, so
  // something else writing a param can re-render this while the trigger is still visible.
  it('acts once per arrival, even if the URL changes underneath it', () => {
    const run = vi.fn();
    const { rerender } = arm(run);

    mocks.search = 'modal=debates&tabId=tab-2';
    rerender({ enabled: true });

    expect(run).toHaveBeenCalledTimes(1);
  });

  // Privy has to resolve before the sign-in link knows whether to open anything. Clearing while
  // disabled would spend the trigger before the feature could read it.
  it('holds the trigger, uncleared, until it is enabled', () => {
    const run = vi.fn();
    const { rerender } = arm(run, { enabled: false });

    expect(run).not.toHaveBeenCalled();
    expect(mocks.replaceState).not.toHaveBeenCalled();

    rerender({ enabled: true });

    expect(run).toHaveBeenCalledTimes(1);
    expect(mocks.replaceState).toHaveBeenCalledWith(null, '', '/explore');
  });
});
