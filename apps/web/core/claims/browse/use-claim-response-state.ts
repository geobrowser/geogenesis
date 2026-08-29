'use client';

import * as React from 'react';

import type {
  DebateClaim,
  DebateClaimPositionSummary,
  DebateClaimSummary,
  MatchmakingReadiness,
} from '~/core/debates/api';
import type { Entity } from '~/core/types';

import { claimResponseKind } from '../response-kind';
import { positionSummariesFromCounts, viewerResponseFromDirection } from './claim-position-summaries';
import { type ClaimResponseSummary, useClaimResponseSummary } from './claim-response-summary';

export type ClaimResponseState = {
  /** Which vocabulary labels the sides: Agree/Disagree, or Verify/Dispute on a factual claim. */
  responseKind: 'stance' | 'veracity';
  /**
   * Whether `responseKind` is an answer or still the fallback.
   *
   * Callers gate their pills on this. `stance` is what we assume before either lookup answers, and
   * a click made inside that window publishes a *stance* response against a claim that wants
   * Verify/Dispute — the kind selects `voteKind` on the write, so it is the wrong vote rather than
   * the wrong label.
   *
   * Answered, not merely settled: a failed graph read stops loading too, and reading that as "no
   * factual flag" is the same bug with a longer fuse. Something has to have said so.
   */
  isResponseKindResolved: boolean;
  /**
   * Whether the viewer's own side is known yet.
   *
   * Separate from the vocabulary, and it fails in a different way. The counts and the viewer's
   * indexed response arrive together; until they do, a viewer who already answered is drawn holding
   * neither side — and pressing the side they already hold *republishes* it rather than clearing
   * it, because the control reads the same state the display does.
   *
   * geo-chat's row carries `viewer_response` directly, so a row is an answer on its own. Otherwise
   * it takes the on-chain read landing — including under a batch, where "landing" means the batch's
   * own readiness and a failed batch never resolves.
   */
  isViewerResponseResolved: boolean;
  summary: ClaimResponseSummary;
  claim: DebateClaimSummary;
  positions: DebateClaimPositionSummary[];
  readiness: MatchmakingReadiness;
};

/**
 * Everything a claim surface needs to draw and publish a response, derived once.
 *
 * Five surfaces render a claim's pills and split — the explore feed, the debates hub, the topic
 * page, the debate transcript panel and the claim page — and each of them was assembling this from
 * the same two inputs in the same order. Four copies of a derivation whose steps are individually
 * easy to get subtly wrong, which is exactly what happened: the transcript panel hard-coded the
 * `stance` fallback and published the wrong vote kind, and the "settled is not answered" fix had to
 * be written twice because two copies had drifted apart. Every one of those was a one-line change
 * applied N times, and the review that caught them caught them one file at a time.
 *
 * The two inputs stay with the caller because they arrive differently and legitimately so: the
 * panel batches its rows per space and its entities in one query, the feed gates both behind a
 * viewport observer, the topic page fetches per card because its claims span spaces. What must not
 * differ is what happens to them afterwards, which is all of this.
 */
/**
 * Which vocabulary a claim uses, from the two sources that can answer.
 *
 * geo-chat's copy wins where it has a row; the graph answers for the spaces it does not index. The
 * order matters and has to be the same everywhere, because this kind selects `voteKind` on both the
 * count query and the write — a surface that resolved it differently would count one vote kind
 * while publishing another, which is a bug this codebase has already had.
 *
 * Exported for the space claims page, which needs every claim's kind before it renders any of them
 * in order to batch the response reads. Everything else gets it from {@link useClaimResponseState}.
 */
export function resolveClaimResponseKind(
  row: Pick<DebateClaim, 'response_kind'> | null,
  entity: Entity | null,
  spaceId: string
): 'stance' | 'veracity' {
  return row?.response_kind ?? (entity ? claimResponseKind(entity, spaceId) : 'stance');
}

export function useClaimResponseState({
  claimId,
  spaceId,
  row,
  entity,
  title = '',
  description = null,
  enabled = true,
}: {
  claimId: string;
  spaceId: string;
  /** geo-chat's row, where it has one. Null in the spaces it does not index, and before it answers. */
  row: DebateClaim | null;
  /** The claim on the graph, which carries the factual flag geo-chat's row would otherwise report. */
  entity: Entity | null;
  /** The claim's text, where the caller has it. Surfaces that draw their own title pass nothing. */
  title?: string;
  description?: string | null;
  /** False to hold the response reads back — a feed card below the fold. */
  enabled?: boolean;
}): ClaimResponseState {
  const responseKind = resolveClaimResponseKind(row, entity, spaceId);
  const isResponseKindResolved = row !== null || entity !== null;

  // Withheld until the vocabulary is an answer rather than the `stance` fallback.
  //
  // The kind is part of both query keys, so asking early does not just waste a pair of requests on
  // a factual claim — it populates the summary from the *stance* counts, and a card can draw that
  // split for as long as the entity takes to arrive, then swap it for the veracity one. The pills
  // being disabled stops the wrong write; it does not stop the wrong number.
  const summary = useClaimResponseSummary(claimId, spaceId, responseKind, enabled && isResponseKindResolved);

  const claim = React.useMemo(
    () => ({
      id: row?.id ?? claimId,
      space_id: spaceId,
      claim_entity_id: claimId,
      claim: title,
      description,
    }),
    [claimId, description, row?.id, spaceId, title]
  );

  const positions = React.useMemo(
    () => positionSummariesFromCounts(summary.positive, summary.negative, responseKind, row),
    [responseKind, row, summary.negative, summary.positive]
  );

  const readiness = React.useMemo(
    () => ({
      response_kind: responseKind,
      // Falls back to the on-chain summary, which resolves independently of geo-chat. Without it the
      // viewer's own side reads as unselected for as long as the row is out — and permanently in a
      // space geo-chat does not index — which turns a click on it into a republish rather than a
      // clear.
      viewer_response: row?.viewer_response ?? viewerResponseFromDirection(summary.viewerDirection, responseKind),
      viewer_debate_ready: row?.viewer_debate_ready ?? false,
      readiness_disabled_reason: row?.readiness_disabled_reason ?? null,
    }),
    [responseKind, row, summary.viewerDirection]
  );

  return {
    responseKind,
    isResponseKindResolved,
    isViewerResponseResolved: row !== null || !summary.isLoading,
    summary,
    claim,
    positions,
    readiness,
  };
}
