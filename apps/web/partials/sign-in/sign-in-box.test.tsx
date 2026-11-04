import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

import * as React from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { beginAuthAttempt, finishAuthAttempt, readAuthAttempt, resetAuthAttempt } from '~/core/auth-attempt';
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
  googleSignIn: undefined as undefined | ((properties: Record<string, unknown>) => Promise<void>),
}));

vi.mock('~/core/auth/google-oauth', () => ({ useGoogleOAuthSignIn: () => mocks.googleSignIn }));
vi.mock('~/core/wallet/auth-hooks', () => ({
  usePrivy: () => ({ ready: true, authenticated: mocks.authenticated, isModalOpen: mocks.isModalOpen }),
}));
vi.mock('~/partials/explore/email-capture-account-step', () => ({
  // Mounting the real step is what mails the code.
  AccountStep: ({ email, analytics }: { email: string; analytics: unknown }) => {
    React.useEffect(() => {
      mocks.accountSteps.push({ email, analytics });
    }, [email, analytics]);
    return <p>code step for {email}</p>;
  },
}));

function open(overrides: Partial<SignInBoxRequest> = {}) {
  const attempt = beginAuthAttempt({ component: 'navbar', auth_control: 'sign_in' });
  const request: SignInBoxRequest = {
    attemptId: attempt.id,
    attribution: { ...attempt.properties, component: 'navbar' },
    onComplete: vi.fn(),
    onDismiss: vi.fn(),
    ...overrides,
  };
  act(() => openSignInBox(request));
  return { attempt, request };
}

function typeEmail(value: string) {
  fireEvent.change(screen.getByLabelText('Email address'), { target: { value } });
}

beforeEach(() => {
  mocks.authenticated = false;
  mocks.isModalOpen = false;
  mocks.accountSteps = [];
  mocks.googleSignIn = undefined;
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

  it('records the prompt as viewed when it paints', () => {
    render(<SignInBoxHost />);
    const { attempt } = open();
    expect(readAuthAttempt(attempt.id)?.openedAt).toEqual(expect.any(Number));
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

  it('withdraws the press when closed', () => {
    render(<SignInBoxHost />);
    const { request } = open();
    fireEvent.click(screen.getByRole('button', { name: SIGN_IN_BOX_COPY.close }));
    expect(request.onDismiss).toHaveBeenCalledTimes(1);
    expect(request.onComplete).not.toHaveBeenCalled();
    expect(isSignInBoxOpen()).toBe(false);
  });

  it("runs the press's continuation once its attempt ends signed in", () => {
    render(<SignInBoxHost />);
    const { attempt, request } = open();
    act(() => finishAuthAttempt('signed_up', readAuthAttempt(attempt.id)));
    expect(request.onComplete).toHaveBeenCalledTimes(1);
    expect(request.onDismiss).not.toHaveBeenCalled();
    expect(isSignInBoxOpen()).toBe(false);
  });

  it('closes without a continuation when its attempt ends another way', () => {
    render(<SignInBoxHost />);
    const { attempt, request } = open();
    act(() => finishAuthAttempt('closed', readAuthAttempt(attempt.id)));
    expect(request.onComplete).not.toHaveBeenCalled();
    expect(isSignInBoxOpen()).toBe(false);
  });

  it("steps aside for Privy's dialog without withdrawing the attempt", () => {
    const { rerender } = render(<SignInBoxHost />);
    const { request } = open();
    mocks.isModalOpen = true;
    rerender(<SignInBoxHost />);
    expect(isSignInBoxOpen()).toBe(false);
    expect(request.onDismiss).not.toHaveBeenCalled();
  });

  it('closes once the visitor is signed in another way', () => {
    const { rerender } = render(<SignInBoxHost />);
    open();
    mocks.authenticated = true;
    rerender(<SignInBoxHost />);
    expect(isSignInBoxOpen()).toBe(false);
  });

  it('offers Google beside the email field when it is offered, under the attribution', () => {
    mocks.googleSignIn = vi.fn(() => new Promise<void>(() => {}));
    render(<SignInBoxHost />);
    const { request } = open();
    fireEvent.click(screen.getByRole('button', { name: 'Continue with Google' }));
    expect(mocks.googleSignIn).toHaveBeenCalledWith({ ...request.attribution, auth_control: 'continue_with_google' });
    // A starting redirect cannot be withdrawn.
    fireEvent.click(screen.getByRole('button', { name: SIGN_IN_BOX_COPY.close }));
    expect(request.onDismiss).not.toHaveBeenCalled();
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
