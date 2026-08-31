import type { EntityFilter, UuidFilter, UuidListFilter } from '~/core/gql/graphql';

/**
 * Find a child of a top-level `and` array that carries a `typeIds` clause.
 * Mirrors {@link findSpaceIdsClause} in `space-filter.ts` — see that file
 * for the full rationale. Briefly: the converter AND-wraps with the
 * empty-name exclusion, burying `typeIds` one level deep and breaking
 * the top-level promotion that uses the indexed query path.
 */
function findTypeIdsClause(filter: EntityFilter): UuidListFilter | undefined {
  if (filter.typeIds) return filter.typeIds;
  if (!filter.and) return undefined;
  for (const child of filter.and) {
    if (child?.typeIds) return child.typeIds;
  }
  return undefined;
}

export function extractSingleTypeIdFromFilter(filter?: EntityFilter): string | undefined {
  if (!filter) return undefined;
  const typeIds = findTypeIdsClause(filter);
  if (!typeIds) return undefined;

  if (typeIds.anyEqualTo) {
    return typeIds.anyEqualTo;
  }

  if (typeIds.in && typeIds.in.length === 1 && typeIds.in[0]) {
    return typeIds.in[0];
  }

  if (typeIds.overlaps && typeIds.overlaps.length === 1 && typeof typeIds.overlaps[0] === 'string') {
    return typeIds.overlaps[0];
  }

  return undefined;
}

export function extractTypeIdsFromFilter(filter?: EntityFilter): UuidFilter | undefined {
  if (!filter) return undefined;
  const typeIds = findTypeIdsClause(filter);
  if (!typeIds) return undefined;

  if (typeIds.in && typeIds.in.length > 1) {
    const validIds = typeIds.in.filter((v): v is string => typeof v === 'string');
    if (validIds.length > 0) {
      return { in: validIds };
    }
  }

  if (typeIds.anyEqualTo) {
    return { is: typeIds.anyEqualTo };
  }

  // `overlaps` is the membership operator for a list column — "this entity's types include any of
  // these". `in` is not: at filter level it compares the whole array, which returns nothing here.
  // Promoted to the top-level `typeIds` argument it becomes `{ in: [...] }`, because that argument
  // is a UuidFilter over the set rather than a filter on the column, and that is the indexed path.
  // Without this branch a collapsed OR would be left in the filter and scanned. Measured on the
  // explore shape: 2,151 ms as a filter predicate, 750 ms once promoted.
  if (typeIds.overlaps) {
    const validIds = typeIds.overlaps.filter((v): v is string => typeof v === 'string');
    if (validIds.length > 1) return { in: validIds };
    if (validIds.length === 1) return { is: validIds[0] };
  }

  return undefined;
}

/**
 * Remove only the `typeIds` clause that {@link findTypeIdsClause} would
 * have promoted. See `space-filter.ts`'s `removeSpaceIdsFromFilter` for
 * the full rationale — this mirrors that behavior for `typeIds`.
 */
export function removeTypeIdsFromFilter(filter?: EntityFilter): EntityFilter | undefined {
  if (!filter) return filter;
  if (!filter.typeIds && !filter.and) return filter;

  const { typeIds: topLevel, and, ...rest } = filter;
  let next: EntityFilter = { ...rest };

  if (and) {
    if (topLevel !== undefined) {
      next = { ...next, and };
    } else {
      let stripped = false;
      const cleaned = and
        .map(child => {
          if (stripped || !child?.typeIds) return child;
          stripped = true;
          const { typeIds: _t, ...childRest } = child;
          return Object.keys(childRest).length > 0 ? (childRest as EntityFilter) : null;
        })
        .filter((child): child is EntityFilter => child !== null);

      if (cleaned.length === 1) {
        const collides = Object.keys(cleaned[0]).some(k => k in next);
        if (!collides) {
          next = { ...next, ...cleaned[0] };
        } else {
          next = { ...next, and: cleaned };
        }
      } else if (cleaned.length > 1) {
        next = { ...next, and: cleaned };
      }
    }
  }

  return Object.keys(next).length > 0 ? next : undefined;
}
