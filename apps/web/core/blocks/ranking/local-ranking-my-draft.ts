/** Local draft order for My ranking in the embedded block before the first publish. */

export function myRankingDraftStorageKey(spaceId: string, blockId: string): string {
  return `geogenesis.ranking-my-draft.v1:${spaceId}:${blockId}`;
}

export function loadLocalMyRankingDraft(spaceId: string, blockId: string): string[] | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(myRankingDraftStorageKey(spaceId, blockId));
  if (!raw?.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    const ids = parsed.filter((id): id is string => typeof id === 'string' && id.length > 0);
    return ids.length > 0 ? ids : null;
  } catch {
    return null;
  }
}

export function saveLocalMyRankingDraft(spaceId: string, blockId: string, orderedEntityIds: string[]): void {
  if (typeof window === 'undefined') return;
  const ids = orderedEntityIds.filter(Boolean);
  const key = myRankingDraftStorageKey(spaceId, blockId);
  if (ids.length === 0) {
    window.localStorage.removeItem(key);
    return;
  }
  window.localStorage.setItem(key, JSON.stringify(ids));
}

export function clearLocalMyRankingDraft(spaceId: string, blockId: string): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(myRankingDraftStorageKey(spaceId, blockId));
}
