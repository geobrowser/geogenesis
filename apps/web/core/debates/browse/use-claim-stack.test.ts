import { act, cleanup, renderHook } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CLAIM_CARD_MS, CLAIM_CARD_TICK_MS, useClaimStack } from './use-claim-stack';

type Claim = { id: string; text: string };
const claim = (id: string, text = id): Claim => ({ id, text });

function renderStack(initial: { latest: Claim | null; running?: boolean; max?: number; resetKey?: string }) {
  return renderHook(
    ({ latest, running = true, max = 3, resetKey = 'debate-1' }) =>
      useClaimStack({ latest, idOf: (entry: Claim) => entry.id, running, max, resetKey }),
    { initialProps: initial }
  );
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('useClaimStack', () => {
  it('keeps earlier claims when a new one surfaces, newest first, up to the limit', () => {
    const { result, rerender } = renderStack({ latest: claim('a'), max: 2 });
    rerender({ latest: claim('b'), max: 2 });
    expect(result.current.entries.map(entry => entry.id)).toEqual(['b', 'a']);
    rerender({ latest: claim('c'), max: 2 });
    expect(result.current.entries.map(entry => entry.id)).toEqual(['c', 'b']);
  });

  it('keeps a card until its time runs out while the debate plays', () => {
    const { result } = renderStack({ latest: claim('a') });
    act(() => vi.advanceTimersByTime(CLAIM_CARD_MS - 5 * CLAIM_CARD_TICK_MS));
    expect(result.current.entries).toHaveLength(1);
    expect(result.current.entries[0].remainingMs).toBeGreaterThan(0);
    act(() => vi.advanceTimersByTime(10 * CLAIM_CARD_TICK_MS));
    expect(result.current.entries).toHaveLength(0);
  });

  it('stops the clock while the debate is paused', () => {
    const { result } = renderStack({ latest: claim('a'), running: false });
    act(() => vi.advanceTimersByTime(CLAIM_CARD_MS * 3));
    expect(result.current.entries[0].remainingMs).toBe(CLAIM_CARD_MS);
  });

  it('stops the clock while the viewer holds the stack, and resumes after', () => {
    const { result } = renderStack({ latest: claim('a') });
    act(() => result.current.setHeld(true));
    act(() => vi.advanceTimersByTime(CLAIM_CARD_MS * 3));
    expect(result.current.entries).toHaveLength(1);
    act(() => result.current.setHeld(false));
    act(() => vi.advanceTimersByTime(CLAIM_CARD_MS + CLAIM_CARD_TICK_MS));
    expect(result.current.entries).toHaveLength(0);
  });

  it('drops a card the viewer dismisses, and does not bring it back', () => {
    const { result, rerender } = renderStack({ latest: claim('a') });
    act(() => result.current.dismiss('a'));
    expect(result.current.entries).toHaveLength(0);
    rerender({ latest: claim('a', 'fresher lookups') });
    expect(result.current.entries).toHaveLength(0);
  });

  it('takes fresher data for a claim already up without restarting its clock', () => {
    const { result, rerender } = renderStack({ latest: claim('a') });
    act(() => vi.advanceTimersByTime(5 * CLAIM_CARD_TICK_MS));
    const before = result.current.entries[0].remainingMs;
    rerender({ latest: claim('a', 'with its entity') });
    expect(result.current.entries[0].claim.text).toBe('with its entity');
    expect(result.current.entries[0].remainingMs).toBe(before);
  });

  it('starts over for a different debate', () => {
    const { result, rerender } = renderStack({ latest: claim('a') });
    rerender({ latest: null, resetKey: 'debate-2' });
    expect(result.current.entries).toHaveLength(0);
  });
});
