import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

import * as React from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { currentAuthAttempt, resetAuthAttempt } from '~/core/auth-attempt';
import { CODE_LIFETIME_MS } from '~/core/auth/code-step';

import { codeStepClasses } from '~/partials/save-votes/save-votes-styles';

import { AccountStep } from './email-capture-account-step';

const mocks = vi.hoisted(() => ({
  privyLoaded: true,
  openPrivyModal: vi.fn(),
  loginWithCode: vi.fn(),
  codeAgeMs: 1000 as number | null,
  steps: [] as { step: string; extra: Record<string, unknown> }[],
  sendCode: vi.fn(),
  otpState: { status: 'initial' } as { status: string },
}));

vi.mock('~/core/analytics', () => ({ capture: vi.fn(), trackPrivyAuth: vi.fn(), signupCompleted: vi.fn() }));
vi.mock('~/core/wallet/auth-hooks', () => ({
  isPrivyLoaded: () => mocks.privyLoaded,
  useLoginWithEmail: () => ({
    sendCode: (args: { email: string }) => mocks.sendCode(args),
    loginWithCode: (args: { code: string }) => mocks.loginWithCode(args),
    state: mocks.otpState,
  }),
}));
vi.mock('~/core/auth/code-step', async importOriginal => ({
  ...(await importOriginal<typeof import('~/core/auth/code-step')>()),
  captureAuthStep: (step: string, extra: Record<string, unknown> = {}) => mocks.steps.push({ step, extra }),
  ownCodeAgeMs: () => mocks.codeAgeMs,
}));
vi.mock('~/core/hooks/use-privy-sign-in', () => ({ usePrivySignIn: () => mocks.openPrivyModal }));

afterEach(cleanup);

beforeEach(() => {
  mocks.privyLoaded = true;
  mocks.openPrivyModal.mockReset();
  mocks.loginWithCode.mockReset().mockResolvedValue(undefined);
  mocks.codeAgeMs = 1000;
  mocks.steps = [];
  resetAuthAttempt();
  mocks.sendCode.mockReset().mockResolvedValue(undefined);
  mocks.otpState = { status: 'awaiting-code-input' };
});

/** The step as the save-votes sheet draws it, or, with no `onChangeEmail`, as the email capture does. */
async function renderStep(onChangeEmail?: () => void) {
  const view = render(
    onChangeEmail ? (
      <AccountStep
        email="reader@example.com"
        onGiveUp={vi.fn()}
        appearance="save-votes"
        classes={codeStepClasses(false)}
        onChangeEmail={onChangeEmail}
      />
    ) : (
      <AccountStep email="reader@example.com" onGiveUp={vi.fn()} />
    )
  );
  // Let the send the step makes on mount settle.
  await act(async () => {});
  return view;
}

describe('AccountStep as the save-votes code step (GEO-3439)', () => {
  it('names the code’s length and the address, with a way to change it', async () => {
    const onChangeEmail = vi.fn();
    await renderStep(onChangeEmail);

    expect(screen.getByText('Enter the 6-digit code we sent to')).toBeInTheDocument();
    expect(screen.getByText('reader@example.com')).toBeInTheDocument();
    expect(screen.getByText(/Didn’t get it\?/)).toHaveTextContent('Didn’t get it? Send a new code');

    fireEvent.click(screen.getByRole('button', { name: 'Change email address' }));
    expect(onChangeEmail).toHaveBeenCalledOnce();
  });

  it('offers a new code when the code is wrong', async () => {
    mocks.otpState = { status: 'error' };
    await renderStep(vi.fn());

    expect(screen.getByRole('alert')).toHaveTextContent('That code didn’t work. Send a new code');
  });

  it('keeps the email capture’s wording, with no Change, by default', async () => {
    await renderStep();

    expect(screen.getByText(/Enter the code we sent to/)).toHaveTextContent(
      'Enter the code we sent to reader@example.com'
    );
    expect(screen.queryByRole('button', { name: 'Change email address' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Didn’t get it/)).not.toBeInTheDocument();
  });
});

describe('AccountStep when the send fails', () => {
  it("hands back to its host when Privy never loaded, since Privy's dialog would not open either", async () => {
    mocks.privyLoaded = false;
    mocks.sendCode.mockRejectedValue(new Error('Timed out waiting for sign-in to load'));
    const onSignInUnavailable = vi.fn();
    render(<AccountStep email="reader@example.com" onGiveUp={vi.fn()} onSignInUnavailable={onSignInUnavailable} />);
    await act(async () => {});
    expect(onSignInUnavailable).toHaveBeenCalledTimes(1);
    expect(mocks.openPrivyModal).not.toHaveBeenCalled();
  });

  it("falls back to Privy's dialog on its own attempt for a send Privy refused", async () => {
    mocks.sendCode.mockRejectedValue(Object.assign(new Error('captcha'), { privyErrorCode: 'captcha_failure' }));
    const onSignInUnavailable = vi.fn();
    render(<AccountStep email="reader@example.com" onGiveUp={vi.fn()} onSignInUnavailable={onSignInUnavailable} />);
    await act(async () => {});
    expect(mocks.openPrivyModal).toHaveBeenCalledTimes(1);
    expect(mocks.openPrivyModal).toHaveBeenCalledWith(undefined, { attemptId: currentAuthAttempt()?.id });
    expect(currentAuthAttempt()?.id).toEqual(expect.any(String));
    expect(onSignInUnavailable).not.toHaveBeenCalled();
  });
});

// GEO-3550.
describe('AccountStep sign-in steps', () => {
  const wrongCode = () =>
    Object.assign(new Error('Invalid code for reader@example.com'), { privyErrorCode: 'invalid_credentials' });
  const enter = (code: string) =>
    act(async () => {
      fireEvent.change(screen.getByRole('textbox', { name: 'Verification code' }), { target: { value: code } });
    });

  it("tags its host's surface and reports the address entered, then each new code with its count", async () => {
    await renderStep(vi.fn());
    expect(currentAuthAttempt()).toMatchObject({ signInSurface: 'email_capture', signInMethod: 'email' });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Send a new code' }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Send a new code' }));
    });
    expect(mocks.steps).toEqual([
      { step: 'email_entered', extra: {} },
      { step: 'code_resent', extra: { code_resends: 1 } },
      { step: 'code_resent', extra: { code_resends: 2 } },
    ]);
  });

  it('reports a failed send by its code only', async () => {
    mocks.sendCode.mockRejectedValue(
      Object.assign(new Error('reader@example.com blocked'), { privyErrorCode: 'captcha_failure' })
    );
    await renderStep();
    expect(mocks.steps.at(-1)).toEqual({ step: 'code_send_failed', extra: { auth_error: 'captcha_failure' } });
    expect(currentAuthAttempt()?.lastAuthError).toBe('captcha_failure');
  });

  it('counts wrong tries on the code, and says when they are used up', async () => {
    mocks.loginWithCode.mockRejectedValue(wrongCode());
    await renderStep(vi.fn());
    for (let index = 0; index < 5; index += 1) await enter(String(111111 + index));
    const rejected = mocks.steps.filter(entry => entry.step === 'code_rejected').map(entry => entry.extra);
    expect(rejected[0]).toEqual({ auth_error: 'invalid_credentials', code_rejections: 1, attempts_exhausted: false });
    expect(rejected.at(-1)).toEqual({
      auth_error: 'invalid_credentials',
      code_rejections: 5,
      attempts_exhausted: true,
    });
    expect(mocks.steps.filter(entry => entry.step === 'code_submitted')).toHaveLength(5);
    expect(JSON.stringify(mocks.steps)).not.toContain('@');
  });

  it('reports a code rejected after its lifetime as expired', async () => {
    mocks.loginWithCode.mockRejectedValue(wrongCode());
    mocks.codeAgeMs = CODE_LIFETIME_MS;
    await renderStep(vi.fn());
    await enter('123456');
    expect(mocks.steps.at(-1)).toEqual({ step: 'code_expired', extra: { auth_error: 'invalid_credentials' } });
  });
});
