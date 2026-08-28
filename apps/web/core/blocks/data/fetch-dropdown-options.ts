import type { TypedDocumentNode } from '@graphql-typed-document-node/core';

import { Effect } from 'effect';
import { parse } from 'graphql';

import type { UuidFilter } from '~/core/gql/graphql';
import { graphql } from '~/core/io/graphql-client';
import type { WhereCondition } from '~/core/sync/experimental_query-layer';

export type DropdownOption = { id: string; name: string | null };

/**
 * Relations are fetched, not entities: one property can point at the same
 * to-entity from many rows, so the window is sized for relations and then
 * collapsed to distinct to-entities.
 */
export const DROPDOWN_OPTIONS_RELATION_WINDOW = 1000;

type DropdownOptionsResult = {
  relations: { toEntity: { id: string; name: string | null } | null }[] | null;
};
type DropdownOptionsVariables = { propertyId: string; spaceIds?: UuidFilter | null; first: number };

/**
 * Every value the property is used with in the block's spaces. Scoping by
 * the relation's space is the indexed path; scoping by a nested entity
 * filter is not (it times out), and sampling the table's population misses
 * rarely-used values. A superset of the table's own rows is fine here: the
 * dropdown exists to widen or narrow a personal view.
 */
const DROPDOWN_OPTIONS_DOCUMENT = parse(/* GraphQL */ `
  query DropdownOptions($propertyId: UUID!, $spaceIds: UUIDFilter, $first: Int) {
    relations(filter: { typeId: { is: $propertyId }, spaceId: $spaceIds }, first: $first) {
      toEntity {
        id
        name
      }
    }
  }
`) as unknown as TypedDocumentNode<DropdownOptionsResult, DropdownOptionsVariables>;

/** The block's space scope, as a relation `spaceId` filter; undefined when the block is unscoped. */
export function spaceIdsFromWhere(where: WhereCondition): UuidFilter | undefined {
  const ids = new Set<string>();
  const visit = (condition: WhereCondition) => {
    for (const space of condition.spaces ?? []) if (space.equals) ids.add(space.equals);
    for (const child of condition.AND ?? []) visit(child);
    for (const child of condition.OR ?? []) visit(child);
  };
  visit(where);
  if (ids.size === 0) return undefined;
  const list = [...ids];
  return list.length === 1 ? ({ is: list[0] } as UuidFilter) : ({ in: list } as UuidFilter);
}

/** Distinct to-entities, name-sorted; a later relation never overwrites a known name with null. */
export function toDropdownOptions(result: DropdownOptionsResult): DropdownOption[] {
  const byId = new Map<string, DropdownOption>();
  for (const relation of result.relations ?? []) {
    const target = relation.toEntity;
    if (!target?.id) continue;
    const existing = byId.get(target.id);
    if (!existing || (!existing.name && target.name)) {
      byId.set(target.id, { id: target.id, name: target.name ?? null });
    }
  }
  return [...byId.values()].sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));
}

/**
 * The to-entities `propertyId` is used with across the block's spaces (the
 * spaces come from `where`, the block's filter). This is the vocabulary a
 * browse-mode dropdown offers — "what values exist for this property here" —
 * rather than a declared type list, which space-local properties often lack.
 */
export function fetchDropdownOptions({
  propertyId,
  where,
  signal,
}: {
  propertyId: string;
  where: WhereCondition;
  signal?: AbortSignal;
}): Promise<DropdownOption[]> {
  return Effect.runPromise(
    graphql({
      query: DROPDOWN_OPTIONS_DOCUMENT,
      decoder: toDropdownOptions,
      variables: {
        propertyId,
        spaceIds: spaceIdsFromWhere(where) ?? null,
        first: DROPDOWN_OPTIONS_RELATION_WINDOW,
      },
      signal,
    })
  );
}
