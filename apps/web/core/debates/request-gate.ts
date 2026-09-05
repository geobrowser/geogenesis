/**
 * Determines whether a debate request can be created for a claim.
 *
 * `create_rematch_request` resolves both participants' positions from the knowledge graph and
 * refuses with `claim_response_required` until the write is indexed. So the picker holds the
 * request until the position it will be validated against is the one the viewer holds — a wait of
 * `web.write.entity_response`, p50 9.9s / p95 48.6s, which no client change shortens.
 *
 * Compare the two sources rather than null-checking one: `localPosition` falls back to
 * `chatPosition`, so `chatPosition === localPosition` written against a single source goes trivially
 * true and opens a button the server still refuses — pressable, and nothing happens. Comparing also
 * covers switching sides, where the server still holds the side just moved off.
 *
 * The debates hub does not use this gate, deliberately. Its match data and `create_debate_request_as`
 * both read `debate_claim_readiness`, which the in-flight response notification writes, so a
 * graph-backed position check there would hold a button the server would have accepted.
 *
 * That was tried, in #2354, and reverted. Wiring this into `ClaimEndSlot` re-asked a question
 * `match` had already answered, using a field that can disagree with it — so a viewer with a live
 * match and no `viewer_response` got a rendered, permanently disabled "Request debate" with nothing
 * saying why. The warning above and the one in `claim-end-slot.tsx` both predate that attempt.
 */
export type DebateRequestGateInput = {
  /**
   * The position the request will be validated against, as the surface last heard it.
   *
   * Named for where the picker reads it — geo-chat's rematch rows — though geo-chat derives those
   * from the graph, so this trails the chain rather than the server's own record. `undefined` is "no
   * row", and a `null` can also be a hydration timeout on that endpoint rather than a deliberate
   * absence. All of which block the request, which is the point: none of them is the viewer's
   * position confirmed.
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
  // started. The picker's `opposing` already requires a position, so this is unreachable from the
  // one caller — it is guarded for any future caller whose opponent half does not.
  const pending = opponentReady && held && !positionSettled;

  return {
    canRequest: opponentReady && positionSettled,
    pending,
    pendingLabel: pending ? (indexingDelayed ? REQUEST_PENDING_DELAYED_LABEL : REQUEST_PENDING_LABEL) : null,
  };
}
