import type { EntityFilter, UuidFilter, UuidListFilter } from '~/core/gql/graphql';

/**
 * Find a child of a top-level `and` array that carries a `spaceIds` clause.
 *
 * Why: `convertWhereConditionToEntityFilter` AND-wraps the produced filter
 * with the empty-name exclusion (`{ name: { isNull: false, isNot: '' } }`),
 * which buries any `spaceIds` clause one level deep. Without this lookup
 * the helpers below silently fail to promote `spaceIds` to the top-level
 * GraphQL query arg, the per-row `valuesList`/`relationsList` filters lose
 * their `$spaceId` constraint, and the connection scan stops using the
 * indexed top-level path. We only peek into `and` (never `or` — semantics
 * differ) and only one level deep — that covers the wrap shape produced
 * by the converter.
 */
function findSpaceIdsClause(filter: EntityFilter): UuidListFilter | undefined {
  if (filter.spaceIds) return filter.spaceIds;
  if (!filter.and) return undefined;
  for (const child of filter.and) {
    if (child?.spaceIds) return child.spaceIds;
  }
  return undefined;
}

/**
 * Extract a single space ID from the filter's spaceIds field.
 *
 * Handles `anyEqualTo` (scalar match) and single-element `in` arrays.
 * Returns undefined for multi-space or unrecognized operators — those
 * fall through to `extractSpaceIdsFromFilter` or remain in the filter.
 *
 * Also looks one level deep into a top-level `and` (see {@link findSpaceIdsClause}).
 */
export function extractSingleSpaceIdFromFilter(filter?: EntityFilter): string | undefined {
  if (!filter) return undefined;
  const spaceIds = findSpaceIdsClause(filter);
  if (!spaceIds) return undefined;

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
 *
 * Also looks one level deep into a top-level `and` (see {@link findSpaceIdsClause}).
 */
export function extractSpaceIdsFromFilter(filter?: EntityFilter): UuidFilter | undefined {
  if (!filter) return undefined;
  const spaceIds = findSpaceIdsClause(filter);
  if (!spaceIds) return undefined;

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
 * Remove the `spaceIds` clause that {@link findSpaceIdsClause} would have
 * promoted to a top-level query arg, and only that clause. Mirrors the
 * extractor's first-wins semantics:
 *
 * - top-level `spaceIds` present → strip top-level only; any `and`-child
 *   `spaceIds` clauses represent independent constraints and are left on
 *   the residual filter so the server still enforces them.
 * - top-level absent, `and` present → strip the first `and`-child that
 *   carries `spaceIds`; later children with their own `spaceIds` survive.
 *
 * The previous implementation stripped every matching `and`-child, which
 * silently broadened results when callers passed shapes like
 * `{ and: [{ spaceIds: A }, { spaceIds: B }, ... ] }` — only A was promoted
 * but both A and B were removed. Producers in this codebase don't construct
 * those shapes today, but the helper shouldn't trust callers.
 *
 * After stripping, trivially-empty shells (`and: []`, `and: [singleton]`)
 * are collapsed so the residual filter is the smallest equivalent
 * expression. Returns undefined when stripping leaves no remaining keys.
 */
export function removeSpaceIdsFromFilter(filter?: EntityFilter): EntityFilter | undefined {
  if (!filter) return filter;
  if (!filter.spaceIds && !filter.and) return filter;

  const { spaceIds: topLevel, and, ...rest } = filter;
  let next: EntityFilter = { ...rest };

  if (and) {
    if (topLevel !== undefined) {
      // Top-level took priority during extraction; leave the and-array
      // intact so any nested spaceIds clauses (independent constraints,
      // not duplicates of the promoted one) survive untouched.
      next = { ...next, and };
    } else {
      // Strip only the first and-child carrying spaceIds.
      let stripped = false;
      const cleaned = and
        .map(child => {
          if (stripped || !child?.spaceIds) return child;
          stripped = true;
          const { spaceIds: _s, ...childRest } = child;
          return Object.keys(childRest).length > 0 ? (childRest as EntityFilter) : null;
        })
        .filter((child): child is EntityFilter => child !== null);

      if (cleaned.length === 1) {
        // Hoist the only remaining sibling out of the and-wrap. If a key
        // collides with what's already on `next`, keep the and-wrap intact
        // to preserve semantics.
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
