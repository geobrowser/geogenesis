import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const analyticsScriptSrc = 'https://geo-any-public.s3.us-east-1.amazonaws.com/ga-3874c92ff7f1.js';

describe('analytics', () => {
  beforeEach(() => {
    vi.resetModules();
    document.head.innerHTML = '';
    document.body.innerHTML = '';
    window.localStorage.clear();
    delete (window as any).GeoAnalyticsConfig;
    delete (window as any).lytics;
    delete (window as any).lyticsConfig;
    delete (window as any).geoAnalytics;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('loads the current Genesis analytics runtime with collector-safe defaults', async () => {
    const { initAnalytics } = await import('./analytics');

    initAnalytics();

    expect(window.lyticsConfig).toMatchObject({
      app: 'genesis',
      collectorUrl: false,
      collectorMode: 'shadow',
      autoPageViews: false,
      autoRouteTracking: false,
    });

    const script = document.querySelector<HTMLScriptElement>('script[data-geo-analytics-loader="true"]');

    expect(script?.src).toBe(analyticsScriptSrc);
  });

  it('enables production collection for Genesis app routes on www.geobrowser.io', async () => {
    const { analyticsEnvironment, isProductionGenesisHost, shouldUseAnalyticsCollector } = await import('./analytics');

    expect(shouldUseAnalyticsCollector('www.geobrowser.io')).toBe(true);
    expect(isProductionGenesisHost('www.geobrowser.io')).toBe(true);
    expect(analyticsEnvironment('www.geobrowser.io')).toBe('production');
  });

  it('tracks new Privy users as signups without raw Privy account data', async () => {
    const signedUp = vi.fn();
    window.lytics = {
      capture: vi.fn(),
      signedUp,
    };

    const { trackPrivyAuth } = await import('./analytics');

    trackPrivyAuth({
      user: {
        id: 'did:privy:user-1',
        email: { address: 'person@example.com' },
        wallet: {
          address: '0x123',
          walletClientType: 'privy',
          chainType: 'ethereum',
          connectorType: 'embedded',
          imported: false,
          delegated: true,
        },
        linkedAccounts: [{ type: 'email', address: 'person@example.com' }],
        mfaMethods: [],
        hasAcceptedTerms: true,
        isGuest: false,
      },
      isNewUser: true,
      wasAlreadyAuthenticated: false,
      loginMethod: 'email',
      loginAccount: {
        type: 'email',
      },
    });

    expect(signedUp).toHaveBeenCalledTimes(1);

    const [identity, properties] = signedUp.mock.calls[0];

    expect(identity).toMatchObject({
      user_id: 'did:privy:user-1',
      privy_user_id: 'did:privy:user-1',
      auth_provider: 'privy',
      has_privy_email: true,
      has_privy_wallet: true,
      privy_wallet_client_type: 'privy',
      privy_wallet_chain_type: 'ethereum',
      privy_wallet_connector_type: 'embedded',
    });
    expect(identity).not.toHaveProperty('email');
    expect(identity).not.toHaveProperty('wallet');

    expect(properties).toMatchObject({
      source: 'privy',
      auth_provider: 'privy',
      is_new_user: true,
      was_already_authenticated: false,
      login_method: 'email',
      login_account_type: 'email',
    });
    expect(properties).not.toHaveProperty('email');
    expect(properties).not.toHaveProperty('wallet');
  });

  it('tracks existing Privy users as logins', async () => {
    const loggedIn = vi.fn();
    window.lytics = {
      capture: vi.fn(),
      loggedIn,
    };

    const { trackPrivyAuth } = await import('./analytics');

    trackPrivyAuth({
      user: {
        id: 'did:privy:user-2',
      },
      isNewUser: false,
      wasAlreadyAuthenticated: false,
      loginMethod: 'email',
      loginAccount: {
        type: 'email',
      },
    });

    expect(loggedIn).toHaveBeenCalledTimes(1);
    expect(loggedIn.mock.calls[0][0]).toMatchObject({
      user_id: 'did:privy:user-2',
      privy_user_id: 'did:privy:user-2',
    });
    expect(loggedIn.mock.calls[0][1]).toMatchObject({
      is_new_user: false,
      was_already_authenticated: false,
      login_method: 'email',
    });
  });

  it('tracks already-authenticated Privy completions as restored sessions', async () => {
    const sessionRestored = vi.fn();
    window.lytics = {
      capture: vi.fn(),
      sessionRestored,
    };

    const { trackPrivyAuth } = await import('./analytics');

    trackPrivyAuth({
      user: {
        id: 'did:privy:user-3',
      },
      isNewUser: false,
      wasAlreadyAuthenticated: true,
      loginMethod: null,
      loginAccount: null,
    });

    expect(sessionRestored).toHaveBeenCalledTimes(1);
    expect(sessionRestored.mock.calls[0][0]).toMatchObject({
      user_id: 'did:privy:user-3',
      privy_user_id: 'did:privy:user-3',
    });
    expect(sessionRestored.mock.calls[0][1]).toMatchObject({
      was_already_authenticated: true,
    });
  });
});
