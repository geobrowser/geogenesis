import { act, cleanup, render, screen } from '@testing-library/react';

import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  privy: { ready: true, authenticated: false, isModalOpen: false },
  email: { status: 'initial' } as { status: string },
  openSignIn: vi.fn(() => ({ id: 'recovery-attempt' })),
  signInOptions: undefined as { analytics?: () => Record<string, unknown> } | undefined,
  step: {
    claimReloadedCodeStep: vi.fn(),
    codeRecoveryOffered: vi.fn(),
    clearCodeStep: vi.fn(),
    codeScreenShown: vi.fn(),
    codeStepHidden: vi.fn(),
    codeStepVisible: vi.fn(),
    codeStepAttemptEnded: vi.fn(),
    readPendingCode: vi.fn(() => null),
  },
}));

vi.mock('~/core/wallet/auth-hooks', () => ({
  usePrivy: () => mocks.privy,
  useLoginWithEmail: () => ({ state: mocks.email }),
}));
vi.mock('~/core/hooks/use-privy-sign-in', () => ({
  usePrivySignIn: (_: unknown, options: typeof mocks.signInOptions) => {
    mocks.signInOptions = options;
    return mocks.openSignIn;
  },
}));
vi.mock('./code-step', () => mocks.step);

const { CodeStepRecovery } = await import('./code-step-recovery');
const { CodeStepTracker } = await import('./code-step-tracker');

const PENDING = {
  attemptId: 'original',
  email: 'a@b.co',
  sentAt: Date.now(),
  documentId: 'old',
  properties: { component: 'save_votes', auth_trigger: 'control', auth_intent: 'save_votes' },
};

afterEach(() => {
  cleanup();
  mocks.privy = { ready: true, authenticated: false, isModalOpen: false };
  mocks.email = { status: 'initial' };
  mocks.openSignIn.mockClear();
  Object.values(mocks.step).forEach(fn => fn.mockReset());
  document.body.innerHTML = '';
});

describe('CodeStepRecovery', () => {
  it('reopens sign-in with the address filled in, under the entry that started it', () => {
    mocks.step.claimReloadedCodeStep.mockReturnValue(PENDING);
    render(<CodeStepRecovery />);

    expect(mocks.openSignIn).toHaveBeenCalledTimes(1);
    expect(mocks.openSignIn).toHaveBeenCalledWith(undefined, { prefillEmail: 'a@b.co' });
    expect(mocks.signInOptions?.analytics?.()).toMatchObject({
      component: 'save_votes',
      // What `LocalVotesSaver` keys a save on, so a recovered save-votes sign-in still saves them.
      auth_intent: 'save_votes',
      auth_recovery: 'reloaded_code_step',
      recovered_attempt_id: 'original',
    });
    expect(mocks.step.codeRecoveryOffered).toHaveBeenCalledWith(PENDING, 'recovery-attempt');
    // Nothing is mailed by the recovery itself.
    expect(screen.getByRole('status').textContent).toContain('Press Submit to get a new code sent to a@b.co');
  });

  it('waits for Privy, and opens nothing for someone already signed in', () => {
    mocks.step.claimReloadedCodeStep.mockReturnValue(PENDING);
    mocks.privy = { ready: false, authenticated: false, isModalOpen: false };
    const { rerender } = render(<CodeStepRecovery />);
    expect(mocks.openSignIn).not.toHaveBeenCalled();

    mocks.privy = { ready: true, authenticated: true, isModalOpen: false };
    rerender(<CodeStepRecovery />);
    expect(mocks.openSignIn).not.toHaveBeenCalled();
    expect(mocks.step.clearCodeStep).toHaveBeenCalled();
  });

  it('takes the notice down once the new code is on its way, or the dialog closes', () => {
    mocks.step.claimReloadedCodeStep.mockReturnValue(PENDING);
    const { rerender } = render(<CodeStepRecovery />);
    mocks.privy = { ...mocks.privy, isModalOpen: true };
    rerender(<CodeStepRecovery />);
    expect(screen.queryByRole('status')).not.toBeNull();

    mocks.privy = { ...mocks.privy, isModalOpen: false };
    rerender(<CodeStepRecovery />);
    expect(screen.queryByRole('status')).toBeNull();
  });
});

describe('CodeStepTracker', () => {
  it('reports the code screen once per send, with the address Privy’s field held', () => {
    document.body.innerHTML = '<input id="email-input" value="a@b.co" />';
    const { rerender } = render(<CodeStepTracker />);
    for (const status of ['sending-code', 'awaiting-code-input', 'submitting-code', 'error', 'submitting-code']) {
      mocks.email = { status };
      rerender(<CodeStepTracker />);
    }
    expect(mocks.step.codeScreenShown).toHaveBeenCalledTimes(1);
    expect(mocks.step.codeScreenShown).toHaveBeenCalledWith('a@b.co');

    // A resend is a new code.
    for (const status of ['sending-code', 'awaiting-code-input']) {
      mocks.email = { status };
      rerender(<CodeStepTracker />);
    }
    expect(mocks.step.codeScreenShown).toHaveBeenCalledTimes(2);
  });

  it('reports the tab going to the background and coming back', () => {
    render(<CodeStepTracker />);
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    act(() => void document.dispatchEvent(new Event('visibilitychange')));
    visibility.mockReturnValue('visible');
    act(() => void document.dispatchEvent(new Event('visibilitychange')));
    expect(mocks.step.codeStepHidden).toHaveBeenCalledTimes(1);
    expect(mocks.step.codeStepVisible).toHaveBeenCalledTimes(1);
    visibility.mockRestore();
  });
});
