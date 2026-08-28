'use client';

import * as React from 'react';

import { hasActiveDebateFlow } from './activity-state';
import type { Debate, MatchmakingReadiness } from './api';
import { useDebateActivity } from './hooks';
import { useClaimDebateReadiness } from './use-claim-debate-readiness';

/**
 * Holding a position on a claim means standing ready to argue it.
 *
 * The Debate switch is gone from the cards, and this is what replaces it. Not a default that a
 * control can later contradict — a rule: respond to a claim and you are ready on it, always, with
 * nothing to press and nothing to notice.
 *
 * That inverts an older, more cautious hook on the rematch picker, which stood the viewer up only
 * on their *first* position and only once per mount, precisely so it could not silently undo a
 * stand-down someone had made elsewhere. The caution was right while a per-claim switch existed to
 * stand down *with*. With the switch gone there is no per-claim stand-down left to undo — the
 * remaining way out is the global availability toggle in the hub, which this never touches.
 *
 * Deliberately one-directional. Clearing a response does not stand the viewer down from here:
 * geo-chat will not hold readiness without an active response, and `useClaimDebateReadiness` already
 * drops a pending intent when it sees the withdrawal. Writing the reverse here would be a second
 * opinion about the same thing.
 *
 * Everything expensive belongs to the machine underneath. `setReady` records an intent in the query
 * cache and holds the request until geo-chat can see the indexed response, so this survives the card
 * unmounting, coalesces across every surface showing the claim, and never fires while the response
 * is still landing.
 */
export function useAutoDebateReadiness({
  entityId,
  spaceId,
  readiness,
  activeDebate,
  enabled = true,
}: {
  entityId: string;
  spaceId: string;
  readiness: MatchmakingReadiness;
  /** A debate already running on this claim; readiness cannot be joined on top of one. */
  activeDebate?: Debate | boolean | null;
  /** False where the claim cannot be resolved on the graph, so there is nothing to stand behind. */
  enabled?: boolean;
}) {
  const { data: activity } = useDebateActivity(enabled);

  // The same gate the switch used, so removing the switch did not quietly widen when someone can be
  // stood up: not while this claim is being debated, and not while the viewer is already in a debate
  // or a rematch somewhere else.
  const canEnable = enabled && !activeDebate && !hasActiveDebateFlow(activity);

  const { checked, disabled, setReady, viewerPosition } = useClaimDebateReadiness({
    readiness,
    entityId,
    spaceId,
    canEnable,
  });

  React.useEffect(() => {
    if (!enabled) return;
    // No position to stand behind, already standing, or something upstream says not now — which
    // covers being signed out, an unpublished claim, and a response still indexing.
    if (viewerPosition === null || checked || disabled) return;

    setReady(true);
  }, [checked, disabled, enabled, setReady, viewerPosition]);
}
