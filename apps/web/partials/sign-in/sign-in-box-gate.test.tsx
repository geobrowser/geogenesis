import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  expected: false,
  failImport: false,
  imported: 0,
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
async function setup() {
  vi.resetModules();
  // Fresh per test: the gate's download, and whether it fails.
  vi.doMock('./sign-in-box', () => {
    mocks.imported += 1;
    if (mocks.failImport) throw new Error('ChunkLoadError');
    return { SignInBoxHost: () => <p>the box</p> };
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
  mocks.imported = 0;
  mocks.idle = undefined;
  mocks.login.mockReset();
});
afterEach(() => cleanup());

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
});
