import { resolveClaimResponseKind } from '~/core/claims/browse/use-claim-response-state';
import { responsePositionLabel } from '~/core/responses/entity-response';

import type { DebateClaim, DebateClaimPositionSummary, MatchmakingClaim } from '../api';

/**
 * A graph-sourced claim in the shape the hub's cards read, for the space it is drawn in. geo-chat has
 * a row for a claim only once someone has taken a side on it, so everything it would carry has a
 * graph-derived fallback: a claim nobody has answered still lists, with no sides.
 *
 * Shared by the Explore tab and the lobby's claim list tabs, which draw the same cards.
 */
export function taggedClaimEntry(
  entity: { id: string; name: string | null; description: string | null },
  spaceId: string,
  row: DebateClaim | undefined
): MatchmakingClaim {
  return {
    claim: {
      id: row?.id ?? entity.id,
      space_id: spaceId,
      claim_entity_id: entity.id,
      claim: entity.name ?? '',
      description: entity.description,
    },
    topics: [],
    response_kind: resolveClaimResponseKind(),
    viewer_response: row?.viewer_response ?? null,
    viewer_position: row?.viewer_response?.position ?? null,
    viewer_debate_ready: row?.viewer_debate_ready ?? false,
    readiness_disabled_reason: row?.readiness_disabled_reason ?? null,
    positions: taggedPositionSummaries(row),
    // The index's ranking score, which the tagged list is ordered by on the server and doesn't re-sort.
    score: 0,
    active_debate: Boolean(row?.active_debate),
  };
}

/**
 * The two sides of a tagged claim, from geo-chat's per-space row.
 *
 * That row reports the sides as `online_choices` — who is online and available on each — where the
 * hub's index reports a total alongside them. The card draws the avatars and their overflow count
 * off `total_count`, so the online count stands in for it: it is the only count this endpoint
 * gives, and undercounting a side is better than claiming a total it never told us.
 */
export function taggedPositionSummaries(row: DebateClaim | undefined): DebateClaimPositionSummary[] {
  return [true, false].map(position => {
    const choice = row?.online_choices.find(candidate => candidate.position === position);

    return {
      position,
      // Our label, never geo-chat's stale Verify/Dispute — see `positionSummariesFromCounts`.
      position_label: responsePositionLabel(position),
      total_count: choice?.participant_count ?? 0,
      available_now_count: choice?.participant_count ?? 0,
      // These are `online_choices`, so the count already *is* the present population — the same
      // number, but it has to be set explicitly. `present_count` is what the avatar stack and its
      // `+N` read (GEO-2691), and leaving it unset would fall back to the length of the capped
      // preview and silently drop the overflow: 5 people behind 2 faces would render no "+3".
      present_count: choice?.participant_count ?? 0,
      participants: choice?.participants ?? [],
    };
  });
}
