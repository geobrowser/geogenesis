import type { TypedDocumentNode } from '@graphql-typed-document-node/core';

import { Effect } from 'effect';
import { parse } from 'graphql';

import type { EntityFilter, UuidFilter } from '~/core/gql/graphql';
import { convertWhereConditionToEntityFilter } from '~/core/io/converters';
import { graphql } from '~/core/io/graphql-client';
import {
  extractSingleSpaceIdFromFilter,
  extractSpaceIdsFromFilter,
  removeSpaceIdsFromFilter,
} from '~/core/io/space-filter';
import {
  extractSingleTypeIdFromFilter,
  extractTypeIdsFromFilter,
  removeTypeIdsFromFilter,
} from '~/core/io/type-filter';
import type { WhereCondition } from '~/core/sync/experimental_query-layer';

export type DropdownOption = { id: string; name: string | null };

/**
 * Options are derived from a bounded sample of the table's population. The
 * API cannot execute a nested `relations(fromEntity: <filter>)` query in
 * reasonable time, so the population's ids are fetched first — through the
 * same normalized connection query the table itself runs — and the property's
 * relations are then read by `fromEntityId`, which is indexed and fast.
 */
export const DROPDOWN_OPTIONS_POPULATION_WINDOW = 200;
export const DROPDOWN_OPTIONS_RELATION_WINDOW = 1000;

type PopulationIdsResult = { entitiesConnection: { nodes: { id: string }[] } | null };
type PopulationIdsVariables = {
  filter?: EntityFilter | null;
  spaceId?: string | null;
  spaceIds?: UuidFilter | null;
  typeId?: string | null;
  typeIds?: UuidFilter | null;
  first: number;
};

const POPULATION_IDS_DOCUMENT = parse(/* GraphQL */ `
  query DropdownOptionsPopulation(
    $filter: EntityFilter
    $spaceId: UUID
    $spaceIds: UUIDFilter
    $typeId: UUID
    $typeIds: UUIDFilter
    $first: Int
  ) {
    entitiesConnection(
      filter: $filter
      spaceId: $spaceId
      spaceIds: $spaceIds
      typeId: $typeId
      typeIds: $typeIds
      first: $first
    ) {
      nodes {
        id
      }
    }
  }
`) as unknown as TypedDocumentNode<PopulationIdsResult, PopulationIdsVariables>;

type DropdownOptionsResult = {
  relations: { toEntity: { id: string; name: string | null } | null }[] | null;
};
type DropdownOptionsVariables = { propertyId: string; fromEntityIds: string[]; first: number };

const DROPDOWN_OPTIONS_DOCUMENT = parse(/* GraphQL */ `
  query DropdownOptions($propertyId: UUID!, $fromEntityIds: [UUID!], $first: Int) {
    relations(
      filter: { typeId: { is: $propertyId }, fromEntityId: { in: $fromEntityIds } }
      first: $first
      orderBy: TO_ENTITY_ID_ASC
    ) {
      toEntity {
        id
        name
      }
    }
  }
`) as unknown as TypedDocumentNode<DropdownOptionsResult, DropdownOptionsVariables>;

/**
 * Same promotion as `core/io/queries.ts`: space/type constraints move to the
 * top-level connection arguments (the indexed path) and leave the filter.
 */
export function populationVariablesFromWhere(where: WhereCondition, first: number): PopulationIdsVariables {
  const filter = Object.keys(where).length === 0 ? undefined : convertWhereConditionToEntityFilter(where);
  const spaceId = extractSingleSpaceIdFromFilter(filter);
  const spaceIds = spaceId ? undefined : extractSpaceIdsFromFilter(filter);
  const typeId = extractSingleTypeIdFromFilter(filter);
  const typeIds = typeId ? undefined : extractTypeIdsFromFilter(filter);

  let normalized = filter;
  if (spaceId || spaceIds) normalized = removeSpaceIdsFromFilter(normalized);
  if (typeId || typeIds) normalized = removeTypeIdsFromFilter(normalized);

  return {
    filter: normalized ?? null,
    spaceId: spaceId ?? null,
    spaceIds: spaceIds ?? null,
    typeId: typeId ?? null,
    typeIds: typeIds ?? null,
    first,
  };
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
 * The to-entities that actually occur for `propertyId` across the entities
 * matching `where` (the block's filter, minus that property). This is the
 * vocabulary a browse-mode dropdown offers — "what values exist in this table
 * for this property" — rather than a declared type list, which space-local
 * properties often don't have.
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
    Effect.gen(function* () {
      const population = yield* graphql({
        query: POPULATION_IDS_DOCUMENT,
        decoder: (data: PopulationIdsResult) => (data.entitiesConnection?.nodes ?? []).map(node => node.id),
        variables: populationVariablesFromWhere(where, DROPDOWN_OPTIONS_POPULATION_WINDOW),
        signal,
      });

      if (population.length === 0) return [];

      return yield* graphql({
        query: DROPDOWN_OPTIONS_DOCUMENT,
        decoder: toDropdownOptions,
        variables: { propertyId, fromEntityIds: population, first: DROPDOWN_OPTIONS_RELATION_WINDOW },
        signal,
      });
    })
  );
}
