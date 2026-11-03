import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const analytics = vi.hoisted(() => ({ capture: vi.fn(), captureExperimental: vi.fn() }));
vi.mock('~/core/analytics', () => analytics);

type CodeStep = typeof import('./code-step');
type AuthAttemptModule = typeof import('~/core/auth-attempt');

/** A fresh document: module state (the document id, this tab's attempt) gone, sessionStorage kept. */
async function load(): Promise<{ step: CodeStep; attempts: AuthAttemptModule }> {
  vi.resetModules();
  return { step: await import('./code-step'), attempts: await import('~/core/auth-attempt') };
}

function steps() {
  return analytics.captureExperimental.mock.calls
    .filter(([event]) => event === 'experimental.auth_step')
    .map(([, props]) => props as Record<string, unknown>);
}

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  analytics.capture.mockClear();
  analytics.captureExperimental.mockClear();
});
afterEach(() => vi.useRealTimers());

describe('code step', () => {
  it('remembers the code screen with the address and the attempt it belongs to', async () => {
    const { step, attempts } = await load();
    const attempt = attempts.beginAuthAttempt({ component: 'navbar', auth_trigger: 'control' });
    step.codeScreenShown('  Someone@Example.com ');

    expect(step.readPendingCode()).toMatchObject({ attemptId: attempt.id, email: 'someone@example.com' });
    expect(steps()).toEqual([
      expect.objectContaining({ auth_step: 'code_screen_shown', component: 'navbar', code_attempt_id: attempt.id }),
    ]);
    // The address stays on the device.
    expect(JSON.stringify(steps())).not.toContain('example.com');
  });

  it('prefers the address the headless step announced over the field', async () => {
    const { step } = await load();
    step.announceCodeEmail('Votes@Example.com');
    step.codeScreenShown(null);
    expect(step.readPendingCode()?.email).toBe('votes@example.com');
  });

  it('reports leaving and coming back to the same page', async () => {
    const { step } = await load();
    step.codeScreenShown('a@b.co');
    step.codeStepHidden();
    step.codeStepHidden();
    step.codeStepVisible();
    expect(steps().map(props => props.auth_step)).toEqual([
      'code_screen_shown',
      'left_code_screen',
      'returned_to_code_screen',
    ]);
    expect(steps()[2]).toMatchObject({ returned_to: 'same_page' });
    // The same page is not a reload.
    expect(step.reloadedCodeStep()).toBeNull();
  });

  it('hands a reloaded tab its code step inside the window, once claimed', async () => {
    const first = await load();
    first.attempts.beginAuthAttempt({ component: 'save_votes' });
    first.step.codeScreenShown('a@b.co');
    first.step.codeStepHidden();

    const { step } = await load();
    expect(step.recoveringCodeStep()).toBe(true);
    const claimed = step.claimReloadedCodeStep();
    expect(claimed).toMatchObject({
      email: 'a@b.co',
      properties: expect.objectContaining({ component: 'save_votes' }),
    });
    // The dead page's view is not carried into the new one.
    expect(Object.keys(claimed!.properties).filter(key => key.startsWith('page_'))).toEqual([]);
    expect(steps().at(-1)).toMatchObject({ auth_step: 'returned_to_code_screen', returned_to: 'reloaded_page' });
    // Claimed for this document: a second reader does not see it as a reload, but still knows.
    expect(step.reloadedCodeStep()).toBeNull();
    expect(step.recoveringCodeStep()).toBe(true);
  });

  it('forgets a code older than the window', async () => {
    vi.useFakeTimers({ now: 1_000_000 });
    const first = await load();
    first.step.codeScreenShown('a@b.co');

    vi.setSystemTime(1_000_000 + first.step.CODE_RECOVERY_WINDOW_MS);
    const { step } = await load();
    expect(step.reloadedCodeStep()).toBeNull();
    expect(step.recoveringCodeStep()).toBe(false);
    expect(sessionStorage.length).toBe(0);
  });

  it('finishes when the recovered attempt ends, and only that one', async () => {
    const first = await load();
    first.attempts.beginAuthAttempt({ component: 'sign_in_deep_link', auth_trigger: 'deep_link' });
    first.step.codeScreenShown('a@b.co');

    const { step, attempts } = await load();
    const pending = step.claimReloadedCodeStep()!;
    const recovery = attempts.beginAuthAttempt({ ...pending.properties, auth_recovery: 'reloaded_code_step' });
    step.codeRecoveryOffered(pending, recovery.id);

    step.codeStepAttemptEnded({ ...recovery, id: 'someone-else', outcome: 'closed' });
    expect(step.readPendingCode()).not.toBeNull();

    attempts.finishAuthAttempt('signed_up', recovery);
    step.codeStepAttemptEnded(attempts.readAuthAttempt(recovery.id)!);
    expect(step.readPendingCode()).toBeNull();
    expect(steps().at(-1)).toMatchObject({ auth_step: 'finished', outcome: 'signed_up', recovered: true });
    expect(steps().find(props => props.auth_step === 'recovery_offered')).toMatchObject({ prefilled: true });
  });
});
