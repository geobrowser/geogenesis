import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  reports: [] as { name: string; level?: string; tags?: Record<string, unknown>; extra?: Record<string, unknown> }[],
}));

vi.mock('~/core/telemetry/logger', () => ({
  reportEvent: (event: (typeof mocks.reports)[number]) => void mocks.reports.push(event),
}));
vi.mock('~/core/analytics', async importOriginal => ({
  ...((await importOriginal()) as Record<string, unknown>),
  capture: vi.fn(),
  captureExperimental: vi.fn(),
}));

const { beginAuthAttempt, finishAuthAttempt, openAuthAttempt, resetAuthAttempt, tagAuthAttempt } =
  await import('~/core/auth-attempt');
const { publish, requestRealAuth, resetAuthStore } = await import('~/core/wallet/auth-store');
const {
  CODE_SEND_TIMEOUT_MS,
  PRIVY_READY_TIMEOUT_MS,
  PROMPT_TIMEOUT_MS,
  installSignInReports,
  reportSignInLoadFailed,
  resetSignInReports,
  watchCodeSend,
} = await import('./sign-in-reports');

installSignInReports();

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: state });
  document.dispatchEvent(new Event('visibilitychange'));
}

function privyReady() {
  publish('privy', { ready: true } as never);
}

const names = () => mocks.reports.map(report => report.name);

beforeEach(() => {
  vi.useFakeTimers();
  mocks.reports.length = 0;
  localStorage.clear();
  sessionStorage.clear();
  resetAuthStore();
  resetAuthAttempt();
  // Visible first: coming back from a previous test's hidden page counts as hidden.
  setVisibility('visible');
  resetSignInReports();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('sign_in_prompt_timeout', () => {
  it('fires once for an attempt with nothing on screen after 8 s, tagged with its entry point', () => {
    const attempt = beginAuthAttempt({ component: 'navbar', auth_trigger: 'control' });
    tagAuthAttempt(attempt.id, { signInSurface: 'box' });
    privyReady();
    vi.advanceTimersByTime(PROMPT_TIMEOUT_MS - 1);
    expect(names()).toEqual([]);
    vi.advanceTimersByTime(PRIVY_READY_TIMEOUT_MS);
    expect(mocks.reports).toEqual([
      expect.objectContaining({
        name: 'sign_in_prompt_timeout',
        level: 'warning',
        tags: expect.objectContaining({ component: 'navbar', auth_trigger: 'control', sign_in_surface: 'box' }),
        extra: expect.objectContaining({ auth_attempt_id: attempt.id, elapsed_ms: PROMPT_TIMEOUT_MS }),
      }),
    ]);
  });

  it('stays quiet once the prompt opened, or the attempt ended', () => {
    privyReady();
    beginAuthAttempt({ component: 'navbar' });
    openAuthAttempt();
    vi.advanceTimersByTime(PROMPT_TIMEOUT_MS);
    beginAuthAttempt({ component: 'navbar' });
    finishAuthAttempt('closed');
    vi.advanceTimersByTime(PRIVY_READY_TIMEOUT_MS);
    expect(names()).toEqual([]);
  });

  it('reports only the current attempt when a second press supersedes the first', () => {
    privyReady();
    beginAuthAttempt({ component: 'navbar' });
    vi.advanceTimersByTime(2_000);
    beginAuthAttempt({ component: 'sign_in_deep_link' });
    vi.advanceTimersByTime(PROMPT_TIMEOUT_MS);
    expect(mocks.reports.map(report => report.tags?.component)).toEqual(['sign_in_deep_link']);
  });
});

describe('sign_in_load_failed', () => {
  it('reports never_ready as its own issue, apart from a call that then gave up', () => {
    requestRealAuth();
    const attempt = beginAuthAttempt({ component: 'sign_in_deep_link', link_source: 'marketing' });
    openAuthAttempt();
    vi.advanceTimersByTime(PRIVY_READY_TIMEOUT_MS);
    reportSignInLoadFailed('call_timeout', { call: 'send_code' });
    reportSignInLoadFailed('call_timeout', { call: 'send_code' });
    expect(mocks.reports).toEqual([
      expect.objectContaining({
        name: 'sign_in_privy_not_ready',
        level: 'warning',
        tags: expect.objectContaining({
          privy_loaded: false,
          privy_requested: true,
          link_source: 'marketing',
          reason: 'never_ready',
        }),
        extra: expect.objectContaining({ reason: 'never_ready', auth_attempt_id: attempt.id }),
      }),
      expect.objectContaining({
        name: 'sign_in_load_failed',
        level: 'error',
        tags: expect.objectContaining({ reason: 'call_timeout' }),
        extra: expect.objectContaining({ call: 'send_code' }),
      }),
    ]);
  });

  it('carries the reason and error of the first failure: a chunk that would not load', () => {
    beginAuthAttempt({ component: 'navbar' });
    openAuthAttempt();
    reportSignInLoadFailed('chunk_load', { error: new TypeError('Failed to fetch dynamically imported module') });
    reportSignInLoadFailed('call_timeout', { call: 'login' });
    vi.advanceTimersByTime(PRIVY_READY_TIMEOUT_MS);
    expect(names()).toEqual(['sign_in_load_failed', 'sign_in_privy_not_ready']);
    expect(mocks.reports.slice(0, 1)).toEqual([
      expect.objectContaining({
        name: 'sign_in_load_failed',
        extra: expect.objectContaining({
          reason: 'chunk_load',
          error_name: 'TypeError',
          error_message: 'Failed to fetch dynamically imported module',
        }),
      }),
    ]);
  });

  it('is not reported with no sign-in open: a background load is nobody’s failed sign-in', () => {
    reportSignInLoadFailed('chunk_load');
    beginAuthAttempt();
    finishAuthAttempt('closed');
    reportSignInLoadFailed('call_timeout', { call: 'get_access_token' });
    expect(names()).toEqual([]);
  });

  it('is not reported once Privy started in time', () => {
    beginAuthAttempt();
    openAuthAttempt();
    vi.advanceTimersByTime(PRIVY_READY_TIMEOUT_MS - 1);
    privyReady();
    vi.advanceTimersByTime(1);
    expect(names()).toEqual([]);
  });
});

describe('sign_in_code_send_timeout', () => {
  it('fires once for a send still pending after 30 s', () => {
    privyReady();
    const attempt = beginAuthAttempt({ component: 'navbar' });
    openAuthAttempt();
    watchCodeSend(attempt.id);
    watchCodeSend(attempt.id);
    vi.advanceTimersByTime(CODE_SEND_TIMEOUT_MS - 1);
    expect(names()).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(names()).toEqual(['sign_in_code_send_timeout']);
  });

  it('stays quiet for a send that settled, or a sign-in that was closed', () => {
    privyReady();
    const attempt = beginAuthAttempt();
    openAuthAttempt();
    watchCodeSend(attempt.id)();
    vi.advanceTimersByTime(CODE_SEND_TIMEOUT_MS);
    watchCodeSend(attempt.id);
    finishAuthAttempt('closed');
    vi.advanceTimersByTime(CODE_SEND_TIMEOUT_MS);
    expect(names()).toEqual([]);
  });
});

describe('a page hidden during the attempt', () => {
  it('reports no timeout for an attempt begun in a background tab, made visible after the timeouts', () => {
    setVisibility('hidden');
    const attempt = beginAuthAttempt({ component: 'sign_in_deep_link', link_source: 'marketing' });
    watchCodeSend(attempt.id);
    vi.advanceTimersByTime(CODE_SEND_TIMEOUT_MS);
    setVisibility('visible');
    reportSignInLoadFailed('call_timeout', { call: 'login' });
    vi.advanceTimersByTime(CODE_SEND_TIMEOUT_MS);
    expect(names()).toEqual([]);
  });

  it('reports no timeout for an attempt whose tab was hidden for a moment mid-way', () => {
    const attempt = beginAuthAttempt({ component: 'navbar' });
    watchCodeSend(attempt.id);
    vi.advanceTimersByTime(1_000);
    setVisibility('hidden');
    vi.advanceTimersByTime(1_000);
    setVisibility('visible');
    vi.advanceTimersByTime(CODE_SEND_TIMEOUT_MS);
    reportSignInLoadFailed('call_timeout', { call: 'send_code' });
    expect(names()).toEqual([]);
  });

  it('reports a failed Privy chunk once the page is visible, but not from a page being left', () => {
    setVisibility('hidden');
    beginAuthAttempt({ component: 'navbar' });
    reportSignInLoadFailed('chunk_load');
    expect(names()).toEqual([]);
    setVisibility('visible');
    reportSignInLoadFailed('chunk_load');
    expect(mocks.reports).toEqual([
      expect.objectContaining({
        name: 'sign_in_load_failed',
        extra: expect.objectContaining({ reason: 'chunk_load' }),
      }),
    ]);
  });

  it('reports the next attempt begun after the page came back', () => {
    setVisibility('hidden');
    setVisibility('visible');
    vi.advanceTimersByTime(1);
    beginAuthAttempt({ component: 'navbar' });
    vi.advanceTimersByTime(PRIVY_READY_TIMEOUT_MS);
    expect(names()).toEqual(['sign_in_prompt_timeout', 'sign_in_privy_not_ready']);
  });
});
