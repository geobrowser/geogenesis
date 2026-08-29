import type { EntityFilter, RelationFilter } from '~/core/gql/graphql';

/**
 * Collapse an `or` whose branches differ only by which single value they match into one
 * multi-valued clause. Two shapes, both seen in production, both from filters authored in the
 * graph rather than written here:
 *
 *   or: [ { relations: { some: X, typeId: A } }, { relations: { some: X, typeId: B } } ]
 *     -> relations: { some: { ...X, typeId: { in: [A, B] } } }
 *
 *   or: [ { typeIds: { anyEqualTo: A } }, { typeIds: { anyEqualTo: B } } ]
 *     -> typeIds: { overlaps: [A, B] }
 *
 * Why this exists: PostGraphile's connection-filter compiles every `relations.some`
 * into its own EXISTS subquery. OR-ing two of them leaves the planner unable to use
 * the relation indexes, and with a small `LIMIT` it picks a scan that never fills —
 * so the query does not merely run slowly, it runs until the 30s statement timeout
 * and comes back `INTERNAL` with no data. Measured against production on the shape
 * the explore feed was sending (two Subtopic-ish relation types to one target, plus
 * a name predicate, `first: 10`):
 *
 *   or of two `relations.some`        30,387 ms  -> statement timeout, no rows
 *   one `relations.some` + typeId in       338 ms  -> 6 rows
 *
 * ~90x, same results. The collapsed form is one EXISTS with `toEntityId = X AND
 * typeId IN (…)`, which matches `relations_to_entity_type_idx` in the api schema.
 *
 * The rewrite is only sound for `some`. `EXISTS(typeId=A ∧ P) ∨ EXISTS(typeId=B ∧ P)`
 * is the same question as `EXISTS((typeId=A ∨ typeId=B) ∧ P)` — both ask whether at
 * least one relation matches P with either type. That equivalence does not hold for
 * `none` or `every`, which are deliberately left alone.
 *
 * Filters reach us from data-block definitions authored in the graph, not only from
 * code, so this normalizes at the query layer rather than at any one call site.
 */

/** `{ is: "…" }` and nothing else — the only typeId shape we can safely merge. */
function singleTypeId(relation: RelationFilter): string | undefined {
  const typeId = relation.typeId;
  if (!typeId || typeof typeId !== 'object') return undefined;
  const keys = Object.keys(typeId).filter(k => (typeId as Record<string, unknown>)[k] !== undefined);
  if (keys.length !== 1 || keys[0] !== 'is') return undefined;
  return typeof typeId.is === 'string' ? typeId.is : undefined;
}

/** The branch's `relations.some`, if the branch is *only* that and nothing else. */
function soleRelationsSome(branch: EntityFilter): RelationFilter | undefined {
  const keys = Object.keys(branch).filter(k => (branch as Record<string, unknown>)[k] != null);
  if (keys.length !== 1 || keys[0] !== 'relations') return undefined;

  const relations = branch.relations;
  if (!relations) return undefined;
  const relationKeys = Object.keys(relations).filter(
    k => (relations as Record<string, unknown>)[k] != null
  );
  if (relationKeys.length !== 1 || relationKeys[0] !== 'some') return undefined;

  return relations.some ?? undefined;
}

/**
 * Order-independent structural identity. Deliberately not `JSON.stringify(v, keys)`:
 * an array replacer filters by key name at *every* depth, so nested clauses like
 * `toEntityId: { is: … }` would be stripped and two different branches would compare
 * equal. This sorts keys at each level instead and keeps all of them.
 */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
}

/** Stable identity for "everything about this branch except which type it matches". */
function shapeWithoutTypeId(relation: RelationFilter): string {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { typeId: _omitted, ...rest } = relation;
  return stableStringify(rest);
}

/**
 * Rewrite one `or` array, or return undefined when it is not the collapsible shape.
 * Requires at least two branches, every branch a bare `relations.some` carrying a
 * single `typeId: { is }`, and all branches identical once typeId is set aside.
 */
function collapseRelationsSomeBranches(branches: readonly EntityFilter[]): EntityFilter | undefined {
  if (branches.length < 2) return undefined;

  const relations: RelationFilter[] = [];
  for (const branch of branches) {
    if (!branch) return undefined;
    const some = soleRelationsSome(branch);
    if (!some) return undefined;
    relations.push(some);
  }

  const typeIds: string[] = [];
  for (const relation of relations) {
    const id = singleTypeId(relation);
    if (!id) return undefined;
    typeIds.push(id);
  }

  const shape = shapeWithoutTypeId(relations[0]!);
  if (!relations.every(r => shapeWithoutTypeId(r) === shape)) return undefined;

  const unique = [...new Set(typeIds)];
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { typeId: _omitted, ...shared } = relations[0]!;

  return {
    relations: {
      some: {
        ...shared,
        typeId: unique.length === 1 ? { is: unique[0]! } : { in: unique },
      },
    },
  };
}

/**
 * Rewrite an `or` whose every branch is a bare `typeIds: { anyEqualTo }`, or undefined when it is
 * not that shape.
 *
 * The result uses `overlaps`, not `in`. On a list column `in` compares the *whole array* against
 * each candidate rather than testing membership, so the `in` form returns nothing — measured at
 * 28,810 ms and 0 rows against production, versus 6,521 ms and 9 rows for the OR it would have
 * replaced. `overlaps` is the membership operator and returns the same 9 rows in 2,151 ms, and
 * `extractTypeIdsFromFilter` then promotes it to the indexed top-level argument at 750 ms.
 *
 * `anyEqualTo` is already membership ("any array item equals this"), so the rewrite is a
 * straight OR-to-set: `any = A ∨ any = B` is `overlaps [A, B]`.
 */
function collapseTypeIdsBranches(branches: readonly EntityFilter[]): EntityFilter | undefined {
  if (branches.length < 2) return undefined;

  const ids: string[] = [];
  for (const branch of branches) {
    if (!branch) return undefined;
    const keys = Object.keys(branch).filter(k => (branch as Record<string, unknown>)[k] != null);
    if (keys.length !== 1 || keys[0] !== 'typeIds') return undefined;

    const typeIds = branch.typeIds;
    if (!typeIds) return undefined;
    const typeIdKeys = Object.keys(typeIds).filter(k => (typeIds as Record<string, unknown>)[k] != null);
    if (typeIdKeys.length !== 1 || typeIdKeys[0] !== 'anyEqualTo') return undefined;
    if (typeof typeIds.anyEqualTo !== 'string') return undefined;
    ids.push(typeIds.anyEqualTo);
  }

  const unique = [...new Set(ids)];
  return { typeIds: unique.length === 1 ? { anyEqualTo: unique[0] } : { overlaps: unique } };
}

/**
 * Walk the filter and collapse every OR-of-`relations.some` it contains, at any
 * depth. Returns the input unchanged (by reference) when there is nothing to do,
 * so callers can keep using it as an effect dependency.
 */
export function collapseOrFilter(filter?: EntityFilter): EntityFilter | undefined {
  if (!filter) return filter;

  let changed = false;
  const next: EntityFilter = { ...filter };

  // Children first, so an `or` collapsed below appends to an already-walked `and`
  // rather than re-appending the original children alongside it.
  if (filter.and) {
    const walked = filter.and.map(child => collapseOrFilter(child) ?? child);
    if (walked.some((child, i) => child !== filter.and![i])) {
      next.and = walked;
      changed = true;
    }
  }

  if (filter.not) {
    const walked = collapseOrFilter(filter.not);
    if (walked !== filter.not) {
      next.not = walked;
      changed = true;
    }
  }

  if (filter.or) {
    const collapsed = collapseRelationsSomeBranches(filter.or) ?? collapseTypeIdsBranches(filter.or);
    if (collapsed) {
      delete next.or;
      // The collapsed branch becomes a `relations` or `typeIds` clause. If the filter already
      // carries that same key, AND them together rather than silently dropping either.
      const key = collapsed.relations ? 'relations' : 'typeIds';
      if (next[key]) {
        next.and = [...(next.and ?? []), collapsed];
      } else {
        Object.assign(next, collapsed);
      }
      changed = true;
    } else {
      const walked = filter.or.map(child => collapseOrFilter(child) ?? child);
      if (walked.some((child, i) => child !== filter.or![i])) {
        next.or = walked;
        changed = true;
      }
    }
  }

  return changed ? next : filter;
}
