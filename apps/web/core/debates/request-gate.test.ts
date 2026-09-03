import { act, renderHook } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  REQUEST_GATE_GRACE_MS,
  REQUEST_PENDING_DELAYED_LABEL,
  REQUEST_PENDING_LABEL,
  debateRequestGate,
  useRequestGateGrace,
} from './request-gate';

const gate = (over: Partial<Parameters<typeof debateRequestGate>[0]> = {}) =>
  debateRequestGate({ chatPosition: true, localPosition: true, opponentReady: true, ...over });

describe('debateRequestGate', () => {
  it('opens once geo-chat holds the side the viewer holds', () => {
    expect(gate()).toEqual({ canRequest: true, pending: false, pendingLabel: null });
  });

  // The defect this replaces: the picker compared the graph-derived position against itself, so the
  // check went trivially true and opened a button geo-chat would reject.
  it('waits while geo-chat has not answered for this claim', () => {
    expect(gate({ chatPosition: undefined })).toMatchObject({ canRequest: false, pending: true });
  });

  it('waits while geo-chat still holds no position', () => {
    expect(gate({ chatPosition: null })).toMatchObject({ canRequest: false, pending: true });
  });

  // Switching sides: geo-chat still holds the side just moved off, which is equally invalid to act
  // on and is why this compares rather than null-checks.
  it('waits while geo-chat holds the side the viewer just left', () => {
    expect(gate({ chatPosition: false, localPosition: true })).toMatchObject({ canRequest: false, pending: true });
  });

  // `null === null` would read as settled, so the null check has to come first.
  it('does not open on two agreeing absences', () => {
    expect(gate({ chatPosition: null, localPosition: null })).toMatchObject({ canRequest: false });
  });

  describe('the opponent half stays with the surface', () => {
    it('makes no offer when the surface says there is no opponent', () => {
      expect(gate({ opponentReady: false })).toEqual({ canRequest: false, pending: false, pendingLabel: null });
    });

    // Nothing is being waited *for* without an opponent, so a claim the viewer has merely not
    // answered must not sprout a spinner on every card in the list.
    it('does not name a wait when there is nothing to request', () => {
      expect(gate({ opponentReady: false, chatPosition: undefined })).toMatchObject({
        pending: false,
        pendingLabel: null,
      });
    });
  });

  // The viewer has not answered, so nothing is publishing. Naming a wait here would describe work
  // nobody started — which is what the hub did, whose opponent half does not require a position the
  // way the picker's `opposing` does.
  it('is not waiting when the viewer holds no position', () => {
    expect(gate({ chatPosition: null, localPosition: null })).toEqual({
      canRequest: false,
      pending: false,
      pendingLabel: null,
    });
    expect(gate({ chatPosition: undefined, localPosition: null })).toMatchObject({ pending: false });
  });

  describe('naming the wait', () => {
    it('says the position is publishing', () => {
      expect(gate({ chatPosition: undefined }).pendingLabel).toBe(REQUEST_PENDING_LABEL);
    });

    // Only reachable once the publish has landed, so pointing at the transaction would mislead.
    it('says it is still confirming once the indexer is late', () => {
      expect(gate({ chatPosition: undefined, indexingDelayed: true }).pendingLabel).toBe(
        REQUEST_PENDING_DELAYED_LABEL
      );
    });

    it('names nothing once the gate is open', () => {
      expect(gate({ indexingDelayed: true }).pendingLabel).toBeNull();
    });
  });
});


/**
 * geo-chat's rematch row reports the position slightly before its request endpoint will honour a
 * request against it, so the offer is held for a beat after the gate opens. Reported from the
 * browser: pressing the instant the control turned from "Publishing your position…" to
 * "Request debate" returned `claim_response_required`.
 *
 * Tested here rather than through the page, because the window is now about one frame — short
 * enough that a page test's own awaits would step over it and assert nothing.
 */
describe('useRequestGateGrace', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('withholds the offer until the gate has been open for the grace period', () => {
    const { result } = renderHook(() => useRequestGateGrace(true));

    expect(result.current).toBe(false);
    act(() => void vi.advanceTimersByTime(REQUEST_GATE_GRACE_MS - 1));
    expect(result.current).toBe(false);
    act(() => void vi.advanceTimersByTime(1));
    expect(result.current).toBe(true);
  });

  it('never opens while the gate is shut', () => {
    const { result } = renderHook(() => useRequestGateGrace(false));

    act(() => void vi.advanceTimersByTime(REQUEST_GATE_GRACE_MS * 10));
    expect(result.current).toBe(false);
  });

  // A gate that closes again — switching sides, say — must take the offer with it rather than
  // leaving a stale `true` behind for the next time it opens.
  it('shuts immediately and restarts the beat when the gate reopens', () => {
    const { result, rerender } = renderHook(({ open }) => useRequestGateGrace(open), {
      initialProps: { open: true },
    });

    act(() => void vi.advanceTimersByTime(REQUEST_GATE_GRACE_MS));
    expect(result.current).toBe(true);

    rerender({ open: false });
    expect(result.current).toBe(false);

    rerender({ open: true });
    expect(result.current).toBe(false);
    act(() => void vi.advanceTimersByTime(REQUEST_GATE_GRACE_MS));
    expect(result.current).toBe(true);
  });
});
