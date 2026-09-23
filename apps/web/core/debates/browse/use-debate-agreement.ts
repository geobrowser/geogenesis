'use client';

import * as React from 'react';

import { CLAIM_RESPONSE_FLOOR } from '~/core/claims/browse/claim-response-summary';
import { resolveClaimResponseKind } from '~/core/claims/browse/use-claim-response-state';
import type { DebateClaim, ParticipantSlot } from '~/core/debates/api';
import type { StackedCard } from '~/core/debates/claim-ticker';
import { type ClaimResponseTarget, claimResponseTargetKey } from '~/core/responses/claim-response-summaries';
import type { ResponseKind } from '~/core/responses/entity-response';
import { useClaimResponseSummaryBatch } from '~/core/responses/use-claim-response-summaries';
import type { Entity } from '~/core/types';

/**
 * How a debater's claims were received, across the whole debate.
 *
 * One number per debater rather than per claim. A claim card already reports its own split, and a
 * reader who watched the debate has seen several of them go past; what they cannot get from those
 * is whether this person, over four minutes, was generally believed.
 */
export type DebateAgreement = {
  positive: number;
  negative: number;
  total: number;
  /** Whole-percent share of positive responses. Null when nobody has responded at all. */
  percent: number | null;
  /**
   * Whether there are enough responses to characterise the split rather than merely report it.
   *
   * The same bar one claim is held to — {@link CLAIM_RESPONSE_FLOOR} — applied to the debater's
   * whole body of claims. It is a *lower* bar in effect, because this pools a dozen claims to
   * reach it, and that is the right direction: the question here is coarser than "is this claim
   * true", so it can be answered from coarser evidence.
   */
  meetsFloor: boolean;
  /**
   * The word for the positive side.
   *
   * A debate can mix stance claims (Agree/Disagree) with factual ones (Verify/Dispute), and one
   * percentage cannot wear both labels. Where every claim asks the same question the aggregate
   * borrows that question's own word, which is what the rest of the product says. Where they
   * differ it falls back to agreement, the broader of the two: verifying a claim is agreeing that
   * it is true, while agreeing with an opinion is not verifying anything.
   */
  positiveWord: string;
};

const POSITIVE_WORD: Record<ResponseKind, string> = {
  curation: 'upvoted',
  stance: 'agreed',
  veracity: 'verified',
};

/**
 * Every debater's aggregate, for the card that closes the video.
 *
 * Reads through the batch rather than a hook per claim. The per-claim path costs two round trips
 * each, and a debate runs to a dozen or more claims across the two of them; the batch primes the
 * same caches from one request, so the cards the viewer has already scrolled past cost nothing to
 * total up.
 *
 * Gated, and gated hard. This is only ever asked at the end of a debate the viewer actually
 * watched — a feed of twenty cards must not each fetch a debate's worth of response counts on the
 * chance that one of them is played to the finish.
 *
 * One space, because a debate's claims share one. Attribution rides the block, but the claim
 * entities themselves are published into the debate's own space, which both debaters write to.
 * Anything that somehow sits elsewhere is left out of the total rather than fetched separately:
 * a second batch per stray claim is a lot of machinery for a case the corpus does not contain.
 */
export function useDebateAgreement({
  spaceId,
  historyBySlot,
  rowsByClaimId,
  entitiesByClaimId,
  enabled,
}: {
  spaceId: string;
  historyBySlot: Map<number, StackedCard[]>;
  rowsByClaimId: Map<string, DebateClaim>;
  entitiesByClaimId: Map<string, Entity>;
  enabled: boolean;
}): Map<ParticipantSlot, DebateAgreement> {
  /** Claim id → the question it asks, resolved the way every other claim surface resolves it. */
  const kindByClaimId = React.useMemo(() => {
    const kinds = new Map<string, ResponseKind>();
    if (!enabled) return kinds;

    for (const cards of historyBySlot.values()) {
      for (const card of cards) {
        const { claim } = card.window;
        if (claim.spaceId !== spaceId) continue;
        kinds.set(
          claim.id,
          resolveClaimResponseKind(
            rowsByClaimId.get(claim.id) ?? null,
            entitiesByClaimId.get(claim.id) ?? null,
            spaceId
          )
        );
      }
    }
    return kinds;
  }, [enabled, entitiesByClaimId, historyBySlot, rowsByClaimId, spaceId]);

  const targets = React.useMemo<ClaimResponseTarget[]>(
    () => [...kindByClaimId].map(([entityId, responseKind]) => ({ entityId, responseKind })),
    [kindByClaimId]
  );

  const batch = useClaimResponseSummaryBatch({ spaceId, targets, enabled: enabled && targets.length > 0 });
  const summaries = batch.data;

  return React.useMemo(() => {
    const agreement = new Map<ParticipantSlot, DebateAgreement>();
    if (!summaries) return agreement;

    for (const [slot, cards] of historyBySlot) {
      let positive = 0;
      let negative = 0;
      const kinds = new Set<ResponseKind>();

      for (const card of cards) {
        const { claim } = card.window;
        const responseKind = kindByClaimId.get(claim.id);
        if (!responseKind) continue;

        kinds.add(responseKind);
        const summary = summaries.get(claimResponseTargetKey({ entityId: claim.id, responseKind }));
        positive += summary?.counts.positive ?? 0;
        negative += summary?.counts.negative ?? 0;
      }

      const total = positive + negative;
      const [onlyKind] = kinds;
      agreement.set(slot as ParticipantSlot, {
        positive,
        negative,
        total,
        // Rounded, like every other share the product prints. A percentage to a decimal place over
        // a population this size is precision the evidence does not carry.
        percent: total > 0 ? Math.round((positive / total) * 100) : null,
        meetsFloor: total >= CLAIM_RESPONSE_FLOOR,
        positiveWord: kinds.size === 1 && onlyKind ? POSITIVE_WORD[onlyKind] : POSITIVE_WORD.stance,
      });
    }

    return agreement;
  }, [historyBySlot, kindByClaimId, summaries]);
}
