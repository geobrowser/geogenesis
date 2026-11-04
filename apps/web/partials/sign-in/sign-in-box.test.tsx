import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

import * as React from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  beginAuthAttempt,
  continueAuthAttempt,
  currentAuthAttempt,
  finishAuthAttempt,
  readAuthAttempt,
  resetAuthAttempt,
} from '~/core/auth-attempt';
import {
  type SignInBoxRequest,
  closeSignInBox,
  isSignInBoxOpen,
  openSignInBox,
} from '~/core/auth/sign-in-box/sign-in-box-store';
import { SAVE_VOTES_FINE_PRINT } from '~/core/save-votes-copy';

import { SignInBoxHost } from './sign-in-box';
import { SIGN_IN_BOX_COPY } from './sign-in-box-copy';

const mocks = vi.hoisted(() => ({
  authenticated: false,
  isModalOpen: false,
  accountSteps: [] as { email: string; analytics: unknown }[],
  googleSignIn: undefined as undefined | ((properties: Record<string, unknown>, options?: unknown) => Promise<void>),
  startAnalyticsSoon: vi.fn(),
  steps: [] as { step: string; extra: Record<string, unknown> }[],
}));

vi.mock('~/core/auth/code-step', async importOriginal => ({
  ...(await importOriginal<typeof import('~/core/auth/code-step')>()),
  captureAuthStep: (step: string, extra: Record<string, unknown> = {}) => mocks.steps.push({ step, extra }),
}));

vi.mock('~/core/analytics', async importOriginal => ({
  ...(await importOriginal<typeof import('~/core/analytics')>()),
  startAnalyticsSoon: () => mocks.startAnalyticsSoon(),
}));

vi.mock('~/core/auth/google-oauth', () => ({ useGoogleOAuthSignIn: () => mocks.googleSignIn }));
vi.mock('~/core/wallet/auth-hooks', () => ({
  usePrivy: () => ({ ready: true, authenticated: mocks.authenticated, isModalOpen: mocks.isModalOpen }),
}));
vi.mock('~/partials/explore/email-capture-account-step', () => ({
  // Mounting the real step is what mails the code.
  SIGN_IN_UNAVAILABLE_COPY: 'Couldn’t reach sign-in. Try again.',
  AccountStep: ({
    email,
    analytics,
    onSignInUnavailable,
  }: {
    email: string;
    analytics: unknown;
    onSignInUnavailable?: () => void;
  }) => {
    React.useEffect(() => {
      mocks.accountSteps.push({ email, analytics });
    }, [email, analytics]);
    return (
      <>
        <p>code step for {email}</p>
        <button type="button" onClick={onSignInUnavailable}>
          Privy did not load
        </button>
      </>
    );
  },
}));

function open(overrides: Partial<SignInBoxRequest> = {}) {
  const attempt = beginAuthAttempt({ component: 'navbar', auth_control: 'sign_in' });
  const request: SignInBoxRequest = {
    attemptId: attempt.id,
    attribution: { ...attempt.properties, component: 'navbar' },
    ...overrides,
  };
  // What `useTrackedLogin` registers for the press.
  const press = { signedIn: vi.fn(), abandoned: vi.fn() };
  continueAuthAttempt(attempt.id, press);
  act(() => openSignInBox(request));
  return { attempt, request, press };
}

function typeEmail(value: string) {
  fireEvent.change(screen.getByLabelText('Email address'), { target: { value } });
}

beforeEach(() => {
  mocks.authenticated = false;
  mocks.isModalOpen = false;
  mocks.accountSteps = [];
  mocks.googleSignIn = undefined;
  mocks.startAnalyticsSoon.mockReset();
  mocks.steps = [];
  localStorage.clear();
  sessionStorage.clear();
  resetAuthAttempt();
});

afterEach(() => {
  act(() => closeSignInBox());
  cleanup();
});

describe('SignInBox', () => {
  it('shows the save-votes card with the default heading and no votes', () => {
    render(<SignInBoxHost />);
    open();
    expect(screen.getByRole('dialog', { name: SIGN_IN_BOX_COPY.heading })).toBeInTheDocument();
    expect(screen.getByText(SAVE_VOTES_FINE_PRINT)).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Your votes' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: SIGN_IN_BOX_COPY.submit })).toBeDisabled();
  });

  it("uses a caller's heading", () => {
    render(<SignInBoxHost />);
    open({ heading: 'Join the discussion' });
    expect(screen.getByRole('dialog', { name: 'Join the discussion' })).toBeInTheDocument();
  });

  it('starts from a recovered address', () => {
    render(<SignInBoxHost />);
    open({ prefillEmail: 'ann@example.com' });
    expect(screen.getByLabelText('Email address')).toHaveValue('ann@example.com');
    expect(screen.getByRole('button', { name: SIGN_IN_BOX_COPY.submit })).toBeEnabled();
  });

  it('records the prompt as viewed when it paints', () => {
    render(<SignInBoxHost />);
    const { attempt } = open();
    expect(readAuthAttempt(attempt.id)?.openedAt).toEqual(expect.any(Number));
  });

  it('starts the analytics runtime after its first paint', async () => {
    render(<SignInBoxHost />);
    open();
    expect(mocks.startAnalyticsSoon).not.toHaveBeenCalled();
    await act(() => new Promise(resolve => requestAnimationFrame(() => resolve(undefined))));
    expect(mocks.startAnalyticsSoon).toHaveBeenCalledTimes(1);
  });

  it("hands a likely address to the code step under the press's attribution", () => {
    render(<SignInBoxHost />);
    const { request } = open();
    typeEmail('  ann@example.com ');
    fireEvent.click(screen.getByRole('button', { name: SIGN_IN_BOX_COPY.submit }));
    expect(screen.getByText('code step for ann@example.com')).toBeInTheDocument();
    expect(mocks.accountSteps).toEqual([{ email: 'ann@example.com', analytics: request.attribution }]);
  });

  it('goes back to the address, which it keeps, and resends from there', () => {
    render(<SignInBoxHost />);
    open();
    typeEmail('ann@example.com');
    fireEvent.click(screen.getByRole('button', { name: SIGN_IN_BOX_COPY.submit }));
    fireEvent.click(screen.getByRole('button', { name: 'Back to email' }));
    expect(screen.getByLabelText('Email address')).toHaveValue('ann@example.com');
    fireEvent.click(screen.getByRole('button', { name: 'Send code' }));
    expect(mocks.accountSteps).toHaveLength(2);
  });

  it("goes back to the address saying sign-in couldn't be reached when Privy never loaded", () => {
    render(<SignInBoxHost />);
    const { press } = open();
    typeEmail('ann@example.com');
    fireEvent.click(screen.getByRole('button', { name: SIGN_IN_BOX_COPY.submit }));
    fireEvent.click(screen.getByRole('button', { name: 'Privy did not load' }));
    expect(screen.getByLabelText('Email address')).toHaveValue('ann@example.com');
    expect(screen.getByRole('alert')).toHaveTextContent('Couldn’t reach sign-in. Try again.');
    expect(press.abandoned).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Send code' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('reports leaving the page with the box open, and at which step', () => {
    render(<SignInBoxHost />);
    open();
    act(() => void window.dispatchEvent(new Event('pagehide')));
    typeEmail('ann@example.com');
    fireEvent.click(screen.getByRole('button', { name: SIGN_IN_BOX_COPY.submit }));
    act(() => void window.dispatchEvent(new Event('pagehide')));
    expect(mocks.steps).toEqual([
      { step: 'left_page', extra: { box_phase: 'email' } },
      { step: 'left_page', extra: { box_phase: 'code' } },
    ]);
  });

  it('does not count a Google redirect as leaving', () => {
    mocks.googleSignIn = vi.fn(() => new Promise<void>(() => {}));
    render(<SignInBoxHost />);
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Continue with Google' }));
    act(() => void window.dispatchEvent(new Event('pagehide')));
    expect(mocks.steps).toEqual([]);
    // The start stays pending across tests; the bfcache return clears it.
    act(() => void window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
  });

  it('reports no leaving once its attempt has ended', () => {
    render(<SignInBoxHost />);
    const { attempt } = open();
    act(() => void finishAuthAttempt('superseded', readAuthAttempt(attempt.id)));
    act(() => void window.dispatchEvent(new Event('pagehide')));
    expect(mocks.steps).toEqual([]);
  });

  it('withdraws the press when closed', () => {
    render(<SignInBoxHost />);
    const { press } = open();
    fireEvent.click(screen.getByRole('button', { name: SIGN_IN_BOX_COPY.close }));
    expect(press.abandoned).toHaveBeenCalledTimes(1);
    expect(press.signedIn).not.toHaveBeenCalled();
    expect(isSignInBoxOpen()).toBe(false);
  });

  it("runs the press's continuation once its attempt ends signed in", () => {
    render(<SignInBoxHost />);
    const { attempt, press } = open();
    act(() => finishAuthAttempt('signed_up', readAuthAttempt(attempt.id)));
    expect(press.signedIn).toHaveBeenCalledTimes(1);
    expect(press.abandoned).not.toHaveBeenCalled();
    expect(isSignInBoxOpen()).toBe(false);
  });

  it('closes and withdraws the press when its attempt ends another way', () => {
    render(<SignInBoxHost />);
    const { attempt, press } = open();
    act(() => finishAuthAttempt('closed', readAuthAttempt(attempt.id)));
    expect(press.signedIn).not.toHaveBeenCalled();
    expect(press.abandoned).toHaveBeenCalledTimes(1);
    expect(isSignInBoxOpen()).toBe(false);
  });

  it("closes for Privy's dialog, leaving the attempt to it", () => {
    const { rerender } = render(<SignInBoxHost />);
    const { attempt, press } = open();
    mocks.isModalOpen = true;
    rerender(<SignInBoxHost />);
    expect(isSignInBoxOpen()).toBe(false);
    expect(readAuthAttempt(attempt.id)?.endedAt).toBeUndefined();
    act(() => finishAuthAttempt('signed_in', readAuthAttempt(attempt.id)));
    expect(press.signedIn).toHaveBeenCalledTimes(1);
  });

  it('withdraws its attempt once the visitor is signed in another way', async () => {
    const { rerender } = render(<SignInBoxHost />);
    const { attempt, press } = open();
    mocks.authenticated = true;
    rerender(<SignInBoxHost />);
    await act(() => new Promise(resolve => setTimeout(resolve, 0)));
    expect(isSignInBoxOpen()).toBe(false);
    expect(readAuthAttempt(attempt.id)?.outcome).toBe('closed');
    expect(press.abandoned).toHaveBeenCalledTimes(1);
  });

  it('leaves an attempt its own sign-in ended as it was', async () => {
    const { rerender } = render(<SignInBoxHost />);
    const { attempt, press } = open();
    mocks.authenticated = true;
    rerender(<SignInBoxHost />);
    act(() => finishAuthAttempt('signed_in', readAuthAttempt(attempt.id)));
    await act(() => new Promise(resolve => setTimeout(resolve, 0)));
    expect(readAuthAttempt(attempt.id)?.outcome).toBe('signed_in');
    expect(press.signedIn).toHaveBeenCalledTimes(1);
    expect(press.abandoned).not.toHaveBeenCalled();
  });

  it("never withdraws a newer press's attempt", () => {
    render(<SignInBoxHost />);
    open();
    const newer = beginAuthAttempt({ component: 'vote_button' });
    fireEvent.click(screen.getByRole('button', { name: SIGN_IN_BOX_COPY.close }));
    expect(currentAuthAttempt()).toMatchObject({ id: newer.id });
    expect(currentAuthAttempt()?.endedAt).toBeUndefined();
  });

  it('offers Google beside the email field when it is offered, under the attribution', () => {
    mocks.googleSignIn = vi.fn(() => new Promise<void>(() => {}));
    render(<SignInBoxHost />);
    const { request, press } = open();
    fireEvent.click(screen.getByRole('button', { name: 'Continue with Google' }));
    expect(mocks.googleSignIn).toHaveBeenCalledWith(
      { ...request.attribution, auth_control: 'continue_with_google' },
      { surface: 'box', attemptId: request.attemptId }
    );
    // A starting redirect cannot be withdrawn.
    fireEvent.click(screen.getByRole('button', { name: SIGN_IN_BOX_COPY.close }));
    expect(press.abandoned).not.toHaveBeenCalled();
  });

  it('starts a new press from the email step', () => {
    render(<SignInBoxHost />);
    open();
    typeEmail('ann@example.com');
    fireEvent.click(screen.getByRole('button', { name: SIGN_IN_BOX_COPY.submit }));
    open();
    expect(screen.getByLabelText('Email address')).toHaveValue('');
  });
});
