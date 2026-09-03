/**
 * Determines whether a debate request can be created for a claim.
 *
 * The rematch endpoint validates graph-resolved positions, so the picker compares the viewer's
 * local position with the position reported by geo-chat before enabling a request. Comparing the
 * values also prevents requests while a side change is still being reconciled.
 *
 * The debates hub does not use this gate. Its match data and request validation both use
 * `debate_claim_readiness`, so an additional graph-backed position check would delay valid requests.
 */
export type DebateRequestGateInput = {
  /**
   * geo-chat's own copy of the viewer's position on this claim.
   *
   * `undefined` when geo-chat has not answered for this claim yet, which is not the same as `null`
   * — "no position" is an answer, "no row" is not. Both block the request; only the distinction
   * keeps a missing row from reading as a deliberate absence.
   */
  chatPosition: boolean | null | undefined;
  /** The side the viewer believes they hold, optimistic where the surface has one. */
  localPosition: boolean | null;
  /**
   * Whether the relevant opponent condition for the current surface is satisfied.
   */
  opponentReady: boolean;
  /**
   * True once the indexer has been slow enough to be worth naming differently. Only reachable after
   * the publish has landed, so it changes the label rather than the gate.
   */
  indexingDelayed?: boolean;
};

export type DebateRequestGate = {
  canRequest: boolean;
  /** The request is the right offer to make, but geo-chat does not agree about the position yet. */
  pending: boolean;
  /** What to call the wait, or `null` when there is nothing to wait for. */
  pendingLabel: string | null;
};

/** The publish is still in flight, or geo-chat has not echoed it back. */
export const REQUEST_PENDING_LABEL = 'Publishing your position…';
/** The publish landed and the confirmation is late; pointing at the transaction would mislead. */
export const REQUEST_PENDING_DELAYED_LABEL = 'Still confirming your position…';

export function debateRequestGate({
  chatPosition,
  localPosition,
  opponentReady,
  indexingDelayed = false,
}: DebateRequestGateInput): DebateRequestGate {
  // `localPosition !== null` first: with no position at all there is nothing to agree about, and
  // `null === null` would otherwise read as settled and open the request.
  const held = localPosition !== null;
  const positionSettled = held && chatPosition === localPosition;
  // Waiting means something is actually in flight. A viewer who has not answered at all is not
  // waiting for anything, and saying "Publishing your position…" at them names work nobody
  // started — which is what this did on the hub, where the opponent half does not already
  // require a position the way the picker's `opposing` does.
  const pending = opponentReady && held && !positionSettled;

  return {
    canRequest: opponentReady && positionSettled,
    pending,
    pendingLabel: pending ? (indexingDelayed ? REQUEST_PENDING_DELAYED_LABEL : REQUEST_PENDING_LABEL) : null,
  };
}
