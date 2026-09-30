import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const start = new Date('2026-09-29T12:00:00.500Z');
const visitor = { anonymous_id: 'visitor-before', session_id: 'session-before' };
const completion = (overrides = {}) => ({
  user: { id: 'did:privy:new-account', createdAt: new Date('2026-09-29T12:03:00Z') },
  isNewUser: true,
  wasAlreadyAuthenticated: false,
  loginMethod: 'email',
  loginAccount: { type: 'email' },
  ...overrides,
});

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.setSystemTime(start);
  window.localStorage.clear();
  document.head.innerHTML = '';
  delete window.geoAnalytics;
  window.lytics = {
    capture: vi.fn(),
    getContext: vi.fn(() => visitor),
    signedUp: vi.fn(),
    sessionRestored: vi.fn(),
    loggedIn: vi.fn(),
  };
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  delete window.lytics;
});

describe('signup visitor attribution', () => {
  it.each(['email delay', 'OAuth return', 'new tab'])('preserves the initiating visitor through %s', async flow => {
    const auth = await import('../privy-auth-events');
    auth.beginPrivyAuth({ email: 'not-persisted@example.com', token: 'not-persisted' });
    const stored = window.localStorage.getItem('geo:signup-visitor:v1')!;
    expect(JSON.parse(stored)).toEqual({
      startedAt: start.getTime(),
      anonymousId: visitor.anonymous_id,
      sessionId: visitor.session_id,
    });
    vi.setSystemTime(new Date('2026-09-29T12:03:01Z'));
    window.lytics!.getContext = () => ({ anonymous_id: 'completion-visitor', session_id: 'completion-session' });
    // A new module instance has no initiating tab's memory (as after navigation / another tab).
    if (flow !== 'email delay') vi.resetModules();
    const returned = await import('../privy-auth-events');
    returned.completePrivyAuth(completion());
    expect(window.lytics!.signedUp).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        signup_anonymous_id: visitor.anonymous_id,
        signup_session_id: visitor.session_id,
        signup_started_at: start.toISOString(),
        signup_context_source: 'auth_start',
      })
    );
    expect(window.localStorage.getItem('geo:signup-visitor:v1')).toBeNull();
  });

  it('links a newly created account restored in a second tab without emitting a second signup', async () => {
    const auth = await import('../privy-auth-events');
    auth.beginPrivyAuth();
    vi.setSystemTime(new Date('2026-09-29T12:03:01Z'));
    vi.resetModules();
    const tab = await import('../privy-auth-events');
    tab.completePrivyAuth(completion({ isNewUser: false, wasAlreadyAuthenticated: true }));
    expect(window.lytics!.signedUp).not.toHaveBeenCalled();
    expect(window.lytics!.sessionRestored).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        signup_anonymous_id: visitor.anonymous_id,
        signup_session_id: visitor.session_id,
      })
    );
  });

  it('does not link an existing account restore to an abandoned attempt', async () => {
    const auth = await import('../privy-auth-events');
    auth.beginPrivyAuth();
    auth.completePrivyAuth(
      completion({
        user: { id: 'existing', createdAt: new Date('2025-01-01') },
        isNewUser: false,
        wasAlreadyAuthenticated: true,
      })
    );
    expect(window.lytics!.sessionRestored).toHaveBeenCalledWith(
      expect.anything(),
      expect.not.objectContaining({
        signup_anonymous_id: expect.anything(),
      })
    );
  });

  it.each([-60_000, 60_000])('links a new-account restore with a %i ms client clock offset', async offset => {
    const serverStart = start.getTime();
    vi.setSystemTime(serverStart + offset);
    const auth = await import('../privy-auth-events');
    auth.beginPrivyAuth();
    vi.setSystemTime(serverStart + 10_000 + offset);
    auth.completePrivyAuth(
      completion({
        user: { id: 'skewed-restore', createdAt: new Date(serverStart + 10_000) },
        isNewUser: false,
        wasAlreadyAuthenticated: true,
      })
    );
    expect(window.lytics!.sessionRestored).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        signup_anonymous_id: visitor.anonymous_id,
        signup_session_id: visitor.session_id,
      })
    );
    expect(window.lytics!.signedUp).not.toHaveBeenCalled();
  });

  it.each([
    ['lower boundary', -60_500, true],
    ['before lower boundary', -60_501, false],
    ['upper boundary', 60_000, true],
    ['after upper boundary', 60_001, false],
  ] as const)('enforces the bounded restore window at the %s', async (_, offset, accepted) => {
    const { beginSignupVisitor, signupVisitorProperties } = await import('./signup-visitor');
    beginSignupVisitor();
    const properties = signupVisitorProperties(new Date(start.getTime() + offset));
    expect(Boolean(properties.signup_context_source)).toBe(accepted);
  });

  it.each([30_000, 60_001])('bounds a client clock rollback of %i ms', async rollback => {
    const { beginSignupVisitor, signupVisitorProperties } = await import('./signup-visitor');
    beginSignupVisitor();
    vi.setSystemTime(start.getTime() - rollback);
    expect(Boolean(signupVisitorProperties().signup_context_source)).toBe(rollback <= 60_000);
  });

  it('does not extend the 24-hour attempt expiry to compensate for server clock skew', async () => {
    const { beginSignupVisitor, signupVisitorProperties } = await import('./signup-visitor');
    beginSignupVisitor();
    vi.setSystemTime(start.getTime() + 24 * 60 * 60 * 1000 + 1);
    expect(signupVisitorProperties(new Date(Date.now() - 30_000))).toEqual({});
  });

  it.each(['cancel', 'logout', 'expired', 'corrupt'])(
    'rejects %s context and uses completion context',
    async reason => {
      const auth = await import('../privy-auth-events');
      auth.beginPrivyAuth();
      if (reason === 'cancel') auth.cancelPrivyAuth();
      if (reason === 'logout') auth.resetPrivyAuthSession();
      if (reason === 'expired') vi.setSystemTime(new Date(start.getTime() + 25 * 60 * 60 * 1000));
      if (reason === 'corrupt') {
        window.localStorage.setItem('geo:signup-visitor:v1', '{broken');
        vi.resetModules();
      }
      window.lytics!.getContext = () => ({ anonymous_id: 'fresh', session_id: 'fresh-session' });
      const returned = await import('../privy-auth-events');
      returned.completePrivyAuth(completion());
      expect(window.lytics!.signedUp).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          signup_anonymous_id: 'fresh',
          signup_session_id: 'fresh-session',
          signup_context_source: 'completion',
        })
      );
    }
  );

  it('does not resurrect a snapshot consumed by another tab', async () => {
    const auth = await import('../privy-auth-events');
    auth.beginPrivyAuth();
    window.localStorage.removeItem('geo:signup-visitor:v1');
    auth.completePrivyAuth(completion());
    expect(window.lytics!.signedUp).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        signup_context_source: 'completion',
      })
    );
  });

  it('resumes email verification after reload without replacing the starting session', async () => {
    const auth = await import('../privy-auth-events');
    auth.beginPrivyAuth();
    vi.resetModules();
    window.lytics!.getContext = () => ({ anonymous_id: 'new', session_id: 'new' });
    const resumed = await import('../privy-auth-events');
    resumed.beginPrivyAuth({}, { resume: true });
    resumed.completePrivyAuth(completion());
    expect(window.lytics!.signedUp).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        signup_session_id: visitor.session_id,
      })
    );
  });

  it('uses a memory fallback when storage is blocked', async () => {
    const auth = await import('../privy-auth-events');
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    auth.beginPrivyAuth();
    auth.completePrivyAuth(completion());
    expect(window.lytics!.signedUp).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        signup_context_source: 'auth_start',
      })
    );
  });

  it('keeps the initiating session when writes fail but reads still work', async () => {
    const auth = await import('../privy-auth-events');
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError');
    });
    auth.beginPrivyAuth();
    window.lytics!.getContext = () => ({ anonymous_id: 'later-visitor', session_id: 'later-session' });
    auth.completePrivyAuth(completion());
    expect(window.lytics!.signedUp).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        signup_anonymous_id: visitor.anonymous_id,
        signup_session_id: visitor.session_id,
        signup_context_source: 'auth_start',
      })
    );
  });

  it('resolves context before identification when the runtime loads after completion', async () => {
    const runtime = window.lytics!;
    delete window.lytics;
    const auth = await import('../privy-auth-events');
    auth.beginPrivyAuth();
    auth.completePrivyAuth(completion());
    window.lytics = runtime;
    document.querySelector<HTMLScriptElement>('script[data-geo-analytics-loader]')!.dispatchEvent(new Event('load'));
    expect(runtime.signedUp).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        signup_anonymous_id: visitor.anonymous_id,
        signup_session_id: visitor.session_id,
        signup_context_source: 'completion',
      })
    );
  });

  it('does not persist identifiers when analytics is disabled', async () => {
    vi.stubEnv('NEXT_PUBLIC_DISABLE_POSTHOG', '1');
    const auth = await import('../privy-auth-events');
    auth.beginPrivyAuth();
    auth.completePrivyAuth(completion());
    expect(window.localStorage.length).toBe(0);
    expect(window.lytics!.signedUp).not.toHaveBeenCalled();
  });
});
