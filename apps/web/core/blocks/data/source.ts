import { IdUtils, Position, SystemIds } from '@geoprotocol/geo-sdk';
import { Match } from 'effect';

import { Filter } from '~/core/blocks/data/filters';
import { storage } from '~/core/sync/use-mutate';
import { Relation } from '~/core/v2.types';

type EntitySource = {
  type: 'RELATIONS';
  value: string; // EntityId
  name: string | null;
};

type CollectionSource = {
  type: 'COLLECTION';
  value: string;
};

type MultipleSources = {
  type: 'SPACES'; // | 'collections';
  value: Array<string>;
};

type AllOfGeoSource = {
  type: 'GEO'; // we don't care about the value since we aren't querying based on a specific space or collection
};

/**
 * Sources determine the data that is shown in a data block. Depending on the source
 * type we might be making different queries, aggregating different data, or showing
 * different UI.
 *
 */
export type Source = CollectionSource | MultipleSources | AllOfGeoSource | EntitySource;

type GetSourceArgs = {
  blockId: string;
  dataEntityRelations: Relation[];
  currentSpaceId: string;
  filterState: Filter[];
};

/**
 * Reads the relations on the data block to find the Data Source Type
 * and data source value and maps it to our local representation of the
 * {@link Source}.
 *
 * Valid data source types are:
 *  - Collection ({@link SystemIds.COLLECTION_DATA_SOURCE})
 *  - Spaces ({@link SystemIds.QUERY_DATA_SOURCE})
 *  - All of Geo ({@link SystemIds.ALL_OF_GEO_DATA_SOURCE})
 *
 * Depending on the source type we either need to later read from a single
 * collection, or generate a query.
 *
 * @param dataEntityRelations the relations coming from the data entity as
 *                              as an array of {@link Relation}
 * @returns the source of the data block with the source type and entity id(s)
 * for the type of source as a {@link Source}. If no source is found, returns
 * a fallback source with a type of Spaces containing the current space id.
 */
export function getSource({ blockId, dataEntityRelations, currentSpaceId, filterState }: GetSourceArgs): Source {
  const sourceType = dataEntityRelations.find(
    r => r.type.id === SystemIds.DATA_SOURCE_TYPE_RELATION_TYPE && !r.isDeleted
  )?.toEntity.id;

  const maybeEntityFilter = filterState.find(f => f.columnId === SystemIds.RELATION_FROM_PROPERTY);

  if (maybeEntityFilter) {
    return {
      type: 'RELATIONS',
      value: maybeEntityFilter.value,
      name: maybeEntityFilter.valueName,
    };
  }

  if (sourceType === SystemIds.COLLECTION_DATA_SOURCE) {
    // We default to using the block as the collection source. Any defined collection items
    // will point from the block itself.
    return {
      type: 'COLLECTION',
      value: blockId,
    };
  }

  if (sourceType === SystemIds.QUERY_DATA_SOURCE) {
    return {
      type: 'SPACES',
      value: filterState.filter(f => f.columnId === SystemIds.SPACE_FILTER).map(f => f.value),
    };
  }

  if (sourceType === SystemIds.ALL_OF_GEO_DATA_SOURCE) {
    return {
      type: 'GEO',
    };
  }

  return {
    type: 'SPACES',
    value: [currentSpaceId],
  };
}

/**
 * Deletes the existing source type relation and any existing sources relations.
 * Depending on the source typ there might be one or many of these relations.
 *
 * We should delete any existing source types and sources when changing source
 * types or deleting a data block.
 *
 * @param relations - The relations to delete as an array of {@link Relation}
 * @param spaceId - The space id as a {@link SpaceId}
 */
export function removeSourceType({ relations }: { relations: Relation[] }) {
  // Delete the existing source type relation. There should only be one source type
  // relation, but delete many just in case.
  const sourceTypeRelations = relations.filter(r => r.type.id === SystemIds.DATA_SOURCE_TYPE_RELATION_TYPE);

  for (const relation of sourceTypeRelations) {
    storage.relations.delete(relation);
  }
}

/**
 * A data entity can have a source representing where the data should be read from.
 * This can be a collection, a set of spaces, or all of the knowledge graph. We store
 * the source type to know how we should query the data. The rest of the data needed
 * to query comes from the filter string.
 *
 * @param source - The source to create as a {@link Source}
 * @param blockId - The id of the block that the source is associated with as an {@link EntityId}
 * @param spaceId - The space id as a {@link SpaceId}
 */
export function upsertSourceType({ source, blockId, spaceId }: { source: Source; blockId: string; spaceId: string }) {
  const newSourceType = makeRelationForSourceType(source.type, blockId, spaceId); // Source: COLLECTION | SPACES | GEO | etc.
  storage.relations.set(newSourceType);
}

/**
 * A data block has a relation representing the type of the source, either a Collection,
 * a set of Spaces, or All of Geo. This function returns the relation representing
 * the source type as a {@link StoreRelation}.
 *
 * The type of the source is represented in the knowledge graph as either {@link SystemIds.COLLECTION_DATA_SOURCE},
 * {@link SystemIds.QUERY_DATA_SOURCE}, or {@link SystemIds.ALL_OF_GEO_DATA_SOURCE}.
 *
 * In the application it's mapped to a {@link Source}.
 *
 * @param sourceType - The source type to create as a {@link Source}
 * @param blockId - The id of the block that the source is associated with
 *                  as an {@link EntityId}
 * @returns a {@link StoreRelation} representing the source type.
 */
export function makeRelationForSourceType(sourceType: Source['type'], blockId: string, spaceId: string): Relation {
  // Get the source type system id based on the source type
  const sourceTypeId = Match.value(sourceType).pipe(
    Match.when('COLLECTION', () => SystemIds.COLLECTION_DATA_SOURCE),
    Match.when('SPACES', () => SystemIds.QUERY_DATA_SOURCE),
    Match.when('GEO', () => SystemIds.ALL_OF_GEO_DATA_SOURCE),
    Match.when('RELATIONS', () => SystemIds.ALL_OF_GEO_DATA_SOURCE),
    Match.orElse(() => SystemIds.COLLECTION_DATA_SOURCE)
  );

  return {
    id: IdUtils.generate(),
    // @TODO(migration): May want to reuse existing relation entity
    entityId: IdUtils.generate(),
    spaceId: spaceId,
    position: Position.generate(),
    renderableType: 'RELATION',
    type: {
      id: SystemIds.DATA_SOURCE_TYPE_RELATION_TYPE,
      name: 'Data Source Type',
    },
    toEntity: {
      id: sourceTypeId,
      name: getSourceTypeName(sourceTypeId),
      value: sourceTypeId,
    },
    fromEntity: {
      id: blockId,
      name: null,
    },
  };
}

function getSourceTypeName(
  sourceType:
    | typeof SystemIds.COLLECTION_DATA_SOURCE
    | typeof SystemIds.QUERY_DATA_SOURCE
    | typeof SystemIds.ALL_OF_GEO_DATA_SOURCE
    | string
) {
  switch (sourceType) {
    case SystemIds.COLLECTION_DATA_SOURCE:
      return 'Collection';
    case SystemIds.QUERY_DATA_SOURCE:
      return 'Spaces';
    case SystemIds.ALL_OF_GEO_DATA_SOURCE:
      return 'All of Geo';
    default:
      return null;
  }
}
