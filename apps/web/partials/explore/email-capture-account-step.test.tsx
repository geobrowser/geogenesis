import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

import * as React from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { codeStepClasses } from '~/partials/save-votes/save-votes-styles';

import { AccountStep } from './email-capture-account-step';

const mocks = vi.hoisted(() => ({
  sendCode: vi.fn(),
  otpState: { status: 'initial' } as { status: string },
}));

vi.mock('~/core/analytics', () => ({ capture: vi.fn(), trackPrivyAuth: vi.fn(), signupCompleted: vi.fn() }));
vi.mock('~/core/wallet/auth-hooks', () => ({
  useLoginWithEmail: () => ({
    sendCode: (args: { email: string }) => mocks.sendCode(args),
    loginWithCode: vi.fn(),
    state: mocks.otpState,
  }),
}));
vi.mock('~/core/hooks/use-privy-sign-in', () => ({ usePrivySignIn: () => vi.fn() }));

afterEach(cleanup);

beforeEach(() => {
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
