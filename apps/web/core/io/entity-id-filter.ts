import type { EntityFilter } from '~/core/gql/graphql';

/**
 * Lift a conjunctive `id: { in: [...] }` clause out of an `EntityFilter` so it can be sent as the
 * `entityIds` argument of `entitiesOrderedByPropertyConnection` instead.
 *
 * Why: that connection's `filter` applies OUTSIDE the SQL function, after it has built and sorted
 * every entity carrying the property. A data block or collection restricted to a few entities
 * therefore sorted every named entity first — 12-25s on testnet to return one row. `entityIds` is
 * applied inside the function (gaia migration 0094), where it bounds the scan: 0.2ms for the same
 * answer.
 *
 * Deliberately conservative. The clause is lifted only when the meaning is unchanged:
 *   - exactly one `id` clause is reachable, through the top level and nested `and` arrays only
 *     (the same two levels `space-filter.ts` and `type-filter.ts` walk). `or` and `not` are never
 *     entered, so an id clause under them stays put;
 *   - that clause holds nothing but a non-empty `in` list. The server treats an empty `entityIds`
 *     as "no restriction", so an empty `in` (which matches nothing) must stay in the filter.
 * Anything else returns the filter untouched and no ids.
 *
 * Returning both halves together means the ids are never sent while the same restriction is also
 * left in the filter, nor removed from the filter without being sent.
 */
export function promoteEntityIds(filter?: EntityFilter): { entityIds?: string[]; filter?: EntityFilter } {
  if (!filter) return { filter };

  const found: IdClause[] = [];
  collectIdClauses(filter, 0, [], found);
  const only = found.length === 1 ? found[0] : undefined;
  if (!only || !only.ids) return { filter };

  return { entityIds: only.ids, filter: withoutIdClause(filter, only.path) };
}

type IdClause = { path: number[]; ids: string[] | null };

function collectIdClauses(filter: EntityFilter, depth: number, path: number[], out: IdClause[]) {
  if (filter.id) out.push({ path, ids: pureInList(filter.id) });
  // Two levels, as in type-filter.ts: that is what the converter produces, and an unbounded walk
  // would follow a caller-supplied cycle.
  if (filter.and && depth < 2) {
    filter.and.forEach((child, i) => {
      if (child) collectIdClauses(child, depth + 1, [...path, i], out);
    });
  }
}

function pureInList(clause: NonNullable<EntityFilter['id']>): string[] | null {
  const keys = Object.entries(clause)
    .filter(([, v]) => v !== undefined)
    .map(([k]) => k);
  if (keys.length !== 1 || keys[0] !== 'in') return null;
  const list = clause.in;
  if (!Array.isArray(list) || list.length === 0) return null;
  if (!list.every((v): v is string => typeof v === 'string' && v.length > 0)) return null;
  return [...new Set(list)];
}

function withoutIdClause(filter: EntityFilter, path: number[]): EntityFilter | undefined {
  if (path.length === 0) {
    const { id: _id, ...rest } = filter;
    return nonEmpty(rest);
  }

  const [index, ...deeper] = path;
  const { and, ...rest } = filter;
  const nextAnd = (and ?? [])
    .map((child, i) => (i === index && child ? withoutIdClause(child, deeper) : child))
    .filter((child): child is EntityFilter => child != null && Object.keys(child).length > 0);

  return nonEmpty(nextAnd.length > 0 ? { ...rest, and: nextAnd } : rest);
}

function nonEmpty(filter: EntityFilter): EntityFilter | undefined {
  return Object.keys(filter).length > 0 ? filter : undefined;
}
