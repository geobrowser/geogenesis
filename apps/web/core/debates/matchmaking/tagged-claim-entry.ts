import { resolveClaimResponseKind } from '~/core/claims/browse/use-claim-response-state';
import { responsePositionLabel } from '~/core/responses/entity-response';
import { validateEntityId } from '~/core/utils/utils';

import type { DebateClaim, DebateClaimPositionSummary, MatchmakingClaim } from '../api';
import { claimRowKey } from './claim-row-key';

/** A graph claim and the space its card is drawn in. */
export type PlacedClaim = { spaceId: string; claimId: string };

/**
 * geo-chat's row lookups for graph-sourced cards: one group per space, in a stable order, so the
 * query keys hold while the list around them changes. Ids geo-chat would refuse are left out.
 */
export function claimRowGroups(placed: Iterable<PlacedClaim>): Array<{ spaceId: string; claimIds: string[] }> {
  const bySpace = new Map<string, Set<string>>();
  for (const { spaceId, claimId } of placed) {
    if (!validateEntityId(claimId)) continue;
    const ids = bySpace.get(spaceId) ?? new Set<string>();
    ids.add(claimId);
    bySpace.set(spaceId, ids);
  }
  return [...bySpace.entries()]
    .sort(([a], [z]) => a.localeCompare(z))
    .map(([spaceId, ids]) => ({ spaceId, claimIds: [...ids] }));
}

/**
 * geo-chat's rows by the card they belong to: space *and* claim, see {@link claimRowKey}. Read back
 * with {@link placedClaimKey}.
 */
export function rowsByPlacedClaim(rows: readonly DebateClaim[]): Map<string, DebateClaim> {
  return new Map(rows.map(row => [claimRowKey({ claim: row }), row]));
}

export function placedClaimKey({ spaceId, claimId }: PlacedClaim): string {
  return claimRowKey({ claim: { space_id: spaceId, claim_entity_id: claimId } });
}

/**
 * Whether a graph-sourced card in `spaceId` may be answered yet. Signed out is an answer (a press
 * opens sign-in); signed in, the account key and that space's rows have to have landed, or the side
 * the viewer already holds would be drawn unselected and a press would republish it.
 */
export function placedAnswersReady(
  viewer: { authenticated: boolean; accountKey: string | null },
  unresolvedSpaceIds: ReadonlySet<string>,
  spaceId: string
): boolean {
  return viewer.authenticated ? Boolean(viewer.accountKey) && !unresolvedSpaceIds.has(spaceId) : true;
}

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
