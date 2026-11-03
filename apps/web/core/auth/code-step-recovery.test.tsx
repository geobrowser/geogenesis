import { act, cleanup, render, screen } from '@testing-library/react';

import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  privy: { ready: true, authenticated: false, isModalOpen: false },
  email: { status: 'initial' } as { status: string },
  openSignIn: vi.fn(),
  notice: null as { email: string | null } | null,
  listeners: new Set<() => void>(),
  modalLink: false,
  step: {
    reloadedCodeStep: vi.fn(),
    clearCodeStep: vi.fn(),
    codeScreenShown: vi.fn(),
    codeStepHidden: vi.fn(),
    codeStepVisible: vi.fn(),
    codeStepAttemptEnded: vi.fn(),
    readPendingCode: vi.fn(() => null),
  },
}));

function setNotice(next: { email: string | null } | null) {
  mocks.notice = next;
  mocks.listeners.forEach(listener => listener());
}

vi.mock('~/core/wallet/auth-hooks', () => ({
  usePrivy: () => mocks.privy,
  useLoginWithEmail: () => ({ state: mocks.email }),
}));
vi.mock('~/core/hooks/use-privy-sign-in', () => ({ usePrivySignIn: () => mocks.openSignIn }));
vi.mock('~/core/hooks/use-on-sign-out', () => ({ useOnSignOut: vi.fn() }));
vi.mock('~/core/auth-attempt', () => ({
  currentAuthAttempt: () => undefined,
  readAuthAttempt: () => undefined,
  subscribeAuthAttempts: () => () => true,
}));
vi.mock('./code-step', () => ({
  ...mocks.step,
  landedOnModalLink: () => mocks.modalLink,
  recoveryNotice: () => mocks.notice,
  hideRecoveryNotice: () => setNotice(null),
  subscribeRecoveryNotice: (listener: () => void) => {
    mocks.listeners.add(listener);
    return () => void mocks.listeners.delete(listener);
  },
}));

const { CodeStepRecovery, LINK_SIGN_IN_GRACE_MS } = await import('./code-step-recovery');
const { CodeStepTracker } = await import('./code-step-tracker');

const PENDING = { attemptId: 'original', email: 'a@b.co', sentAt: Date.now(), documentId: 'old', properties: {} };

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  mocks.privy = { ready: true, authenticated: false, isModalOpen: false };
  mocks.email = { status: 'initial' };
  mocks.notice = null;
  mocks.modalLink = false;
  mocks.openSignIn.mockReset();
  Object.values(mocks.step).forEach(fn => fn.mockReset());
  document.body.innerHTML = '';
});

describe('CodeStepRecovery', () => {
  it('opens sign-in for an unclaimed code step once Privy is ready', () => {
    vi.useFakeTimers();
    mocks.step.reloadedCodeStep.mockReturnValue(PENDING);
    mocks.privy = { ready: false, authenticated: false, isModalOpen: false };
    const { rerender } = render(<CodeStepRecovery />);
    act(() => void vi.runAllTimers());
    expect(mocks.openSignIn).not.toHaveBeenCalled();

    mocks.privy = { ready: true, authenticated: false, isModalOpen: false };
    rerender(<CodeStepRecovery />);
    act(() => void vi.runAllTimers());
    expect(mocks.openSignIn).toHaveBeenCalledTimes(1);
  });

  it('leaves a ?modal= link to open sign-in, and opens it only if the link did not', () => {
    vi.useFakeTimers();
    mocks.modalLink = true;
    mocks.step.reloadedCodeStep.mockReturnValue(PENDING);
    render(<CodeStepRecovery />);
    act(() => void vi.advanceTimersByTime(LINK_SIGN_IN_GRACE_MS - 1));
    expect(mocks.openSignIn).not.toHaveBeenCalled();
    // The link's sign-in claimed it (or another tab did): nothing more to open.
    mocks.step.reloadedCodeStep.mockReturnValue(null);
    act(() => void vi.advanceTimersByTime(1));
    expect(mocks.openSignIn).not.toHaveBeenCalled();
  });

  it('opens nothing for someone already signed in', () => {
    vi.useFakeTimers();
    mocks.step.reloadedCodeStep.mockReturnValue(PENDING);
    mocks.privy = { ready: true, authenticated: true, isModalOpen: false };
    render(<CodeStepRecovery />);
    act(() => void vi.runAllTimers());
    expect(mocks.openSignIn).not.toHaveBeenCalled();
  });

  it('shows the notice while the recovered dialog waits, and takes it down once it closes', () => {
    const { rerender } = render(<CodeStepRecovery />);
    act(() => setNotice({ email: 'a@b.co' }));
    // Nothing is mailed by the recovery itself.
    expect(screen.getByRole('status').textContent).toBe('Continue signing in as a@b.co. Tap Submit to get a new code.');

    mocks.privy = { ...mocks.privy, isModalOpen: true };
    rerender(<CodeStepRecovery />);
    expect(screen.queryByRole('status')).not.toBeNull();
    mocks.privy = { ...mocks.privy, isModalOpen: false };
    rerender(<CodeStepRecovery />);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('takes the notice down once the new code is on its way', () => {
    const { rerender } = render(<CodeStepRecovery />);
    act(() => setNotice({ email: null }));
    expect(screen.getByRole('status').textContent).toContain('Enter your email');
    mocks.email = { status: 'sending-code' };
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

  it('forgets the code step once signed in by any route', () => {
    mocks.step.readPendingCode.mockReturnValue(PENDING as never);
    mocks.privy = { ready: true, authenticated: true, isModalOpen: false };
    render(<CodeStepTracker />);
    expect(mocks.step.clearCodeStep).toHaveBeenCalled();
  });
});
