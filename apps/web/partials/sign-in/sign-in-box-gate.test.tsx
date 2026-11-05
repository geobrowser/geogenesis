import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  expected: false,
  failImport: false,
  // Set to hold the download until the test resolves it.
  pendingImport: null as null | { promise: Promise<unknown>; resolve: () => void },
  imported: 0,
  privy: { ready: true, authenticated: false },
  idle: undefined as undefined | (() => void),
  login: vi.fn(),
}));

vi.mock('~/core/auth/sign-in-on-load', () => ({ signInExpectedOnLoad: () => mocks.expected }));
vi.mock('~/core/wallet/auth-root', () => ({
  scheduleIdleLoad: (onIdle: () => void) => {
    mocks.idle = onIdle;
    return () => {};
  },
}));
vi.mock('~/core/hooks/use-tracked-login', () => ({ useTrackedLogin: () => ({ login: mocks.login }) }));
vi.mock('~/core/wallet/auth-hooks', () => ({ usePrivy: () => mocks.privy }));

const box = { SignInBoxHost: () => <p>the box</p> };

function holdImport() {
  let resolve = () => {};
  const promise = new Promise<unknown>(done => {
    resolve = () => done(box);
  });
  mocks.pendingImport = { promise, resolve };
  return mocks.pendingImport;
}
async function setup() {
  vi.resetModules();
  // Fresh per test: the gate's download, and whether it fails.
  vi.doMock('./sign-in-box', () => {
    mocks.imported += 1;
    if (mocks.failImport) throw new Error('ChunkLoadError');
    return mocks.pendingImport ? mocks.pendingImport.promise : box;
  });
  const gate = await import('./sign-in-box-gate');
  const store = await import('~/core/auth/sign-in-box/sign-in-box-store');
  render(<gate.SignInBoxGate />);
  return store;
}

const flush = () => act(() => new Promise(resolve => setTimeout(resolve, 0)));

beforeEach(() => {
  mocks.expected = false;
  mocks.failImport = false;
  mocks.pendingImport = null;
  mocks.imported = 0;
  mocks.idle = undefined;
  mocks.privy = { ready: true, authenticated: false };
  mocks.login.mockReset();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const press = (store: Awaited<ReturnType<typeof setup>>, attemptId = 'a') =>
  act(() => store.openSignInBox({ attemptId, attribution: { component: 'navbar' }, prefillEmail: 'a@b.co' }));
const advance = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));

describe('SignInBoxGate', () => {
  it('waits for idle before downloading the box', async () => {
    await setup();
    await flush();
    expect(mocks.imported).toBe(0);
    act(() => mocks.idle?.());
    await flush();
    expect(mocks.imported).toBe(1);
    expect(screen.getByText('the box')).toBeInTheDocument();
  });

  it('downloads it at the first press', async () => {
    const store = await setup();
    act(() => store.openSignInBox({ attemptId: 'a', attribution: { component: 'navbar' } }));
    await flush();
    expect(mocks.imported).toBe(1);
    expect(screen.getByText('the box')).toBeInTheDocument();
  });

  it('downloads it at once on a page that opens sign-in by itself', async () => {
    mocks.expected = true;
    await setup();
    await flush();
    expect(mocks.imported).toBe(1);
  });

  it("opens Privy's dialog on the press's attempt when the box cannot load", async () => {
    mocks.failImport = true;
    const store = await setup();
    act(() => store.openSignInBox({ attemptId: 'a', attribution: { component: 'navbar' }, prefillEmail: 'a@b.co' }));
    await flush();
    expect(store.isSignInBoxOpen()).toBe(false);
    expect(mocks.login).toHaveBeenCalledExactlyOnceWith(undefined, undefined, {
      fallbackFor: 'a',
      prefillEmail: 'a@b.co',
    });
  });

  it('skips the idle download for a signed-in reader, and loads at a press', async () => {
    mocks.privy = { ready: true, authenticated: true };
    const store = await setup();
    await flush();
    expect(mocks.idle).toBeUndefined();
    await press(store);
    await flush();
    expect(mocks.imported).toBe(1);
    expect(screen.getByText('the box')).toBeInTheDocument();
  });

  it('waits for a restored session to resolve before scheduling the idle download', async () => {
    mocks.privy = { ready: false, authenticated: false };
    await setup();
    await flush();
    expect(mocks.idle).toBeUndefined();
  });

  describe('a slow download', () => {
    beforeEach(() => vi.useFakeTimers());

    it("opens Privy's dialog once when the box never loads", async () => {
      holdImport();
      const { SIGN_IN_BOX_LOAD_TIMEOUT_MS } = await import('./sign-in-box-gate');
      const store = await setup();
      await press(store);
      await advance(SIGN_IN_BOX_LOAD_TIMEOUT_MS - 1);
      expect(mocks.login).not.toHaveBeenCalled();
      expect(store.isSignInBoxOpen()).toBe(true);
      await advance(1);
      expect(store.isSignInBoxOpen()).toBe(false);
      await advance(SIGN_IN_BOX_LOAD_TIMEOUT_MS * 2);
      expect(mocks.login).toHaveBeenCalledExactlyOnceWith(undefined, undefined, {
        fallbackFor: 'a',
        prefillEmail: 'a@b.co',
      });
    });

    it('shows nothing when the box arrives after the fallback, and the box at the next press', async () => {
      const pending = holdImport();
      const { SIGN_IN_BOX_LOAD_TIMEOUT_MS } = await import('./sign-in-box-gate');
      const store = await setup();
      await press(store);
      await advance(SIGN_IN_BOX_LOAD_TIMEOUT_MS);
      expect(mocks.login).toHaveBeenCalledTimes(1);
      await act(async () => pending.resolve());
      await advance(0);
      expect(screen.queryByText('the box')).not.toBeInTheDocument();
      expect(mocks.login).toHaveBeenCalledTimes(1);

      await press(store, 'b');
      await advance(SIGN_IN_BOX_LOAD_TIMEOUT_MS * 2);
      expect(screen.getByText('the box')).toBeInTheDocument();
      expect(mocks.login).toHaveBeenCalledTimes(1);
    });

    it('shows the box with no fallback when it loads before the timeout', async () => {
      const pending = holdImport();
      const { SIGN_IN_BOX_LOAD_TIMEOUT_MS } = await import('./sign-in-box-gate');
      const store = await setup();
      await press(store);
      await advance(SIGN_IN_BOX_LOAD_TIMEOUT_MS - 1_000);
      await act(async () => pending.resolve());
      await advance(SIGN_IN_BOX_LOAD_TIMEOUT_MS * 2);
      expect(screen.getByText('the box')).toBeInTheDocument();
      expect(store.isSignInBoxOpen()).toBe(true);
      expect(mocks.login).not.toHaveBeenCalled();
    });

    it('sets no deadline on the idle download', async () => {
      holdImport();
      const { SIGN_IN_BOX_LOAD_TIMEOUT_MS } = await import('./sign-in-box-gate');
      await setup();
      act(() => mocks.idle?.());
      await advance(SIGN_IN_BOX_LOAD_TIMEOUT_MS * 2);
      expect(mocks.imported).toBe(1);
      expect(mocks.login).not.toHaveBeenCalled();
    });
  });
});
