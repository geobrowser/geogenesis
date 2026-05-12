import { uuidToHex } from '~/core/id/normalize';
import type { SearchResult } from '~/core/types';

type SearchResultType = SearchResult['types'][number];

function normalizeTypeId(id: string): string {
  return uuidToHex(id);
}

export function dedupeSearchResultTypes(types: SearchResultType[]): SearchResultType[] {
  const byId = new Map<string, SearchResultType>();

  for (const type of types) {
    const id = normalizeTypeId(type.id);
    const existing = byId.get(id);

    if (existing) {
      byId.set(id, {
        ...existing,
        name: existing.name ?? type.name,
      });
      continue;
    }

    byId.set(id, {
      ...type,
      id,
    });
  }

  return [...byId.values()];
}

export function dedupeSearchResultTypeTags(result: SearchResult): SearchResult {
  return {
    ...result,
    types: dedupeSearchResultTypes(result.types),
    typesBySpace: result.typesBySpace
      ? Object.fromEntries(
          Object.entries(result.typesBySpace).map(([spaceId, types]) => [spaceId, dedupeSearchResultTypes(types)])
        )
      : undefined,
  };
}
