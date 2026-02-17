import type { EntityFilter, UuidFilter, UuidListFilter } from '~/core/gql/graphql';

/**
 * Extract a single space ID from the filter's spaceIds field.
 *
 * Handles `anyEqualTo` (scalar match) and single-element `in` arrays.
 * Returns undefined for multi-space or unrecognized operators — those
 * fall through to `extractSpaceIdsFromFilter` or remain in the filter.
 */
export function extractSingleSpaceIdFromFilter(filter?: EntityFilter): string | undefined {
  if (!filter?.spaceIds) return undefined;

  const spaceIds: UuidListFilter = filter.spaceIds;

  if (spaceIds.anyEqualTo) {
    return spaceIds.anyEqualTo;
  }

  if (spaceIds.in && spaceIds.in.length === 1 && spaceIds.in[0]) {
    return spaceIds.in[0];
  }

  return undefined;
}

/**
 * Extract a multi-space filter from the filter's spaceIds field.
 *
 * Handles multi-element `in` arrays and `anyEqualTo` (as a fallback).
 * Returns a `UuidFilter` suitable for the top-level `spaceIds` query arg.
 *
 * Note: `UuidListFilter` (array column) and `UuidFilter` (scalar) have
 * different semantics. This conversion relies on the server's top-level
 * `spaceIds` arg using array-membership semantics internally.
 */
export function extractSpaceIdsFromFilter(filter?: EntityFilter): UuidFilter | undefined {
  if (!filter?.spaceIds) return undefined;

  const spaceIds: UuidListFilter = filter.spaceIds;

  if (spaceIds.in && spaceIds.in.length > 1) {
    const validIds = spaceIds.in.filter((v): v is string => typeof v === 'string');
    if (validIds.length > 0) {
      return { in: validIds };
    }
  }

  if (spaceIds.anyEqualTo) {
    return { is: spaceIds.anyEqualTo };
  }

  return undefined;
}

/**
 * Remove the `spaceIds` key from a filter after its constraints have been
 * promoted to top-level query args. Returns undefined when stripping
 * spaceIds leaves no remaining filter keys.
 */
export function removeSpaceIdsFromFilter(filter?: EntityFilter): EntityFilter | undefined {
  if (!filter?.spaceIds) return filter;
  const { spaceIds: _spaceIds, ...rest } = filter;
  return Object.keys(rest).length > 0 ? (rest as EntityFilter) : undefined;
}
