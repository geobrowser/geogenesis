import * as React from 'react';

/**
 * May this viewer request a debate on this claim, right now?
 *
 * One answer for both surfaces that ask it — the debates hub side panel and the "debate again"
 * picker. They used to decide separately and disagree: the hub never waited and never explained,
 * the picker waited on the wrong thing and explained that (GEO-2808).
 *
 * ## The wait is on geo-chat, so the gate is measured against geo-chat
 *
 * geo-chat validates a request against *its own* copy of the viewer's position and rejects an early
 * one with `claim_response_required`. That is the only thing the wait protects against, so it is
 * the only clock worth watching.
 *
 * The picker was watching the other one. Its `serverLocalPosition` came from `participantSidesOn`,
 * which reads the knowledge graph — so it waited on the indexer (`web.write.entity_response` p50
 * 9.9s, p95 48.6s) to clear a check geo-chat had already passed. Since #2348 geo-chat learns the
 * position the moment the write starts, so gating on geo-chat collapses the wait to about one round
 * trip while the graph catches up in its own time.
 *
 * Both surfaces already hold geo-chat's copy: the hub as `DebateClaim.viewer_response`, the picker
 * as the `participants` on the raw rematch row — which it fetched and then overwrote with
 * graph-derived sides before asking.
 *
 * ## Comparing two sources rather than one against itself
 *
 * `chatPosition` and `localPosition` must come from different places for this to mean anything. The
 * picker's old `serverLocalPosition === localPosition` did not: `localPosition` falls back to
 * `serverLocalPosition` whenever there is no optimistic answer, so the comparison went trivially
 * true and opened a button geo-chat would still reject — pressable, and nothing happens.
 *
 * Comparing rather than null-checking also covers switching sides, where geo-chat still holds the
 * side just moved off. That is equally invalid to act on, and a null check would miss it.
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
   * The surface's own opponent question, deliberately not shared.
   *
   * The hub asks whether *anyone* is standing ready on the other side (`match`); the picker asks
   * whether *this* opponent holds it (`opposing`). A rematch has one possible opponent and the hub
   * has many, so these are different questions with the same shape — the position half is shared,
   * the opponent half stays with whoever can answer it.
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


/**
 * How long geo-chat's agreement has to hold before the request is offered.
 *
 * geo-chat reports the position on its rematch rows slightly before it will accept a request
 * against it, so a gate that opens the instant the row agrees hands the viewer a button that fails
 * with `claim_response_required`. Tested in the browser: the control flipped from
 * "Publishing your position…" to "Request debate" and the request came straight back.
 *
 * This is a buffer, not a fix. At 10ms it is about one frame — enough to stop the press that lands
 * in the same tick the gate opens, and no defence at all against geo-chat being genuinely
 * inconsistent for longer. Deliberately so: 250ms was measurably worse to use, and this is the
 * cheapest thing that addresses the observed press without adding a wait anyone can feel.
 *
 * So the failure still has to be visible, and the real fix is on the backend: either the rows
 * should not report a position the request endpoint will not honour, or the endpoint should accept
 * one the rows report.
 */
export const REQUEST_GATE_GRACE_MS = 10;

/**
 * True once `open` has been continuously true for `ms`, and false the moment it is not.
 *
 * Deliberately not a debounce on the label: the wait it extends is the existing pending state, so
 * the viewer sees "Publishing your position…" for a quarter second longer rather than a new state
 * or a flicker through one.
 */
export function useRequestGateGrace(open: boolean, ms: number = REQUEST_GATE_GRACE_MS): boolean {
  const [held, setHeld] = React.useState(false);

  React.useEffect(() => {
    if (!open) {
      setHeld(false);
      return;
    }
    const timer = setTimeout(() => setHeld(true), ms);
    return () => clearTimeout(timer);
  }, [open, ms]);

  return held;
}
