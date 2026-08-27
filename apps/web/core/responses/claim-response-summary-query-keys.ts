import type { ResponseKind } from './entity-response';

const CLAIM_RESPONSE_SUMMARY_QUERY_ROOTS = new Set(['claim-response-summaries', 'claim-response-summary-data']);

export function claimResponseTargetKey(target: { entityId: string; responseKind: ResponseKind }) {
  return `${target.entityId}:${target.responseKind}`;
}

export function claimResponseSummariesQueryKeyPrefix(personalSpaceId: string | null, spaceId: string) {
  return ['claim-response-summaries', personalSpaceId, spaceId] as const;
}

export function isClaimResponseSummaryQueryKey(
  queryKey: readonly unknown[],
  filters: { spaceId?: string; targetKeys?: ReadonlySet<string> } = {}
) {
  const [root, , spaceId, targetKeys] = queryKey;
  if (typeof root !== 'string' || !CLAIM_RESPONSE_SUMMARY_QUERY_ROOTS.has(root)) return false;
  if (filters.spaceId !== undefined && spaceId !== filters.spaceId) return false;
  if (!filters.targetKeys) return true;
  return (
    Array.isArray(targetKeys) &&
    targetKeys.some(target => typeof target === 'string' && filters.targetKeys?.has(target))
  );
}
