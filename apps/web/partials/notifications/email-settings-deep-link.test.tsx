import { act, cleanup, render } from '@testing-library/react';

import * as React from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  search: '',
  ready: true,
  authenticated: false,
  openSignIn: vi.fn(),
  onCancel: null as (() => void) | null,
  signInOptions: null as { redirectTo?: string } | null,
  replaceState: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/space/abc',
  useSearchParams: () => new URLSearchParams(mocks.search),
}));
vi.mock('~/core/wallet/auth-hooks', () => ({
  usePrivy: () => ({ ready: mocks.ready, authenticated: mocks.authenticated }),
}));
vi.mock('~/core/hooks/use-privy-sign-in', () => ({
  usePrivySignIn: (_onComplete: unknown, options: { redirectTo?: string }) => {
    mocks.signInOptions = options;
    return (_properties: unknown, callOptions?: { onCancel?: () => void }) => {
      mocks.onCancel = callOptions?.onCancel ?? null;
      mocks.openSignIn();
    };
  },
}));
vi.mock('~/core/notifications/api', () => ({ geoNotificationsApiUrl: () => 'https://n.example' }));
vi.mock('./email-settings-dialog', () => ({
  EmailSettingsDialog: ({ entry, via }: { entry: string; via: string | null }) => (
    <div data-testid="dialog" data-entry={entry} data-via={via ?? ''} />
  ),
}));

const { EmailSettingsDeepLink } = await import('./email-settings-deep-link');

beforeEach(() => {
  mocks.search = 'modal=email-settings&via=email';
  mocks.ready = true;
  mocks.authenticated = true;
  mocks.openSignIn = vi.fn();
  mocks.onCancel = null;
  window.history.replaceState = mocks.replaceState = vi.fn();
});
afterEach(() => cleanup());

describe('EmailSettingsDeepLink', () => {
  it('opens the dialog for someone signed in, and clears the trigger', () => {
    const { getByTestId } = render(<EmailSettingsDeepLink />);

    expect(getByTestId('dialog').dataset).toMatchObject({ entry: 'link', via: 'email' });
    expect(mocks.replaceState).toHaveBeenCalledWith(null, '', '/space/abc');
    expect(mocks.openSignIn).not.toHaveBeenCalled();
  });

  it('asks someone signed out to sign in first, then opens the dialog', () => {
    mocks.authenticated = false;
    const { queryByTestId, rerender } = render(<EmailSettingsDeepLink />);

    expect(mocks.openSignIn).toHaveBeenCalledTimes(1);
    expect(queryByTestId('dialog')).toBeNull();
    // A new account comes back through onboarding to the link itself.
    expect(mocks.signInOptions?.redirectTo).toBe('/space/abc?modal=email-settings&via=email');

    mocks.authenticated = true;
    rerender(<EmailSettingsDeepLink />);
    expect(queryByTestId('dialog')).not.toBeNull();
  });

  it('opens nothing later when the sign-in is dismissed', () => {
    mocks.authenticated = false;
    const { queryByTestId, rerender } = render(<EmailSettingsDeepLink />);
    act(() => mocks.onCancel?.());

    mocks.authenticated = true;
    rerender(<EmailSettingsDeepLink />);
    expect(queryByTestId('dialog')).toBeNull();
  });

  it('waits for Privy before deciding', () => {
    mocks.ready = false;
    mocks.authenticated = false;
    render(<EmailSettingsDeepLink />);

    expect(mocks.openSignIn).not.toHaveBeenCalled();
    expect(mocks.replaceState).not.toHaveBeenCalled();
  });

  it('ignores other links', () => {
    mocks.search = 'modal=schedule';
    const { queryByTestId } = render(<EmailSettingsDeepLink />);

    expect(queryByTestId('dialog')).toBeNull();
  });
});
