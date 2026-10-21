'use client';

import type * as Auth from '@geogenesis/auth';

import * as React from 'react';

import {
  type IdentityTokenValue,
  type InstanceKind,
  type PrivyValue,
  type Slice,
  type WalletClientValue,
  type WalletsValue,
  getInstanceResult,
  getState,
  isRealAuthWanted,
  realPrivyReady,
  registerInstance,
  requestRealAuth,
  sessionDetected,
  subscribe,
  unregisterInstance,
  whenReady,
} from './auth-store';

/**
 * Every Privy/wagmi hook the app uses, behind one module. The app imports these instead of
 * `@geogenesis/auth`, so that Privy (and wagmi, and the WalletConnect/Coinbase connectors) stay out
 * of the main chunk until something needs them.
 *
 * Three states, per hook:
 *   - Privy is loaded and ready: the real hook's value, published by `privy-host.tsx`.
 *   - A session was detected (`privy-session.ts`) but Privy is still loading: the same "not ready"
 *     value Privy gave before it restored a session. Nothing for a signed-in reader to notice.
 *   - No session: a signed-out value with `ready: true`. Anything that acts (login, logout,
 *     getAccessToken...) loads Privy first and then does the real thing.
 *
 * `@geogenesis/auth` is only ever imported dynamically here, and as types.
 */

const signedOutPrivy = {
  ready: true,
  authenticated: false,
  user: null,
  isModalOpen: false,
} as const;

/** Run `call` against the real hook result for `id` once Privy is up. Never a dead click. */
function invokeInstance<R, T>(id: string, call: (result: R) => T): T | Promise<Awaited<T>> {
  const ready = () => (realPrivyReady() ? (getInstanceResult(id) as R | null) : null);
  const now = ready();
  // Already loaded: stay synchronous, so a click that opens a popup is still inside its gesture.
  if (now !== null) return call(now);
  requestRealAuth();
  return whenReady(ready).then(result => call(result)) as Promise<Awaited<T>>;
}

/** Same, for the actions on the singleton `usePrivy` value. */
function invokePrivy<T>(call: (privy: PrivyValue) => T): T | Promise<Awaited<T>> {
  const ready = () => (realPrivyReady() ? getState().privy : null);
  const now = ready();
  if (now !== null) return call(now);
  requestRealAuth();
  return whenReady(ready).then(privy => call(privy)) as Promise<Awaited<T>>;
}

function logFailure(error: unknown) {
  console.error('[auth] could not load sign-in', error);
}

/** Fire-and-forget actions must not become unhandled rejections when loading fails. */
function swallowing<T>(result: T | Promise<T>): T | Promise<T | undefined> {
  if (result instanceof Promise) return result.catch(error => void logFailure(error));
  return result;
}

const shimPrivy = (ready: boolean) =>
  ({
    ...signedOutPrivy,
    ready,
    login: (...args: unknown[]) =>
      swallowing(invokePrivy(privy => (privy.login as (...a: unknown[]) => unknown)(...args))),
    logout: () => swallowing(invokePrivy(privy => privy.logout())),
    getAccessToken: () => invokePrivy(privy => privy.getAccessToken()),
    exportWallet: (...args: unknown[]) =>
      invokePrivy(privy => (privy.exportWallet as (...a: unknown[]) => unknown)(...args)),
  }) as unknown as PrivyValue;

const SIGNED_OUT_PRIVY = shimPrivy(true);
const PENDING_PRIVY = shimPrivy(false);

const SIGNED_OUT_WALLETS = { wallets: [], ready: true } as unknown as WalletsValue;
const PENDING_WALLETS = { wallets: [], ready: false } as unknown as WalletsValue;

const SIGNED_OUT_IDENTITY_TOKEN = { identityToken: null } as unknown as IdentityTokenValue;
const PENDING_IDENTITY_TOKEN = SIGNED_OUT_IDENTITY_TOKEN;

const SIGNED_OUT_WALLET_CLIENT = { data: undefined, isLoading: false } as unknown as WalletClientValue;
const PENDING_WALLET_CLIENT = { data: undefined, isLoading: true } as unknown as WalletClientValue;

/**
 * The real value once Privy has finished starting (or, when a session is expected, as soon as it
 * publishes anything). Until then, while a sign-in is merely being loaded for someone with no
 * session, the signed-out value stays — a visitor who clicked "Log in" must not see the page flip to
 * "loading" under their cursor.
 */
function useAuthSlice<K extends Slice>(
  slice: K,
  signedOut: NonNullable<ReturnType<typeof getState>[K]>,
  pending: NonNullable<ReturnType<typeof getState>[K]>
): NonNullable<ReturnType<typeof getState>[K]> {
  const getSnapshot = () => {
    const state = getState();
    const real = state[slice];
    const detected = sessionDetected();
    if (real && (state.privy?.ready || detected)) return real;
    return detected ? pending : signedOut;
  };
  // The server renders what Privy rendered there before: not ready.
  return React.useSyncExternalStore(subscribe, getSnapshot, () => pending) as NonNullable<
    ReturnType<typeof getState>[K]
  >;
}

export function usePrivy(): PrivyValue {
  return useAuthSlice('privy', SIGNED_OUT_PRIVY, PENDING_PRIVY);
}

export function useWallets(): WalletsValue {
  return useAuthSlice('wallets', SIGNED_OUT_WALLETS, PENDING_WALLETS);
}

export function useIdentityToken(): IdentityTokenValue {
  return useAuthSlice('identityToken', SIGNED_OUT_IDENTITY_TOKEN, PENDING_IDENTITY_TOKEN);
}

export function useWalletClient(): WalletClientValue {
  return useAuthSlice('walletClient', SIGNED_OUT_WALLET_CLIENT, PENDING_WALLET_CLIENT);
}

/**
 * Registers one call of a hook that takes callbacks. The host runs the real hook once per
 * registration, with callbacks that read `params` at the time they fire, so each caller keeps
 * hearing only its own events, as with Privy's own per-hook callbacks.
 */
function useInstance(kind: InstanceKind, params: unknown) {
  const id = React.useId();
  const paramsRef = React.useRef(params);
  paramsRef.current = params;
  React.useEffect(() => {
    registerInstance(id, kind, paramsRef);
    return () => unregisterInstance(id);
  }, [id, kind]);
  const result = React.useSyncExternalStore(
    subscribe,
    () => getInstanceResult(id),
    () => null
  );
  return { id, result };
}

type LoginParams = Parameters<typeof Auth.usePrivyLogin>[0];

export function usePrivyLogin(params?: LoginParams): ReturnType<typeof Auth.usePrivyLogin> {
  const { id } = useInstance('login', params);
  const login = React.useCallback(
    (...args: unknown[]) =>
      swallowing(invokeInstance<{ login: (...a: unknown[]) => unknown }, unknown>(id, result => result.login(...args))),
    [id]
  );
  return React.useMemo(() => ({ login }) as unknown as ReturnType<typeof Auth.usePrivyLogin>, [login]);
}

export function useGeoLogin(params: Parameters<typeof Auth.useGeoLogin>[0]): ReturnType<typeof Auth.useGeoLogin> {
  const { id } = useInstance('geoLogin', params);
  const login = React.useCallback(
    (...args: unknown[]) =>
      swallowing(invokeInstance<{ login: (...a: unknown[]) => unknown }, unknown>(id, result => result.login(...args))),
    [id]
  );
  return React.useMemo(() => ({ login }) as unknown as ReturnType<typeof Auth.useGeoLogin>, [login]);
}

export function useLogout(params?: Parameters<typeof Auth.useLogout>[0]): ReturnType<typeof Auth.useLogout> {
  const { id } = useInstance('logout', params);
  const logout = React.useCallback(
    () => swallowing(invokeInstance<{ logout: () => unknown }, unknown>(id, result => result.logout())),
    [id]
  );
  return React.useMemo(() => ({ logout }) as unknown as ReturnType<typeof Auth.useLogout>, [logout]);
}

const INITIAL_EMAIL_STATE = { status: 'initial' } as const;

export function useLoginWithEmail(
  params?: Parameters<typeof Auth.useLoginWithEmail>[0]
): ReturnType<typeof Auth.useLoginWithEmail> {
  const { id, result } = useInstance('emailLogin', params);
  const state = (result as { state?: unknown } | null)?.state ?? INITIAL_EMAIL_STATE;
  // These are headless calls a reader makes on purpose (they have typed an address), so they wait
  // for Privy and then run, and a failure to load rejects like any failed send would.
  const sendCode = React.useCallback(
    (...args: unknown[]) =>
      invokeInstance<{ sendCode: (...a: unknown[]) => unknown }, unknown>(id, r => r.sendCode(...args)),
    [id]
  );
  const loginWithCode = React.useCallback(
    (...args: unknown[]) =>
      invokeInstance<{ loginWithCode: (...a: unknown[]) => unknown }, unknown>(id, r => r.loginWithCode(...args)),
    [id]
  );
  return React.useMemo(
    () => ({ state, sendCode, loginWithCode }) as unknown as ReturnType<typeof Auth.useLoginWithEmail>,
    [state, sendCode, loginWithCode]
  );
}

/**
 * Headless OAuth. Privy's hook completes a redirect's return when it mounts in the host, which loads
 * on that return (`privy-session.ts`). `initOAuth` loads Privy first and rejects if it can't start;
 * `state` is Privy's flow state, `initial` until it loads.
 */
type OAuthLogin = ReturnType<typeof Auth.useLoginWithOAuth>;
const INITIAL_OAUTH_STATE: OAuthLogin['state'] = { status: 'initial' };
export function useLoginWithOAuth(): Pick<OAuthLogin, 'initOAuth' | 'state'> {
  const { id, result } = useInstance('oauthLogin', undefined);
  const state = (result as Partial<OAuthLogin> | null)?.state ?? INITIAL_OAUTH_STATE;
  const initOAuth = React.useCallback(
    (...args: Parameters<OAuthLogin['initOAuth']>) =>
      Promise.resolve(invokeInstance<OAuthLogin, Promise<void>>(id, r => r.initOAuth(...args))).then(() => undefined),
    [id]
  );
  return React.useMemo(() => ({ initOAuth, state }), [initOAuth, state]);
}

/** Wagmi's connect/disconnect events. Nothing connects until Privy is loaded, so nothing to do before. */
export function useAccountEffect(params: Parameters<typeof Auth.useAccountEffect>[0]) {
  useInstance('accountEffect', params);
}

/**
 * `getIdentityToken` for code outside React. With no session there is nothing to ask Privy for, so a
 * signed-out reader does not load it. With one, wait (bounded) for Privy to finish restoring: asked
 * before that, it answers null, and a null is cached as a failure.
 */
const IDENTITY_TOKEN_WAIT_MS = 5_000;
export async function getIdentityToken(): Promise<string | null> {
  if (!isRealAuthWanted()) return null;
  if (!realPrivyReady()) {
    try {
      await whenReady(() => (realPrivyReady() ? true : null), IDENTITY_TOKEN_WAIT_MS);
    } catch {
      return null;
    }
  }
  const auth = await import('@geogenesis/auth');
  return auth.getIdentityToken();
}

/** Only reachable with an embedded wallet, so Privy is already loaded. */
export async function toViemAccount(...args: Parameters<typeof Auth.toViemAccount>) {
  const auth = await import('@geogenesis/auth');
  return auth.toViemAccount(...args);
}

export function retryEmbeddedWalletSetup() {
  void import('@geogenesis/auth').then(auth => auth.retryEmbeddedWalletSetup());
}
