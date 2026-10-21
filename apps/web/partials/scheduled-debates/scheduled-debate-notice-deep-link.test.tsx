import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

import * as React from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ScheduledDebateNoticeDeepLink } from './scheduled-debate-notice-deep-link';

const REQUEST = '6676b145-0970-4c1c-bfbc-7497d9721b39';

const state = vi.hoisted(() => ({
  search: '',
  auth: { ready: true, authenticated: true },
  signIn: vi.fn(),
  signInOptions: undefined as { redirectTo?: string } | undefined,
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/explore',
  useSearchParams: () => new URLSearchParams(state.search),
}));
vi.mock('~/core/debates/hooks', () => ({ useGeoChatAuth: () => state.auth }));
vi.mock('~/core/hooks/use-privy-sign-in', () => ({
  usePrivySignIn: (_onComplete: unknown, options: { redirectTo?: string }) => {
    state.signInOptions = options;
    return state.signIn;
  },
}));
vi.mock('./scheduled-debate-notice', () => ({
  ScheduledDebateNoticeDialog: ({
    open,
    requestId,
    initialStep,
    children,
  }: {
    open: boolean;
    requestId: string;
    initialStep: string;
    children?: React.ReactNode;
  }) => (
    <div data-testid="notice" data-open={String(open)} data-request={requestId} data-step={initialStep}>
      {children}
    </div>
  ),
}));

beforeEach(() => {
  state.auth = { ready: true, authenticated: true };
  state.signIn.mockClear();
  state.signInOptions = undefined;
});

afterEach(cleanup);

describe('ScheduledDebateNoticeDeepLink', () => {
  it('opens Running late on the request the email named, and clears the trigger', () => {
    state.search = `modal=running-late&modalTarget=${REQUEST}`;
    const replaceState = vi.spyOn(window.history, 'replaceState');
    render(<ScheduledDebateNoticeDeepLink />);

    const notice = screen.getByTestId('notice');
    expect(notice).toHaveAttribute('data-step', 'late');
    expect(notice).toHaveAttribute('data-request', REQUEST);
    expect(replaceState).toHaveBeenCalledWith(null, '', '/explore');
    expect(state.signIn).not.toHaveBeenCalled();
  });

  it('opens Can’t make it from its own link', () => {
    state.search = `modal=cant-make-it&modalTarget=${REQUEST}`;
    render(<ScheduledDebateNoticeDeepLink />);
    expect(screen.getByTestId('notice')).toHaveAttribute('data-step', 'cant');
  });

  it('opens nothing for a link that names no request', () => {
    state.search = 'modal=running-late&modalTarget=requests';
    render(<ScheduledDebateNoticeDeepLink />);
    expect(screen.queryByTestId('notice')).not.toBeInTheDocument();
  });

  it('asks a signed-out debater to sign in, and sends a new account back to the same choice', () => {
    state.search = `modal=cant-make-it&modalTarget=${REQUEST}`;
    state.auth = { ready: true, authenticated: false };
    render(<ScheduledDebateNoticeDeepLink />);

    expect(state.signIn).toHaveBeenCalledTimes(1);
    expect(state.signInOptions?.redirectTo).toBe(`/explore?modal=cant-make-it&modalTarget=${REQUEST}`);
    // Out of Privy's way while it is up, so the login takes clicks.
    expect(screen.getByTestId('notice')).toHaveAttribute('data-open', 'false');
  });

  it('waits for Privy before deciding whether to ask', () => {
    state.search = `modal=running-late&modalTarget=${REQUEST}`;
    state.auth = { ready: false, authenticated: false };
    render(<ScheduledDebateNoticeDeepLink />);
    expect(state.signIn).not.toHaveBeenCalled();
  });
});
