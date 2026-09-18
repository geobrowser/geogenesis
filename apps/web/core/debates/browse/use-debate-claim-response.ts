'use client';

import { type ClaimResponseState, useClaimResponseState } from '~/core/claims/browse/use-claim-response-state';
import type { DebateClaim } from '~/core/debates/api';
import { useClaimPositionControl } from '~/core/debates/matchmaking/matchmaking-claim-card';
import { usePrivySignIn } from '~/core/hooks/use-privy-sign-in';
import type { Entity } from '~/core/types';

/**
 * A debate claim's response state and the control that publishes it, resolved together.
 *
 * `useClaimResponseState` already exists because five surfaces were each assembling the same
 * derivation from the same two inputs, and the copies drifted. The layer immediately above it then
 * grew the same way: every caller pairs it with `usePrivySignIn` and `useClaimPositionControl`, and
 * every one of them has to know that `answersReady` is `isResponseKindResolved &&
 * isViewerResponseResolved` — a conjunction whose whole purpose is to stop a click publishing the
 * wrong vote kind, spelled out by hand at each call site. That is the same bug with a longer fuse,
 * so it is written once here.
 *
 * `offersDebate: false` for every debate surface, and not a parameter. The claims panel, the card
 * over the video and the end-of-debate scorecard all sit inside a debate the viewer is already
 * watching, so offering them another one is the wrong invitation at the wrong moment — and without
 * an offer there is nothing for an account-level match's faces to be borrowed into.
 *
 * Deliberately not in `core/claims/browse` beside `useClaimResponseState`: `matchmaking-claim-card`
 * imports from that directory, so a hook there importing back would close a cycle. The two claim
 * surfaces outside debates (the claim page and the explore card) still wire this up themselves —
 * the claim page is handed its state rather than resolving it, so it cannot use this as written.
 */
export function useDebateClaimResponse({
  claimId,
  spaceId,
  row,
  entity,
}: {
  claimId: string;
  spaceId: string;
  /** geo-chat's row, where it has one. Null in the spaces it does not index, and before it answers. */
  row: DebateClaim | null;
  /** The claim on the graph, which carries the factual flag geo-chat's row would otherwise report. */
  entity: Entity | null;
}): ClaimResponseState & { control: ReturnType<typeof useClaimPositionControl> } {
  const promptSignIn = usePrivySignIn();
  const state = useClaimResponseState({ claimId, spaceId, row, entity });

  const control = useClaimPositionControl({
    claim: state.claim,
    positions: state.positions,
    readiness: state.readiness,
    answersReady: state.isResponseKindResolved && state.isViewerResponseResolved,
    responseBlockedReason: state.responseBlockedReason,
    onRequireSignIn: promptSignIn,
    offersDebate: false,
  });

  return { ...state, control };
}
