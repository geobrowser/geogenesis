import { CLAIM_TYPE_ID } from '~/core/claims/ontology';
import { equals } from '~/core/id/normalize';
import type { SearchResult } from '~/core/types';
import { hasName } from '~/core/utils/utils';

import { getTopRankedSpaceId } from './space-ranking';

/**
 * The result with a claim's top-ranked named, non-Hidden space first, the space the canonical URL uses.
 * `spaces` also counts spaces that only link to the claim; search's own rows (`namesBySpace`) don't (GEO-3802).
 */
export function withClaimHomeSpaceFirst(result: SearchResult): SearchResult {
  if (!result.types.some(type => equals(type.id, CLAIM_TYPE_ID))) return result;

  const nameIn = (spaceId: string) =>
    Object.entries(result.namesBySpace ?? {}).find(([named]) => equals(named, spaceId))?.[1];
  const isHidden = (spaceId: string) => (result.hiddenSpaceIds ?? []).some(hidden => equals(hidden, spaceId));
  const named = result.spaces.filter(space => hasName(nameIn(space.spaceId)) && !isHidden(space.spaceId));
  const home = getTopRankedSpaceId(named.map(space => space.spaceId));
  if (!home || equals(home, result.spaces[0]?.spaceId ?? '')) return result;

  const homeSpace = named.find(space => space.spaceId === home)!;
  return {
    ...result,
    name: nameIn(home) ?? result.name,
    spaces: [homeSpace, ...result.spaces.filter(space => space !== homeSpace)],
  };
}
