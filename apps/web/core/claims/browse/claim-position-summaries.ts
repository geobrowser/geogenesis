import type { DebateClaim, DebateClaimPositionSummary } from '~/core/debates/api';
import { responsePositionLabel } from '~/core/responses/entity-response';

/**
 * The two sides of a claim, in the shape the hub's position controls read.
 *
 * Counts come from on-chain responses rather than geo-chat's `total_count`, so the pills agree
 * with the percentage the page reports directly above them. geo-chat's own counts are filtered to
 * people standing ready to debate, which is a different population and would put two numbers that
 * disagree on one screen.
 *
 * The avatars are still geo-chat's, because they are the only place faces come from. That means a
 * side can show fewer faces than its count — the count is everyone who responded, the faces are
 * those geo-chat lists — which is the honest way round: undercounting faces beats naming people
 * who never responded.
 */
export function positionSummariesFromCounts(
  positive: number,
  negative: number,
  responseKind: 'stance' | 'veracity',
  row: DebateClaim | null
): DebateClaimPositionSummary[] {
  return [true, false].map(position => {
    const choice = row?.online_choices.find(candidate => candidate.position === position);
    const count = position ? positive : negative;

    return {
      position,
      // A server-supplied label wins, so an authoritative Verify/Dispute survives.
      position_label: choice?.position_label ?? responsePositionLabel(responseKind, position),
      total_count: count,
      available_now_count: choice?.participant_count ?? 0,
      present_count: choice?.participants.length ?? 0,
      participants: choice?.participants ?? [],
    };
  });
}
