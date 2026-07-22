import type { SearchResult } from '~/core/types';

export function rankingSearchHasExactNameMatch(
  query: string,
  results: SearchResult[],
  extraNames: Iterable<string | null | undefined> = []
): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return false;

  for (const result of results) {
    if (result.name?.trim().toLowerCase() === normalized) return true;
  }

  for (const name of extraNames) {
    if (name?.trim().toLowerCase() === normalized) return true;
  }

  return false;
}
