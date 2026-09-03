import { describe, expect, it } from 'vitest';

import {
  REQUEST_PENDING_DELAYED_LABEL,
  REQUEST_PENDING_LABEL,
  debateRequestGate,
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
