import { TOPICS_PROPERTY_ID } from '~/core/claims/ontology';
import { claimResponseKind } from '~/core/claims/response-kind';
import { responsePositionLabel } from '~/core/responses/entity-response';

import type { DebateClaim, DebateClaimPositionSummary, MatchmakingClaim, MatchmakingTopic } from './api';
import type { ClaimPickerEntity } from './claim-picker-page';

/**
 * GEO-2704. Turning a knowledge-graph claim into the row the hub's cards already speak.
 *
 * Two lists need this now — Featured, which has always come from the graph, and the tail that
 * continues geo-chat's list once it runs out — so the conversion lives here rather than being
 * written twice with two sets of fallbacks.
 *
 * geo-chat has a row for a claim only once someone has taken a side on it, so everything its row
 * would carry has a graph-derived fallback: a claim nobody has answered still lists, with no sides
 * and the response kind its own "Is factual" value implies.
 */

/**
 * The two sides of a claim, from geo-chat's per-space row.
 *
 * That row reports the sides as `online_choices` — who is online and available on each — where the
 * hub's index reports a total alongside them. The card draws the avatars and their overflow count
 * off `total_count`, so the online count stands in for it: it is the only count this endpoint
 * gives, and undercounting a side is better than claiming a total it never told us.
 */
export function graphClaimPositionSummaries(
  row: DebateClaim | undefined,
  responseKind: 'stance' | 'veracity'
): DebateClaimPositionSummary[] {
  return [true, false].map(position => {
    const choice = row?.online_choices.find(candidate => candidate.position === position);

    return {
      position,
      // A server-supplied label wins, so an authoritative Verify/Dispute survives.
      position_label: choice?.position_label ?? responsePositionLabel(responseKind, position),
      total_count: choice?.participant_count ?? 0,
      available_now_count: choice?.participant_count ?? 0,
      participants: choice?.participants ?? [],
    };
  });
}

/** The graph-side facts a row is built from, once its home space has been decided. */
export type GraphClaimSource = {
  claimEntityId: string;
  spaceId: string;
  name: string;
  description: string | null;
  /** The claim's entity, where it was fetched — supplies the response kind when geo-chat has no row. */
  entity?: ClaimPickerEntity;
};

export function graphClaimRow(source: GraphClaimSource, row: DebateClaim | undefined): MatchmakingClaim {
  const responseKind =
    row?.response_kind ?? (source.entity ? claimResponseKind(source.entity, source.spaceId) : 'stance');

  return {
    claim: {
      id: row?.id ?? source.claimEntityId,
      space_id: source.spaceId,
      claim_entity_id: source.claimEntityId,
      claim: source.name,
      description: source.description,
    },
    // Topics ride alongside the row rather than on it — see `graphClaimTopics`, which the menus and
    // the topic filter both read. geo-chat's own rows carry them here; these don't.
    topics: [],
    response_kind: responseKind,
    viewer_response: row?.viewer_response ?? null,
    viewer_position: row?.viewer_response?.position ?? null,
    viewer_debate_ready: row?.viewer_debate_ready ?? false,
    readiness_disabled_reason: row?.readiness_disabled_reason ?? null,
    positions: graphClaimPositionSummaries(row, responseKind),
    // The index's ranking score, which these lists have no equivalent of and don't sort by.
    score: 0,
    active_debate: Boolean(row?.active_debate),
  };
}

/**
 * Topics by claim id, off the entities already fetched for the response kind.
 *
 * geo-chat's topic facet describes the claims geo-chat knows about, so it says nothing about these
 * — which is exactly how a topic came to be offered under Featured and missing under All claims for
 * the same space. The menus union the two.
 */
export function graphClaimTopics(entities: ClaimPickerEntity[]): Map<string, MatchmakingTopic[]> {
  const map = new Map<string, MatchmakingTopic[]>();

  for (const entity of entities) {
    const topics = entity.relations
      .filter(relation => relation.type.id === TOPICS_PROPERTY_ID && relation.isDeleted !== true)
      .map(relation => ({ id: relation.toEntity.id, name: relation.toEntity.name ?? null }));
    if (topics.length > 0) map.set(entity.id, topics);
  }

  return map;
}

/** Claim ids grouped for geo-chat's per-space `debate-claims` lookup, in a stable order. */
export function claimIdsBySpace(claims: Array<{ claimEntityId: string; spaceId: string }>) {
  const bySpace = new Map<string, string[]>();

  for (const claim of claims) {
    const existing = bySpace.get(claim.spaceId);
    if (existing) existing.push(claim.claimEntityId);
    else bySpace.set(claim.spaceId, [claim.claimEntityId]);
  }

  return [...bySpace.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([spaceId, claimIds]) => ({ spaceId, claimIds }));
}
