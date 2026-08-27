import { describe, expect, it, vi } from 'vitest';

import { createStore } from 'jotai';

import { statusBarDispatchAtom, statusBarStateAtom } from './status-bar-store';

/**
 * Regression guard for a jotai footgun that turned one failed write into a submission
 * storm. `set(primitiveAtom, fn)` treats `fn` as a state UPDATER and calls it, so
 * storing the retry callback directly invoked it at dispatch time and left its return
 * value (a Promise, for async writes) in the atom. Any deterministically-failing write
 * then looped: fail -> dispatch ERROR -> auto-retry -> fail. A single subspace attempt
 * produced ~125 on-chain submissions this way, and the StatusBar rendered
 * onClick={Promise} on every pass.
 */
describe('status bar retry handling', () => {
  it('stores the retry callback without invoking it', () => {
    const store = createStore();
    const retry = vi.fn();

    store.set(statusBarDispatchAtom, { type: 'ERROR', payload: 'Write failed', retry });

    expect(retry).not.toHaveBeenCalled();
    expect(store.get(statusBarStateAtom).retry).toBe(retry);
    expect(store.get(statusBarStateAtom).error).toBe('Write failed');
  });

  it('does not re-enter when the retry itself dispatches another error', () => {
    const store = createStore();

    // Mirrors the real shape: the retry re-runs a write that fails again and reports it.
    const retry = vi.fn(() => {
      store.set(statusBarDispatchAtom, { type: 'ERROR', payload: 'Write failed again', retry });
    });

    store.set(statusBarDispatchAtom, { type: 'ERROR', payload: 'Write failed', retry });
    expect(retry).not.toHaveBeenCalled();

    // Invoking it explicitly (what the StatusBar button does) must run exactly once.
    store.get(statusBarStateAtom).retry?.();
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('clears the retry when the review state moves on', () => {
    const store = createStore();
    const retry = vi.fn();

    store.set(statusBarDispatchAtom, { type: 'ERROR', payload: 'Write failed', retry });
    store.set(statusBarDispatchAtom, { type: 'SET_REVIEW_STATE', payload: 'idle' });

    expect(store.get(statusBarStateAtom).retry).toBeUndefined();
    expect(store.get(statusBarStateAtom).error).toBeNull();
    expect(retry).not.toHaveBeenCalled();
  });

  it('handles an error dispatched without a retry', () => {
    const store = createStore();

    store.set(statusBarDispatchAtom, { type: 'ERROR', payload: 'No retry available' });

    expect(store.get(statusBarStateAtom).retry).toBeUndefined();
  });
});
