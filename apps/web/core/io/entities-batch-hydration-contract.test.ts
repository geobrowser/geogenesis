import { describe, expect, it } from 'vitest';

import { entitiesBatchQuery, entityQuery } from './query-fragments';

/**
 * `EntitiesBatch` hydrates the sync store now — `useHydrateEntity` batches through it rather than
 * fetching one entity at a time with the singular `Entity` query. That makes its selection set a
 * contract, not a detail: anything the singular query supplied and this one doesn't, store
 * consumers see as missing.
 *
 * The failure mode is why this is a test rather than a comment. A consumer reading a timestamp off
 * the store treats absence as "not loaded" and falls back to its own per-row `getEntity` — which is
 * exactly the N+1 this batching removes, reintroduced. Nothing errors, and it only shows up on
 * surfaces that render such a consumer: `use-block-explore-feed-item` renders when a data block is
 * in EXPLORE view, so the pages used to measure this change never exercised it and the request
 * counts looked unaffected.
 */

type FieldNode = {
  kind: string;
  name?: { value: string };
  alias?: { value: string };
  selectionSet?: { selections: FieldNode[] };
};

/** Field names selected directly on the entity, keyed to what a consumer sees (alias wins). */
function entityFieldNames(document: unknown): Set<string> {
  const names = new Set<string>();

  const walk = (node: FieldNode, depth: number) => {
    for (const selection of node.selectionSet?.selections ?? []) {
      if (selection.kind === 'Field' && selection.name) {
        // Exactly depth 1 — the entity's own fields: query -> entities/entity -> here. `>= 1` also
        // swept in nested selections, so `types { id }` could stand in for a missing top-level
        // `id` and the drift check below would pass while the field was gone.
        //
        // Alias first: the routing projections are selected as `allValuesList: valuesList(...)`,
        // so the underlying field name is not what a consumer sees.
        if (depth === 1) names.add(selection.alias?.value ?? selection.name.value);
        walk(selection, depth + 1);
      }
    }
  };

  for (const definition of (document as { definitions: FieldNode[] }).definitions) {
    if (definition.kind === 'OperationDefinition') walk(definition, 0);
  }

  return names;
}

/** Leaf fields at depth 1 — the entity's own scalars, excluding anything with a sub-selection. */
function entityScalarNames(document: unknown): Set<string> {
  const names = new Set<string>();

  const walk = (node: FieldNode, depth: number) => {
    for (const selection of node.selectionSet?.selections ?? []) {
      if (selection.kind !== 'Field' || !selection.name) continue;
      if (depth === 1 && !selection.selectionSet) names.add(selection.alias?.value ?? selection.name.value);
      walk(selection, depth + 1);
    }
  };

  for (const definition of (document as { definitions: FieldNode[] }).definitions) {
    if (definition.kind === 'OperationDefinition') walk(definition, 0);
  }

  return names;
}

/** Whether a direct entity field selects a given sub-field, e.g. `relations { totalCount }`. */
function selectsNested(document: unknown, parent: string, child: string): boolean {
  let found = false;

  const walk = (node: FieldNode, depth: number) => {
    for (const selection of node.selectionSet?.selections ?? []) {
      if (selection.kind !== 'Field' || !selection.name) continue;
      const name = selection.alias?.value ?? selection.name.value;
      if (depth === 1 && name === parent) {
        for (const sub of selection.selectionSet?.selections ?? []) {
          if (sub.kind === 'Field' && (sub.alias?.value ?? sub.name?.value) === child) found = true;
        }
      }
      walk(selection, depth + 1);
    }
  };

  for (const definition of (document as { definitions: FieldNode[] }).definitions) {
    if (definition.kind === 'OperationDefinition') walk(definition, 0);
  }

  return found;
}

describe('EntitiesBatch carries what store consumers read', () => {
  const batchFields = entityFieldNames(entitiesBatchQuery);

  it('selects the timestamps, so nothing falls back to a per-row fetch for one', () => {
    // Dropping these is silent: the store just has no timestamp, and consumers refetch per row.
    expect(batchFields.has('createdAt')).toBe(true);
    expect(batchFields.has('updatedAt')).toBe(true);
  });

  it('selects the routing projection, so links do not point at hidden-only spaces', () => {
    // `EntityDtoLive` only strips hidden-only spaces when it has both, and falls back to the raw
    // spaceIds otherwise — also silent.
    expect(batchFields.has('allValuesList')).toBe(true);
    expect(batchFields.has('allRelationsList')).toBe(true);
  });

  it('selects the relation count, so truncation past the page cap is detectable', () => {
    // Without it `relationsTotalCount` is undefined, no entity ever looks truncated, and the
    // top-up never runs. That shipped once already.
    // The nested field, not just the parent: leaving `relations` while dropping `totalCount` would
    // keep a `has('relations')` assertion green while every top-up silently stopped running.
    expect(selectsNested(entitiesBatchQuery, 'relations', 'totalCount')).toBe(true);
  });

  it('is not missing a scalar the singular query supplies', () => {
    /**
     * Derived from the singular query's own AST rather than a hard-coded list. A fixed list only
     * covers the fields someone thought to write down: add a scalar to `entityQuery` and it would
     * be absent from the list, so `missing` stays empty and the drift goes unnoticed — which is the
     * failure this check exists to prevent.
     */
    const singularScalars = [...entityScalarNames(entityQuery)];
    expect(singularScalars.length).toBeGreaterThan(3);

    const missing = singularScalars.filter(field => !batchFields.has(field));

    expect(missing).toEqual([]);
  });
});
