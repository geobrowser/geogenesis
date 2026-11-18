import { normId } from '~/core/utils/norm-id';

/**
 * "Start from the team ranking" (Preston, 12 Nov; may go once the first flow settles): the team
 * order as a starting draft. In team order, without debates the viewer pushed down, and no longer
 * than a ballot may be (`maxItems`, what the publish path enforces).
 */
export function copyTeamOrderToDraft({
  teamOrder,
  pushedDownIds,
  maxItems,
}: {
  teamOrder: readonly string[];
  pushedDownIds: readonly string[];
  maxItems: number;
}): { ids: string[]; available: number; capped: boolean } {
  const skip = new Set(pushedDownIds.map(normId));
  const seen = new Set<string>();
  const eligible: string[] = [];
  for (const id of teamOrder) {
    const key = normId(id);
    if (skip.has(key) || seen.has(key)) continue;
    seen.add(key);
    eligible.push(id);
  }
  const ids = eligible.slice(0, Math.max(0, maxItems));
  return { ids, available: eligible.length, capped: ids.length < eligible.length };
}
