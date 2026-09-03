import type { EntityFilter, UuidFilter, UuidListFilter } from '~/core/gql/graphql';

/**
 * Collect every `typeIds` clause reachable through nested `and` arrays.
 *
 * Mirrors {@link findSpaceIdsClause} in `space-filter.ts` — see that file for the full rationale.
 * Briefly: the converter AND-wraps with the empty-name exclusion, burying `typeIds` a level deep
 * and breaking the top-level promotion that uses the indexed query path.
 *
 * This recurses, and that is the fix rather than a tidy-up. Explore sends the picked types as
 * *separate* clauses inside their own nested `and`:
 *
 *   { and: [ { and: [ {typeIds:{anyEqualTo:A}}, {typeIds:{anyEqualTo:B}} ] }, { name: … } ] }
 *
 * The previous single-level walk looked at the top-level children, found `{ and: [...] }` with no
 * own `.typeIds`, and promoted nothing — so every clause stayed in the filter and each compiled to
 * its own EXISTS over `relations`. Measured against api-testnet: the real explore request is a
 * **30.6s statement timeout** (it fails, it does not merely load slowly); promoted it is 415ms.
 */
function collectTypeIdsClauses(filter: EntityFilter, depth = 0): UuidListFilter[] {
  const found: UuidListFilter[] = [];
  if (filter.typeIds) found.push(filter.typeIds);
  // Two levels covers `and`-of-`and`, which is what the converter produces. Deeper nesting is not
  // generated today, and recursing without a bound would happily walk a caller-supplied cycle.
  if (filter.and && depth < 2) {
    for (const child of filter.and) {
      if (child) found.push(...collectTypeIdsClauses(child, depth + 1));
    }
  }
  return found;
}

function findTypeIdsClause(filter: EntityFilter): UuidListFilter | undefined {
  return collectTypeIdsClauses(filter)[0];
}

/** Every type id named by any clause, de-duplicated, order preserved. */
function collectTypeIds(filter: EntityFilter): string[] {
  const ids: string[] = [];
  for (const clause of collectTypeIdsClauses(filter)) {
    if (clause.anyEqualTo) ids.push(clause.anyEqualTo);
    for (const list of [clause.in, clause.overlaps]) {
      if (!list) continue;
      for (const v of list) if (typeof v === 'string') ids.push(v);
    }
  }
  return [...new Set(ids)];
}

export function extractSingleTypeIdFromFilter(filter?: EntityFilter): string | undefined {
  if (!filter) return undefined;
  // More than one type named ⇒ this is the multi-type path, not the single one.
  if (collectTypeIds(filter).length > 1) return undefined;
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

  /* Several separate clauses ⇒ promote all of them as one any-of set.
   *
   * NOTE THIS CHANGES SEMANTICS, deliberately. Separate AND-ed clauses asked for entities carrying
   * *every* named type; the promoted `{ in: [...] }` asks for *any* of them. The old reading was
   * not merely slow, it was unsatisfiable: explore's own request asked for Topic AND Person AND a
   * third type, and in the live database **zero** entities hold all three (the most any entity
   * holds is two, and only 11 do). An always-empty predicate is also why it timed out — with no
   * matches the planner cannot stop early at LIMIT 10 and walks all 49.6M entities to prove it.
   *
   * "Every picked topic, not any of them" is a real rule for *topics* — it is not one for types. */
  const allIds = collectTypeIds(filter);
  if (allIds.length > 1) return { in: allIds };

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
 * Strip every `typeIds` clause that {@link extractTypeIdsFromFilter} promoted, at any nesting
 * depth it looked at. See `space-filter.ts`'s `removeSpaceIdsFromFilter` for the rationale.
 *
 * It must remove *all* of them, not the first. Leaving even one behind reintroduces the EXISTS
 * that the promotion exists to avoid, and it would then be AND-ed against the promoted any-of set
 * — quietly re-narrowing the result to the leftover type.
 */
export function removeTypeIdsFromFilter(filter?: EntityFilter): EntityFilter | undefined {
  if (!filter) return filter;
  return stripTypeIds(filter, 0);
}

function stripTypeIds(filter: EntityFilter, depth: number): EntityFilter | undefined {
  const next: EntityFilter = { ...filter };
  const and = next.and;
  delete next.typeIds;
  delete next.and;
  let result: EntityFilter = next;

  if (and) {
    const cleaned = and
      .map(child => (child && depth < 2 ? stripTypeIds(child, depth + 1) : child))
      .filter((child): child is EntityFilter => child != null && Object.keys(child).length > 0);

    if (cleaned.length === 1) {
      // Inline a lone survivor so the caller sees `{ name: ... }` rather than `{ and: [{ name }] }`
      // — but not if it would clobber a sibling key already present.
      const collides = Object.keys(cleaned[0]).some(k => k in result);
      result = collides ? { ...result, and: cleaned } : { ...result, ...cleaned[0] };
    } else if (cleaned.length > 1) {
      result = { ...result, and: cleaned };
    }
  }

  return Object.keys(result).length > 0 ? result : undefined;
}
