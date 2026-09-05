'use client';

import * as React from 'react';

import { type MatchmakingReadiness, notifyClaimResponseIndexed } from './api';
import { useGeoChatAuth } from './hooks';

/** Keeps a session from re-sending for the same claim, and from growing without bound. */
const MAX_TRACKED = 256;

/**
 * Tells geo-chat about a position the viewer already holds, so readiness catches up.
 *
 * After GEO-2740 readiness is written by `notify_claim_response_indexed`, and the notifier that
 * calls it only fires for a response this client just watched index — it reads
 * `indexingState.pending`, which exists only for an in-flight submission. So the change reaches
 * everyone who responds *from now on*, and nobody who already had. Those users hold a position,
 * would have shown up as debatable under the old toggle, and silently do not.
 *
 * This closes that without a backfill job. geo-chat cannot do it in SQL — it does not store
 * responses, it resolves them from the graph — and resolving every historical (user, claim) pair
 * server-side is a lot of work to do once. Here the pair is already resolved and on screen.
 *
 * Deliberately narrow. It fires only when geo-chat itself reports the gap:
 *
 *   - it has a row for the claim, and that row carries the viewer's response, so the position is
 *     geo-chat's own and the server's `validate_indexed_response_notification` will agree with it;
 *   - readiness is off;
 *   - and no `readiness_disabled_reason`. `claim_response_kind_changed` means the response moved
 *     underneath the stored position, which the reconcile sweep owns — standing someone up from a
 *     stale side would publish a claim they may not hold.
 *
 * Once per claim per session, and it stops firing as soon as the write lands, because the next
 * read reports `viewer_debate_ready`. The endpoint is rate limited per user/space/claim besides.
 *
 * No user intent is overridden: `user_disabled` rows were flipped by migration 0038, and with the
 * toggle gone there is no way to be deliberately not-ready on a claim you hold a position on.
 *
 * Wire it wherever a claim's pills are drawn, not only on the claim page. Readiness is what puts a
 * viewer in geo-chat's presence view, so a surface that draws a held position without repairing it
 * leaves that viewer invisible on the claim — to everyone else, and to themselves in the avatar
 * stack (GEO-2821).
 *
 * Remove this once the population has turned over. It is a migration wearing a hook's clothes.
 */
export function useBackfillReadinessForHeldPosition({
  readiness,
  entityId,
  spaceId,
}: {
  /**
   * geo-chat's own answer for this claim, or null where it has none.
   *
   * `MatchmakingReadiness` rather than a `DebateClaim` because the hub's rows carry the same four
   * fields under a different envelope, and both are geo-chat's. What must not be passed is a
   * readiness whose `viewer_response` fell back to the graph — see `useClaimResponseState`. The
   * gap this closes is geo-chat holding the response and not the readiness; a claim it has no row
   * for at all is a different repair, and not one to run per card in a feed.
   */
  readiness: MatchmakingReadiness | null;
  entityId: string;
  spaceId: string;
}) {
  const { ready, authenticated, accountKey, getPrivyIdentityToken } = useGeoChatAuth();
  const sent = React.useRef(new Set<string>());
  const sentOrder = React.useRef<string[]>([]);

  const viewerResponse = readiness?.viewer_response ?? null;
  const responseKind = readiness?.response_kind ?? null;
  const alreadyReady = readiness?.viewer_debate_ready ?? false;
  const disabledReason = readiness?.readiness_disabled_reason ?? null;

  React.useEffect(() => {
    if (!ready || !authenticated || !accountKey) return;
    if (!viewerResponse || !responseKind) return;
    if (alreadyReady || disabledReason) return;

    const key = `${accountKey}:${spaceId}:${entityId}`;
    if (sent.current.has(key)) return;
    sent.current.add(key);
    sentOrder.current.push(key);
    if (sentOrder.current.length > MAX_TRACKED) {
      const evicted = sentOrder.current.shift();
      if (evicted) sent.current.delete(evicted);
    }

    const controller = new AbortController();
    // Nothing on screen depends on the outcome: the row already renders the position, and readiness
    // is not drawn any more. A failure means the next visit tries again, which is the right amount
    // of effort for a backfill.
    void notifyClaimResponseIndexed(
      spaceId,
      entityId,
      responseKind,
      viewerResponse.position,
      getPrivyIdentityToken,
      accountKey,
      controller.signal
    ).catch(() => {});

    return () => controller.abort();
  }, [
    accountKey,
    alreadyReady,
    authenticated,
    disabledReason,
    entityId,
    getPrivyIdentityToken,
    ready,
    responseKind,
    spaceId,
    viewerResponse,
  ]);
}
