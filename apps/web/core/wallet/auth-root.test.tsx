import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import * as React from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useGeoLogin, useLoginWithOAuth, usePrivy } from './auth-hooks';
import { getIdentityToken } from './auth-hooks';
import { AuthRoot, IDLE_LOAD_DELAY_MS, scheduleIdleLoad } from './auth-root';
import { getState, resetAuthStore, restartAuthHost } from './auth-store';
import { PRIVY_REFRESH_TOKEN_KEY } from './privy-session';

const mocks = vi.hoisted(() => ({
  providerMounts: 0,
  privyLogin: vi.fn(),
  privyLogout: vi.fn(),
  geoLoginParams: [] as unknown[],
  initOAuth: vi.fn(async () => undefined),
  oauthHookMounts: 0,
  oauthState: { status: 'initial' } as { status: string; error?: Error },
}));

// The real Privy, wagmi and connectors are what these tests keep out of the page; stand-ins record
// whether they were mounted and what was called.
vi.mock('@geogenesis/auth', async () => {
  const React = await import('react');
  return {
    PrivyProvider: ({ children }: { children: React.ReactNode }) => {
      React.useEffect(() => {
        mocks.providerMounts += 1;
      }, []);
      return <>{children}</>;
    },
    WagmiProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    usePrivy: () => ({
      ready: true,
      authenticated: false,
      user: null,
      isModalOpen: false,
      login: mocks.privyLogin,
      logout: mocks.privyLogout,
      getAccessToken: async () => null,
    }),
    useWallets: () => ({ wallets: [], ready: true }),
    useIdentityToken: () => ({ identityToken: null }),
    useWalletClient: () => ({ data: undefined, isLoading: false }),
    useGeoLogin: (params: unknown) => {
      mocks.geoLoginParams.push(params);
      return { login: mocks.privyLogin };
    },
    usePrivyLogin: () => ({ login: mocks.privyLogin }),
    useLogout: () => ({ logout: mocks.privyLogout }),
    useLoginWithEmail: () => ({ state: { status: 'initial' }, sendCode: vi.fn(), loginWithCode: vi.fn() }),
    useLoginWithOAuth: () => {
      React.useEffect(() => {
        mocks.oauthHookMounts += 1;
      }, []);
      return { initOAuth: mocks.initOAuth, state: mocks.oauthState, loading: false };
    },
    useAccountEffect: vi.fn(),
    useEnsureEmbeddedWallet: vi.fn(),
    getIdentityToken: vi.fn(async () => 'token'),
  };
});
vi.mock('@geogenesis/auth/wallet', () => ({
  createGeoWalletConfig: () => ({}),
  createMockConfig: () => ({}),
}));
vi.mock('../environment', () => ({
  Environment: {
    variables: { isTestEnv: true, walletConnectProjectId: '' },
    getConfig: () => ({ rpc: '' }),
  },
}));
vi.mock('./geo-chain', () => ({ GEOGENESIS: {} }));

function Page() {
  const { ready, authenticated } = usePrivy();
  const { login } = useGeoLogin({});
  return (
    <>
      <span data-testid="state">{`${ready ? 'ready' : 'loading'}/${authenticated ? 'in' : 'out'}`}</span>
      <button onClick={() => login()}>Log in</button>
    </>
  );
}

function renderApp() {
  return render(
    <>
      <AuthRoot />
      <Page />
    </>
  );
}

beforeEach(() => {
  mocks.providerMounts = 0;
  mocks.privyLogin.mockReset();
  mocks.geoLoginParams.length = 0;
  mocks.initOAuth.mockClear();
  mocks.oauthHookMounts = 0;
  mocks.oauthState = { status: 'initial' };
  localStorage.clear();
  resetAuthStore();
});
afterEach(() => {
  cleanup();
  window.history.replaceState({}, '', '/');
  vi.useRealTimers();
  localStorage.clear();
  resetAuthStore();
  Reflect.deleteProperty(window, 'requestIdleCallback');
});

describe('signed-out visitor', () => {
  it('reads as signed out and ready without loading Privy', async () => {
    renderApp();

    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('ready/out'));
    expect(mocks.providerMounts).toBe(0);
  });

  it('loads Privy on a login click and then actually calls login: no dead click', async () => {
    renderApp();
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('ready/out'));
    expect(mocks.providerMounts).toBe(0);

    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));

    await waitFor(() => expect(mocks.privyLogin).toHaveBeenCalledTimes(1));
    expect(mocks.providerMounts).toBe(1);
    // The page stayed "ready" the whole time; nothing flipped to a loading state under the cursor.
    expect(screen.getByTestId('state')).toHaveTextContent('ready/out');
  });

  it('keeps each caller its own callbacks when Privy takes them', async () => {
    renderApp();
    const params = { onComplete: vi.fn() };
    function Other() {
      useGeoLogin(params);
      return null;
    }
    render(<Other />);

    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));
    await waitFor(() => expect(mocks.privyLogin).toHaveBeenCalled());

    // The host ran the real hook once per caller, each handed a callback that reads its own params.
    const handedToPrivy = mocks.geoLoginParams.at(-1) as { onComplete: (...args: unknown[]) => unknown };
    await handedToPrivy.onComplete({ user: {} });
    expect(params.onComplete).toHaveBeenCalledTimes(1);
  });

  it('does not ask Privy for an identity token it cannot have', async () => {
    await expect(getIdentityToken()).resolves.toBeNull();
    expect(mocks.providerMounts).toBe(0);
  });
});

describe('visitor with a Privy session', () => {
  it('mounts Privy straight away, with no login and no idle wait, and reads as loading until it is up', async () => {
    localStorage.setItem(PRIVY_REFRESH_TOKEN_KEY, JSON.stringify('refresh-token'));
    resetAuthStore();

    renderApp();

    await waitFor(() => expect(mocks.providerMounts).toBe(1));
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('ready/out'));
    expect(getState().requested).toBe(false);
  });
});

describe('restarting Privy (GEO-3449)', () => {
  it('mounts a fresh Privy in place, without remounting the app beside it', async () => {
    let pageMounts = 0;
    function CountedPage() {
      React.useEffect(() => {
        pageMounts += 1;
      }, []);
      return <Page />;
    }
    render(
      <>
        <AuthRoot />
        <CountedPage />
      </>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));
    await waitFor(() => expect(mocks.providerMounts).toBe(1));

    act(() => restartAuthHost());

    await waitFor(() => expect(mocks.providerMounts).toBe(2));
    expect(pageMounts).toBe(1);
    expect(getState().restarting).toBe(false);
  });
});

describe('idle load', () => {
  it('loads Privy once the page has been idle, so a session the check missed still comes back', async () => {
    vi.useFakeTimers();
    const requestIdleCallback = vi.fn((callback: () => void) => {
      callback();
      return 1;
    });
    Object.defineProperty(window, 'requestIdleCallback', { configurable: true, value: requestIdleCallback });
    renderApp();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(IDLE_LOAD_DELAY_MS - 1);
    });
    expect(mocks.providerMounts).toBe(0);
    expect(requestIdleCallback).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    await act(async () => {
      await vi.dynamicImportSettled();
    });

    expect(requestIdleCallback).toHaveBeenCalledWith(expect.any(Function), { timeout: 2_000 });
    expect(mocks.providerMounts).toBe(1);
  });

  it('falls back to a plain timer where requestIdleCallback does not exist', () => {
    vi.useFakeTimers();
    const onIdle = vi.fn();
    scheduleIdleLoad(onIdle, 1_000);

    vi.advanceTimersByTime(999);
    expect(onIdle).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onIdle).toHaveBeenCalledTimes(1);
  });

  it('can be cancelled', () => {
    vi.useFakeTimers();
    const onIdle = vi.fn();
    scheduleIdleLoad(onIdle, 1_000)();

    vi.advanceTimersByTime(5_000);
    expect(onIdle).not.toHaveBeenCalled();
  });
});

// GEO-3139. Google sign-in redirects away and back, so the return has to load Privy by itself.
describe('Google sign-in', () => {
  function OAuthPage() {
    const { initOAuth } = useLoginWithOAuth();
    return <button onClick={() => void initOAuth({ provider: 'google' })}>Continue with Google</button>;
  }

  it('passes per-call login options through to Privy', async () => {
    function OptionsPage() {
      const { login } = useGeoLogin({});
      return <button onClick={() => login({ loginMethods: ['email', 'google'] })}>Log in</button>;
    }
    render(
      <>
        <AuthRoot />
        <OptionsPage />
      </>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));

    await waitFor(() => expect(mocks.privyLogin).toHaveBeenCalledWith({ loginMethods: ['email', 'google'] }));
  });

  it('loads Privy before starting a headless OAuth sign-in', async () => {
    render(
      <>
        <AuthRoot />
        <OAuthPage />
      </>
    );
    expect(mocks.providerMounts).toBe(0);

    fireEvent.click(screen.getByRole('button', { name: 'Continue with Google' }));

    await waitFor(() => expect(mocks.initOAuth).toHaveBeenCalledWith({ provider: 'google' }));
    expect(mocks.providerMounts).toBe(1);
  });

  it('mounts Privy and its OAuth hook straight away on the return from Google, with no sign-in asked', async () => {
    window.history.replaceState({}, '', '/explore?privy_oauth_code=c&privy_oauth_state=s&privy_oauth_provider=google');
    resetAuthStore();

    render(
      <>
        <AuthRoot />
        <OAuthPage />
      </>
    );

    await waitFor(() => expect(mocks.oauthHookMounts).toBe(1));
    expect(mocks.providerMounts).toBe(1);
    expect(getState().requested).toBe(false);
  });

  it("passes Privy's OAuth flow state through, so a failed return can be seen", async () => {
    mocks.oauthState = { status: 'error', error: new Error('invalid code') };
    window.history.replaceState({}, '', '/explore?privy_oauth_code=c&privy_oauth_state=s&privy_oauth_provider=google');
    resetAuthStore();
    function StatePage() {
      return <span data-testid="oauth">{useLoginWithOAuth().state.status}</span>;
    }

    render(
      <>
        <AuthRoot />
        <StatePage />
      </>
    );

    expect(screen.getByTestId('oauth')).toHaveTextContent('initial');
    await waitFor(() => expect(screen.getByTestId('oauth')).toHaveTextContent('error'));
  });
});
