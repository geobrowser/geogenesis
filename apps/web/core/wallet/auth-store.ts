import type * as Auth from '@geogenesis/auth';

import type { Account, Chain, Transport, WalletClient } from 'viem';

import { hasPersistedPrivySession } from './privy-session';

/**
 * The seam between the app and Privy/wagmi. Privy is not a provider the whole app sits under any
 * more: it mounts as a sibling (`privy-host.tsx`) once something needs it, and publishes what its
 * hooks return into this store. The app reads them through `auth-hooks.ts`.
 *
 * A sibling rather than a wrapper because a wrapper would remount the entire app the moment Privy
 * arrives, and arriving later is the point.
 *
 * Type-only imports from `@geogenesis/auth`: nothing here may pull Privy or wagmi into the main chunk.
 */
export type PrivyValue = ReturnType<typeof Auth.usePrivy>;
export type WalletsValue = ReturnType<typeof Auth.useWallets>;
export type IdentityTokenValue = ReturnType<typeof Auth.useIdentityToken>;
/**
 * What `useWalletClient()` gave this app: the wallet client of the connected (embedded) account.
 * Spelled out because `ReturnType` of wagmi's generic hook loses the registered config.
 */
export type WalletClientValue = {
  data: WalletClient<Transport, Chain, Account> | undefined;
  isLoading: boolean;
};

export type Slice = 'privy' | 'wallets' | 'identityToken' | 'walletClient';

/** One mounted call of a Privy hook that takes callbacks, each of which keeps its own. */
export type InstanceKind = 'login' | 'geoLogin' | 'logout' | 'emailLogin' | 'accountEffect';
export type InstanceEntry = { kind: InstanceKind; params: { current: unknown }; result: unknown };

type State = {
  /** Something asked for the real Privy: a sign-in, or the idle load. */
  requested: boolean;
  /** The Privy chunk failed to load; the next request tries again. */
  hostFailed: boolean;
  /** Bumped by a retry so the host loader runs again. */
  hostAttempt: number;
  privy: PrivyValue | null;
  wallets: WalletsValue | null;
  identityToken: IdentityTokenValue | null;
  walletClient: WalletClientValue | null;
  instanceIds: readonly string[];
};

const initialState: State = {
  requested: false,
  hostFailed: false,
  hostAttempt: 0,
  privy: null,
  wallets: null,
  identityToken: null,
  walletClient: null,
  instanceIds: [],
};

let state: State = initialState;
const listeners = new Set<() => void>();
const instances = new Map<string, InstanceEntry>();

function emit() {
  listeners.forEach(listener => listener());
}

function setState(patch: Partial<State>) {
  state = { ...state, ...patch };
  emit();
}

export function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getState() {
  return state;
}

/** Test seam. */
export function resetAuthStore() {
  state = initialState;
  instances.clear();
  detected = undefined;
  emit();
}

let detected: boolean | undefined;

/** Read once per page: it answers "was someone signed in when this page loaded". */
export function sessionDetected(): boolean {
  detected ??= hasPersistedPrivySession();
  return detected;
}

/** Whether the Privy host should be mounted. A client-side question; the server never mounts it. */
export function isRealAuthWanted(): boolean {
  return state.requested || sessionDetected();
}

export function requestRealAuth() {
  if (state.hostFailed) {
    setState({ requested: true, hostFailed: false, hostAttempt: state.hostAttempt + 1 });
    return;
  }
  if (!state.requested) setState({ requested: true });
}

export function markHostFailed() {
  setState({ hostFailed: true });
}

function shallowEqual(a: unknown, b: unknown) {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const keys = Object.keys(left);
  if (keys.length !== Object.keys(right).length) return false;
  return keys.every(key => Object.is(left[key], right[key]));
}

/** Called by the host after its hooks render. Quiet when nothing changed. */
export function publish<K extends Slice>(slice: K, value: State[K]) {
  if (shallowEqual(state[slice], value)) return;
  setState({ [slice]: value } as Partial<State>);
}

export function registerInstance(id: string, kind: InstanceKind, params: { current: unknown }) {
  instances.set(id, { kind, params, result: null });
  setState({ instanceIds: [...state.instanceIds, id] });
}

export function unregisterInstance(id: string) {
  if (!instances.delete(id)) return;
  setState({ instanceIds: state.instanceIds.filter(existing => existing !== id) });
}

export function getInstance(id: string) {
  return instances.get(id);
}

export function getInstanceResult(id: string) {
  return instances.get(id)?.result ?? null;
}

export function publishInstanceResult(id: string, result: unknown) {
  const entry = instances.get(id);
  if (!entry || shallowEqual(entry.result, result)) return;
  entry.result = result;
  emit();
}

const READY_TIMEOUT_MS = 20_000;

/** Resolves with `select()` once it is non-null; rejects after `timeoutMs`. */
export function whenReady<T>(select: () => T | null, timeoutMs = READY_TIMEOUT_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const check = () => {
      const value = select();
      if (value === null) return false;
      cleanup();
      resolve(value);
      return true;
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('Timed out waiting for sign-in to load'));
    }, timeoutMs);
    const unsubscribe = subscribe(check);
    function cleanup() {
      clearTimeout(timer);
      unsubscribe();
    }
    check();
  });
}

/** Privy has finished starting and its hooks have been published. */
export function realPrivyReady(): boolean {
  return state.privy?.ready === true;
}
