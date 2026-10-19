import { MAX_SEARCH_ADDITIONAL_SPACE_IDS } from './global-search-space-ids';

/**
 * Decides whether a search request should widen eligibility to the scoped
 * spaces from useGlobalSearchSpaceIds (root/current/personal/member/editor),
 * or search unrestricted.
 *
 * additionalSpaceIds is suppressed (returns `undefined`) when either:
 * - the search is already scoped to one space (filterBySpace truthy) — the
 *   single space filter already fully determines eligibility, or
 * - the caller explicitly wants unrestricted, non-canonical results
 *   (includeNonCanonical === true, not just omitted/false) — applying the
 *   scoped-spaces widening here would silently narrow the request back down
 *   to "canonical plus scoped spaces" instead of truly everything.
 *
 * Otherwise (includeNonCanonical omitted or false, no filterBySpace),
 * globalAdditionalSpaceIds is returned, with any `alsoSearchSpaceIds` the caller
 * named appended.
 *
 * `alsoSearchSpaceIds` is for a picker that knows which space holds the thing it
 * is searching for — a curated taxonomy nobody is a member of, say. It widens
 * eligibility to that space and nothing else, which is the narrow version of
 * what `includeNonCanonical: true` does by lifting the restriction entirely.
 *
 * `replaceScopeWithAlsoSearchSpaceIds` changes that union into a replacement:
 * the named spaces become the entire widening set instead of being added to the
 * default scoped spaces.
 */
export function selectSearchAdditionalSpaceIds({
  filterBySpace,
  includeNonCanonical,
  globalAdditionalSpaceIds,
  alsoSearchSpaceIds,
  replaceScopeWithAlsoSearchSpaceIds,
}: {
  filterBySpace: string | undefined;
  includeNonCanonical: boolean | undefined;
  globalAdditionalSpaceIds: string[];
  alsoSearchSpaceIds?: string[];
  replaceScopeWithAlsoSearchSpaceIds?: boolean;
}): string[] | undefined {
  const isScopedToOneSpace = Boolean(filterBySpace);
  const wantsUnrestrictedSearch = includeNonCanonical === true;
  const skipAdditionalSpaceIds = isScopedToOneSpace || wantsUnrestrictedSearch;

  if (skipAdditionalSpaceIds) return undefined;
  if (!alsoSearchSpaceIds?.length) return globalAdditionalSpaceIds;

  if (replaceScopeWithAlsoSearchSpaceIds) {
    return Array.from(new Set(alsoSearchSpaceIds)).slice(0, MAX_SEARCH_ADDITIONAL_SPACE_IDS);
  }

  // The caller's spaces go first. The list is capped, and a space asked for by
  // name is a worse thing to drop than the hundredth space someone edits.
  return Array.from(new Set([...alsoSearchSpaceIds, ...globalAdditionalSpaceIds])).slice(
    0,
    MAX_SEARCH_ADDITIONAL_SPACE_IDS
  );
}
