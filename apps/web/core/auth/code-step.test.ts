import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const analytics = vi.hoisted(() => ({ capture: vi.fn(), captureExperimental: vi.fn(), devLog: vi.fn() }));
vi.mock('~/core/analytics', () => analytics);
vi.mock('~/core/utils/dev-log', () => ({ devLog: analytics.devLog }));

type CodeStep = typeof import('./code-step');
type AuthAttemptModule = typeof import('~/core/auth-attempt');

/** A fresh document: module state (the document id, this tab's attempt) gone, sessionStorage kept. */
async function load(): Promise<{ step: CodeStep; attempts: AuthAttemptModule }> {
  vi.resetModules();
  return { step: await import('./code-step'), attempts: await import('~/core/auth-attempt') };
}

/** The page that holds the code goes away, as a reload or a closed tab does. */
function leave() {
  window.dispatchEvent(new Event('pagehide'));
}

function steps() {
  return analytics.devLog.mock.calls
    .filter(([label]) => label === '[auth_step]')
    .map(([, props]) => props as Record<string, unknown>);
}

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  analytics.capture.mockClear();
  analytics.captureExperimental.mockClear();
  analytics.devLog.mockClear();
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

  it('hands a new page its code step inside the window, carrying only the entry', async () => {
    const first = await load();
    first.attempts.beginAuthAttempt({ component: 'save_votes', auth_intent: 'save_votes', page_view_id: 'old' });
    first.step.codeScreenShown('a@b.co');
    first.step.codeStepHidden();
    leave();

    const { step } = await load();
    expect(step.reloadedCodeStep()).not.toBeNull();
    const claimed = step.takeCodeRecovery();
    expect(claimed).toMatchObject({
      email: 'a@b.co',
      properties: { component: 'save_votes', auth_intent: 'save_votes' },
    });
    // The dead page's view, and anything else the entry carried, is not stored.
    expect(claimed!.properties).not.toHaveProperty('page_view_id');
    expect(steps().at(-1)).toMatchObject({ auth_step: 'returned_to_code_screen', returned_to: 'new_page' });
    // Claimed: taking it again in this page returns it without reporting a second return.
    expect(step.takeCodeRecovery()).toMatchObject({ email: 'a@b.co' });
    expect(steps().filter(props => props.returned_to === 'new_page')).toHaveLength(1);
  });

  it('lets only the first page to claim it pick the step up, until that page goes too', async () => {
    const first = await load();
    first.step.codeScreenShown('a@b.co');
    leave();

    const second = await load();
    expect(second.step.takeCodeRecovery()).not.toBeNull();

    // A third tab, opened while the second is open, behaves normally.
    const third = await load();
    await third.step.codeOwnerChecked();
    expect(third.step.reloadedCodeStep()).toBeNull();
    expect(third.step.takeCodeRecovery()).toBeNull();

    // The second goes without sending a new code (a refused send, say): its claim is released.
    leave();
    const { step } = await load();
    expect(step.takeCodeRecovery()).toMatchObject({ email: 'a@b.co' });
  });

  it('leaves a code alone while the page that sent it is still open', async () => {
    const first = await load();
    first.step.codeScreenShown('a@b.co');

    const { step } = await load();
    expect(step.pendingCodeElsewhere()).not.toBeNull();
    await step.codeOwnerChecked();
    expect(step.reloadedCodeStep()).toBeNull();
    expect(step.takeCodeRecovery()).toBeNull();
    expect(step.readPendingCode()).not.toHaveProperty('claimedBy');
  });

  it('recovers when the sending page cannot answer, as a suspended tab cannot', async () => {
    const first = await load();
    first.step.codeScreenShown('a@b.co');
    // As if written by a page whose scripts are no longer running.
    localStorage.setItem(
      'geo:auth-code-step:v1',
      JSON.stringify({ ...first.step.readPendingCode(), documentId: 'suspended' })
    );

    const { step } = await load();
    expect(step.reloadedCodeStep()).toBeNull();
    await step.codeOwnerChecked();
    expect(step.reloadedCodeStep()).toMatchObject({ email: 'a@b.co' });
  });

  it('recovers again on every later page, not just the first', async () => {
    const first = await load();
    first.attempts.beginAuthAttempt({ component: 'debate_matchmaking', auth_trigger: 'deep_link' });
    first.step.codeScreenShown('a@b.co');

    for (let cycle = 0; cycle < 3; cycle++) {
      leave();
      const { step, attempts } = await load();
      const pending = step.takeCodeRecovery();
      expect(pending, `cycle ${cycle}`).toMatchObject({ email: 'a@b.co' });
      const recovery = attempts.beginAuthAttempt({ ...pending!.properties, ...step.codeRecoveryProperties(pending!) });
      step.codeRecoveryOffered(pending!, recovery.id);
      // Submit in the recovered dialog: a new code, this page's own.
      step.codeScreenShown('a@b.co');
      expect(step.readPendingCode()).toMatchObject({ recoveryAttemptId: recovery.id });
      expect(step.readPendingCode()).not.toHaveProperty('claimedBy');
      expect(steps().at(-1)).toMatchObject({ auth_step: 'code_screen_shown', recovered: true });
    }
  });

  it('reads the address from the field once an announced send has failed', async () => {
    const { step } = await load();
    step.announceCodeEmail('first@example.com');
    step.forgetAnnouncedCodeEmail();
    step.codeScreenShown('other@example.com');
    expect(step.readPendingCode()?.email).toBe('other@example.com');
  });

  it('never reports a negative code age when the clock went backwards', async () => {
    vi.useFakeTimers({ now: 1_000_000 });
    const { step } = await load();
    step.codeScreenShown('a@b.co');
    vi.setSystemTime(999_000.4);
    step.codeStepHidden();
    expect(steps().at(-1)).toMatchObject({ auth_step: 'left_code_screen', code_age_ms: 0 });
  });

  // Each recovered page sends a new code; the page after it must be able to pick that one up too.
  // The collector rejects tagged events with no registry contract, so nothing goes out yet.
  it('sends no step events until auth_step is registered', async () => {
    const { step } = await load();
    step.codeScreenShown('a@b.co');
    expect(steps()).toHaveLength(1);
    expect(analytics.captureExperimental).not.toHaveBeenCalled();
    expect(analytics.capture).not.toHaveBeenCalled();
  });

  it('forgets a code older than the window', async () => {
    vi.useFakeTimers({ now: 1_000_000 });
    const first = await load();
    first.step.codeScreenShown('a@b.co');

    vi.setSystemTime(1_000_000 + first.step.CODE_RECOVERY_WINDOW_MS);
    const { step } = await load();
    expect(step.takeCodeRecovery()).toBeNull();
    expect(localStorage.getItem('geo:auth-code-step:v1')).toBeNull();
  });

  it('finishes when the recovered attempt signs in', async () => {
    const first = await load();
    first.attempts.beginAuthAttempt({ component: 'sign_in_deep_link', auth_trigger: 'deep_link' });
    first.step.codeScreenShown('a@b.co');
    leave();

    const { step, attempts } = await load();
    const pending = step.takeCodeRecovery()!;
    const recovery = attempts.beginAuthAttempt({ ...pending.properties, ...step.codeRecoveryProperties(pending) });
    step.codeRecoveryOffered(pending, recovery.id);
    expect(step.recoveryNotice()).toEqual({ email: 'a@b.co' });

    // Superseded by another press: still waiting.
    step.codeStepAttemptEnded({ ...recovery, outcome: 'superseded' });
    expect(step.readPendingCode()).not.toBeNull();

    attempts.finishAuthAttempt('signed_up', recovery);
    step.codeStepAttemptEnded(attempts.readAuthAttempt(recovery.id)!);
    expect(step.readPendingCode()).toBeNull();
    expect(step.recoveryNotice()).toBeNull();
    expect(steps().at(-1)).toMatchObject({ auth_step: 'finished', outcome: 'signed_up', recovered: true });
    expect(steps().find(props => props.auth_step === 'recovery_offered')).toMatchObject({ prefilled: true });
  });

  it('forgets the step when the visitor closes any sign-in, or signs in by another route', async () => {
    const { step, attempts } = await load();
    step.codeScreenShown('a@b.co');
    const other = attempts.beginAuthAttempt({ component: 'navbar' });

    step.codeStepAttemptEnded({ ...other, outcome: 'closed' });
    expect(step.readPendingCode()).toBeNull();
    // Not the code's own attempt: nothing reported as finished.
    expect(steps().some(props => props.auth_step === 'finished')).toBe(false);

    step.codeScreenShown('a@b.co');
    step.codeStepAttemptEnded({ ...other, id: 'elsewhere', outcome: 'signed_in' });
    expect(step.readPendingCode()).toBeNull();
  });
});
