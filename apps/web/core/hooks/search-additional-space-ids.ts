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
 * globalAdditionalSpaceIds is returned unchanged.
 */
export function selectSearchAdditionalSpaceIds({
  filterBySpace,
  includeNonCanonical,
  globalAdditionalSpaceIds,
}: {
  filterBySpace: string | undefined;
  includeNonCanonical: boolean | undefined;
  globalAdditionalSpaceIds: string[];
}): string[] | undefined {
  const isScopedToOneSpace = Boolean(filterBySpace);
  const wantsUnrestrictedSearch = includeNonCanonical === true;
  const skipAdditionalSpaceIds = isScopedToOneSpace || wantsUnrestrictedSearch;

  return skipAdditionalSpaceIds ? undefined : globalAdditionalSpaceIds;
}
