import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const analytics = vi.hoisted(() => ({ capture: vi.fn(), captureExperimental: vi.fn(), devLog: vi.fn() }));
vi.mock('~/core/analytics', () => analytics);
vi.mock('~/core/utils/dev-log', () => ({ devLog: analytics.devLog }));

type CodeStep = typeof import('./code-step');
type AuthAttemptModule = typeof import('~/core/auth-attempt');

const KEY = 'geo:auth-code-step:v1';

/** A fresh document in the same tab: module state (the document id, this tab's attempt) gone, sessionStorage kept. */
async function load(): Promise<{ step: CodeStep; attempts: AuthAttemptModule }> {
  vi.resetModules();
  return { step: await import('./code-step'), attempts: await import('~/core/auth-attempt') };
}

/** A fresh document in a new tab, landing on `url`. */
async function loadNewTab(url = '/') {
  sessionStorage.clear();
  window.history.replaceState(null, '', url);
  return load();
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

/** A Web Locks stand-in: one holder at a time, in request order, as across real documents. */
function installLocks() {
  let tail: Promise<unknown> = Promise.resolve();
  const request = vi.fn((_name: string, callback: () => unknown) => {
    const run = tail.then(() => new Promise(resolve => setTimeout(resolve, 0))).then(callback);
    tail = run.catch(() => undefined);
    return run;
  });
  Object.defineProperty(navigator, 'locks', { value: { request }, configurable: true });
  return request;
}

let navigation = 'reload';

beforeEach(() => {
  // Earlier tests' documents are gone, as a reloaded page's are.
  window.dispatchEvent(new Event('pagehide'));
  navigation = 'reload';
  vi.spyOn(performance, 'getEntriesByType').mockImplementation(type =>
    type === 'navigation' ? ([{ type: navigation }] as unknown as PerformanceEntryList) : []
  );
  sessionStorage.clear();
  localStorage.clear();
  window.history.replaceState(null, '', '/');
  analytics.capture.mockClear();
  analytics.captureExperimental.mockClear();
  analytics.devLog.mockClear();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  Reflect.deleteProperty(navigator, 'locks');
  Reflect.deleteProperty(window, 'opener');
  Object.defineProperty(window, 'top', { value: window, configurable: true, writable: true });
});

describe('code step', () => {
  it('remembers the code screen with the address, the attempt and the tab it belongs to', async () => {
    const { step, attempts } = await load();
    const attempt = attempts.beginAuthAttempt({ component: 'navbar', auth_trigger: 'control' });
    step.codeScreenShown('  Someone@Example.com ');

    expect(step.readPendingCode()).toMatchObject({
      attemptId: attempt.id,
      email: 'someone@example.com',
      tabId: sessionStorage.getItem('geo:auth-code-step:tab'),
    });
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

  it('hands the same tab its code step after a reload, carrying only the entry', async () => {
    const first = await load();
    first.attempts.beginAuthAttempt({ component: 'save_votes', auth_intent: 'save_votes', page_view_id: 'old' });
    first.step.codeScreenShown('a@b.co');
    first.step.codeStepHidden();
    leave();

    const { step } = await load();
    await step.claimCodeRecovery();
    // Claimed before the app renders: the page must still expect a recovery.
    expect(step.pendingCodeElsewhere()).toBeNull();
    expect(step.codeRecoveryExpected()).toBe(true);
    expect(step.codeRecoveryWaiting()).toMatchObject({ email: 'a@b.co' });
    // Any sign-in in the same tab picks it up, a control's included.
    const claimed = step.takeCodeRecovery({ auth_trigger: 'control' });
    expect(claimed).toMatchObject({
      email: 'a@b.co',
      properties: { component: 'save_votes', auth_intent: 'save_votes' },
    });
    // The dead page's view, and anything else the entry carried, is not stored.
    expect(claimed!.properties).not.toHaveProperty('page_view_id');
    expect(steps().at(-1)).toMatchObject({ auth_step: 'returned_to_code_screen', returned_to: 'new_page' });
    expect(step.codeRecoveryWaiting()).toBeNull();
  });

  it('shows nothing to a new tab with no link, and leaves the code for its owner', async () => {
    const first = await load();
    first.step.codeScreenShown('alice@example.com');
    leave();

    const { step, attempts } = await loadNewTab('/explore');
    expect(step.codeRecoveryExpected()).toBe(false);
    expect(await step.claimCodeRecovery()).toBeNull();
    // A manual Log in or save-votes press opens an empty sign-in.
    expect(step.takeCodeRecovery({ auth_trigger: 'control' })).toBeNull();
    expect(step.recoveryNotice()).toBeNull();

    // Closing that sign-in clears nothing: the record is not this page's to clear.
    const own = attempts.beginAuthAttempt({ component: 'navbar' });
    step.codeStepAttemptEnded({ ...own, outcome: 'closed' });
    await Promise.resolve();
    expect(step.readPendingCode()).toMatchObject({ email: 'alice@example.com' });
    expect(step.readPendingCode()).not.toHaveProperty('claimedBy');
  });

  it('lets a new tab from a sign-in link pick it up inside the link window', async () => {
    installLocks();
    vi.useFakeTimers({ now: 1_000_000, toFake: ['Date'] });
    const first = await load();
    first.step.codeScreenShown('a@b.co');
    await vi.waitFor(() => expect(first.step.readPendingCode()).not.toBeNull());
    leave();

    vi.setSystemTime(1_000_000 + 60_000);
    const { step } = await loadNewTab('/explore?modal=signin');
    await step.claimCodeRecovery();
    // Not for the page's own auto-open: only the link's sign-in may use it.
    expect(step.codeRecoveryWaiting()).toBeNull();
    expect(step.takeCodeRecovery({ auth_trigger: 'deep_link' })).toMatchObject({ email: 'a@b.co' });
  });

  it('does not let a sign-in link pick it up after the link window', async () => {
    vi.useFakeTimers({ now: 1_000_000, toFake: ['Date'] });
    const first = await load();
    first.step.codeScreenShown('a@b.co');
    leave();

    const { LINK_RECOVERY_WINDOW_MS } = first.step;
    vi.setSystemTime(1_000_000 + LINK_RECOVERY_WINDOW_MS);
    const { step } = await loadNewTab('/explore?modal=signin');
    expect(step.pendingCodeElsewhere()).toBeNull();
    expect(await step.claimCodeRecovery()).toBeNull();
    expect(step.takeCodeRecovery({ auth_trigger: 'deep_link' })).toBeNull();
    expect(step.readPendingCode()).not.toBeNull();
  });

  it('releases a link page claim that a non-link sign-in cannot use', async () => {
    installLocks();
    const first = await load();
    first.step.codeScreenShown('a@b.co');
    await vi.waitFor(() => expect(first.step.readPendingCode()).not.toBeNull());
    leave();

    const linked = await loadNewTab('/explore?modal=debates&modalTarget=people');
    expect(await linked.step.claimCodeRecovery()).not.toBeNull();
    expect(linked.step.takeCodeRecovery({ auth_trigger: 'control' })).toBeNull();

    // Another link tab can now take it, though the first is still open.
    const { step } = await loadNewTab('/explore?modal=signin');
    expect(await step.claimCodeRecovery()).not.toBeNull();
  });

  it('lets only the first page to claim it pick the step up, until that page goes too', async () => {
    const first = await load();
    first.step.codeScreenShown('a@b.co');
    leave();

    const second = await load();
    expect(await second.step.claimCodeRecovery()).not.toBeNull();

    // A third page, opened while the second is open, behaves normally.
    const tab = sessionStorage.getItem('geo:auth-code-step:tab')!;
    const third = await loadNewTab('/explore?modal=signin');
    expect(await third.step.claimCodeRecovery()).toBeNull();
    expect(third.step.takeCodeRecovery({ auth_trigger: 'deep_link' })).toBeNull();

    // The second goes without sending a new code (a refused send, say): its claim is released.
    leave();
    sessionStorage.setItem('geo:auth-code-step:tab', tab);
    const { step } = await load();
    await step.claimCodeRecovery();
    expect(step.takeCodeRecovery()).toMatchObject({ email: 'a@b.co' });
  });

  it('gives the code to one of two pages claiming it at once, through the lock', async () => {
    const request = installLocks();
    const first = await load();
    first.step.codeScreenShown('a@b.co');
    await vi.waitFor(() => expect(first.step.readPendingCode()).not.toBeNull());
    leave();

    const a = await loadNewTab('/explore?modal=signin');
    const b = await loadNewTab('/explore?modal=signin');
    const claims = await Promise.all([a.step.claimCodeRecovery(), b.step.claimCodeRecovery()]);
    expect(claims.filter(Boolean)).toHaveLength(1);
    expect(request).toHaveBeenCalledWith('geo:auth-code-step', expect.any(Function));
  });

  it('without Web Locks, lets no new tab pick it up, a sign-in link included', async () => {
    const first = await load();
    first.step.codeScreenShown('a@b.co');
    leave();

    const { step } = await loadNewTab('/explore?modal=signin');
    expect(await step.claimCodeRecovery()).toBeNull();
    expect(step.takeCodeRecovery({ auth_trigger: 'deep_link' })).toBeNull();
  });

  it('still claims the same tab without Web Locks, reading the claim back', async () => {
    expect('locks' in navigator).toBe(false);
    const first = await load();
    first.step.codeScreenShown('a@b.co');
    leave();

    const a = await load();
    const b = await load();
    const claims = await Promise.all([a.step.claimCodeRecovery(), b.step.claimCodeRecovery()]);
    expect(claims.filter(Boolean)).toHaveLength(1);
  });

  it('gives a duplicated tab its own id while the original is open, so it never recovers it', async () => {
    const first = await load();
    first.step.codeScreenShown('a@b.co');
    const original = sessionStorage.getItem('geo:auth-code-step:tab');

    // Duplicate Tab copies sessionStorage and reports a history load.
    navigation = 'back_forward';
    const duplicate = await load();
    await duplicate.step.claimCodeRecovery();
    expect(sessionStorage.getItem('geo:auth-code-step:tab')).not.toBe(original);

    // The original closes; someone reloads the duplicate.
    leave();
    navigation = 'reload';
    const { step } = await load();
    expect(await step.claimCodeRecovery()).toBeNull();
    expect(step.codeRecoveryWaiting()).toBeNull();
    expect(step.takeCodeRecovery()).toBeNull();
  });

  it('gives a page another page opened its own id', async () => {
    const first = await load();
    first.step.codeScreenShown('a@b.co');
    leave();

    // window.open copies the opener's sessionStorage.
    Object.defineProperty(window, 'opener', { value: {}, configurable: true });
    const { step } = await load();
    expect(await step.claimCodeRecovery()).toBeNull();
    expect(step.takeCodeRecovery()).toBeNull();
  });

  it('gives a page loaded by a plain navigation its own id', async () => {
    const first = await load();
    first.step.codeScreenShown('a@b.co');
    leave();

    navigation = 'navigate';
    const { step } = await load();
    expect(await step.claimCodeRecovery()).toBeNull();
  });

  it('never recovers inside a frame, which shares its parent tab storage', async () => {
    installLocks();
    const first = await load();
    first.step.codeScreenShown('a@b.co');
    await vi.waitFor(() => expect(first.step.readPendingCode()).not.toBeNull());
    leave();

    Object.defineProperty(window, 'top', { value: {}, configurable: true, writable: true });
    window.history.replaceState(null, '', '/explore?modal=signin');
    const { step } = await load();
    expect(step.codeRecoveryExpected()).toBe(false);
    expect(await step.claimCodeRecovery()).toBeNull();
    expect(step.takeCodeRecovery({ auth_trigger: 'deep_link' })).toBeNull();
  });

  it('never rewrites the record on pagehide, so a newer claim survives it', async () => {
    const first = await load();
    first.step.codeScreenShown('a@b.co');
    leave();
    const second = await load();
    await second.step.claimCodeRecovery();
    const record = localStorage.getItem(KEY);

    // The first document's pagehide again (a late one), then the claimer's own.
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    leave();
    expect(setItem.mock.calls.some(([key]) => key === KEY)).toBe(false);
    setItem.mockRestore();
    expect(localStorage.getItem(KEY)).toBe(record);
  });

  it('leaves a code alone while the page that sent it is still open', async () => {
    const first = await load();
    first.step.codeScreenShown('a@b.co');

    const { step } = await load();
    expect(step.pendingCodeElsewhere()).not.toBeNull();
    expect(await step.claimCodeRecovery()).toBeNull();
    expect(step.takeCodeRecovery()).toBeNull();
    expect(step.readPendingCode()).not.toHaveProperty('claimedBy');
  });

  it('recovers when the sending page cannot answer, as a suspended tab cannot', async () => {
    const first = await load();
    first.step.codeScreenShown('a@b.co');
    // Owned by a page with no listener, as a suspended tab has none.
    localStorage.setItem(KEY, JSON.stringify({ ...first.step.readPendingCode(), documentId: 'suspended' }));
    // The page standing in for it is gone; the owner itself never answers.
    leave();

    const { step } = await load();
    expect(step.reloadedCodeStep()).toBeNull();
    expect(await step.claimCodeRecovery()).toMatchObject({ email: 'a@b.co' });
  });

  // Each recovered page sends a new code; the page after it must be able to pick that one up too.
  it('recovers again on every later page, not just the first', async () => {
    const first = await load();
    first.attempts.beginAuthAttempt({ component: 'debate_matchmaking', auth_trigger: 'deep_link' });
    first.step.codeScreenShown('a@b.co');

    for (let cycle = 0; cycle < 3; cycle++) {
      leave();
      const { step, attempts } = await load();
      await step.claimCodeRecovery();
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

  // The collector rejects tagged events with no registry contract, so nothing goes out yet.
  it('sends no step events until auth_step is registered', async () => {
    const { step } = await load();
    step.codeScreenShown('a@b.co');
    expect(steps()).toHaveLength(1);
    expect(analytics.captureExperimental).not.toHaveBeenCalled();
    expect(analytics.capture).not.toHaveBeenCalled();
  });

  it('forgets a code older than the window', async () => {
    vi.useFakeTimers({ now: 1_000_000, toFake: ['Date'] });
    const first = await load();
    first.step.codeScreenShown('a@b.co');
    leave();

    vi.setSystemTime(1_000_000 + first.step.CODE_RECOVERY_WINDOW_MS);
    const { step } = await load();
    expect(await step.claimCodeRecovery()).toBeNull();
    expect(localStorage.getItem(KEY)).toBeNull();
    expect(Object.keys(localStorage).filter(key => key.startsWith('geo:auth-code-step:gone:'))).toEqual([]);
  });

  it('finishes when the recovered attempt signs in', async () => {
    const first = await load();
    first.attempts.beginAuthAttempt({ component: 'sign_in_deep_link', auth_trigger: 'deep_link' });
    first.step.codeScreenShown('a@b.co');
    leave();

    const { step, attempts } = await load();
    await step.claimCodeRecovery();
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

  it('forgets the step when its own tab closes any sign-in, or anyone signs in', async () => {
    const { step, attempts } = await load();
    step.codeScreenShown('a@b.co');
    const other = attempts.beginAuthAttempt({ component: 'navbar' });

    step.codeStepAttemptEnded({ ...other, outcome: 'closed' });
    expect(step.readPendingCode()).toBeNull();
    // Not the code's own attempt: nothing reported as finished.
    expect(steps().some(props => props.auth_step === 'finished')).toBe(false);

    step.codeScreenShown('a@b.co');
    const elsewhere = await loadNewTab();
    elsewhere.step.codeStepAttemptEnded({ ...other, id: 'elsewhere', outcome: 'signed_in' });
    expect(step.readPendingCode()).toBeNull();
  });
});
