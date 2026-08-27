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

/** Field names selected directly on the entity in a query, ignoring nesting and fragments. */
function entityFieldNames(document: unknown): Set<string> {
  const names = new Set<string>();

  const walk = (node: FieldNode, depth: number) => {
    for (const selection of node.selectionSet?.selections ?? []) {
      if (selection.kind === 'Field' && selection.name) {
        // Depth 2 is the entity's own fields: query -> entities/entity -> here.
        // Alias first: the routing projections are selected as `allValuesList: valuesList(...)`,
        // so the underlying field name is not what a consumer sees.
        if (depth >= 1) names.add(selection.alias?.value ?? selection.name.value);
        walk(selection, depth + 1);
      }
    }
  };

  for (const definition of (document as { definitions: FieldNode[] }).definitions) {
    if (definition.kind === 'OperationDefinition') walk(definition, 0);
  }

  return names;
}

describe('EntitiesBatch carries what store consumers read', () => {
  const batchFields = entityFieldNames(entitiesBatchQuery);
  const singularFields = entityFieldNames(entityQuery);

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
    expect(batchFields.has('relations')).toBe(true);
  });

  it('is not missing a scalar the singular query supplies', () => {
    // A drift check rather than a fixed list: if the singular Entity query gains a scalar the store
    // might read, this fails and someone decides deliberately whether the batch needs it too.
    const singularScalars = ['id', 'name', 'description', 'spaceIds', 'createdAt', 'updatedAt'];
    const missing = singularScalars.filter(field => singularFields.has(field) && !batchFields.has(field));

    expect(missing).toEqual([]);
  });
});
