'use client';

import * as React from 'react';

import type { ClaimResponseSummary } from '~/core/claims/browse/claim-response-summary';
import { CLAIM_RESPONSE_KIND } from '~/core/responses/entity-response';

import { type MatchmakingReadiness, notifyClaimResponseIndexed } from './api';
import { useGeoChatAuth } from './hooks';

/**
 * The viewer's side as the indexed read has it, or null where that read cannot be trusted yet.
 *
 * Null while the read is out, and while the viewer's own response is still confirming. The second
 * is the one that matters: the in-flight write has already told geo-chat (GEO-2784), so a withdrawal
 * marks the row withdrawn before the indexed read has seen it — and reporting that read then would
 * stand the viewer back up on the side they just left.
 */
export function trustedIndexedPosition(
  summary: Pick<ClaimResponseSummary, 'indexedViewerDirection' | 'isViewerResponseLoading'>,
  isResponsePending: boolean
): boolean | null {
  if (isResponsePending || summary.isViewerResponseLoading || summary.indexedViewerDirection === null) return null;
  return summary.indexedViewerDirection === 'positive';
}

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
 * One exception to the last: `claim_response_withdrawn` where the chain holds a side again. The row
 * records a retraction the viewer has since taken back, so it is the row that is stale, not the side
 * — and geo-chat's `viewer_response` follows the row, so it cannot say so itself. The indexed read
 * can. Without this a viewer who withdrew and re-answered, and whose re-answer's notification never
 * landed, holds a position every surface draws and cannot send a request on it (`intent_missing`).
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
  indexedPosition = null,
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
  /**
   * The viewer's side as the chain's indexed read reports it, or null where it holds none or the
   * read is still out. Consulted only for a withdrawn row — see above — so a host that cannot
   * supply it loses that repair and nothing else.
   */
  indexedPosition?: boolean | null;
}) {
  const { ready, authenticated, accountKey, getPrivyIdentityToken } = useGeoChatAuth();
  const sent = React.useRef(new Set<string>());
  const sentOrder = React.useRef<string[]>([]);

  const viewerResponse = readiness?.viewer_response ?? null;
  // `readiness.response_kind` is deliberately not read. It can still say "veracity" for a claim
  // minted before the vocabularies merged, and this forwards the kind back to geo-chat — so the
  // backfill would record the retired kind against a response published as a stance. The field was
  // also doing duty as a "readiness has arrived" guard, which is said directly below instead: the
  // type makes it non-null, so it was only ever null when the readiness itself was.
  const hasReadiness = readiness != null;
  const alreadyReady = readiness?.viewer_debate_ready ?? false;
  const disabledReason = readiness?.readiness_disabled_reason ?? null;
  const retaken = disabledReason === 'claim_response_withdrawn' && indexedPosition != null;
  // The side to report: the chain's where it overrides a withdrawal, geo-chat's own otherwise.
  const position = retaken ? indexedPosition : disabledReason ? null : (viewerResponse?.position ?? null);

  React.useEffect(() => {
    if (!ready || !authenticated || !accountKey) return;
    if (position === null || !hasReadiness || alreadyReady) return;

    // Its own key, so an earlier backfill of this claim in the session cannot suppress this one.
    const key = `${accountKey}:${spaceId}:${entityId}${retaken ? `:retaken:${position}` : ''}`;
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
      CLAIM_RESPONSE_KIND,
      position,
      getPrivyIdentityToken,
      accountKey,
      controller.signal
    ).catch(() => {});

    return () => controller.abort();
  }, [
    accountKey,
    alreadyReady,
    authenticated,
    entityId,
    getPrivyIdentityToken,
    hasReadiness,
    position,
    ready,
    retaken,
    spaceId,
  ]);
}
