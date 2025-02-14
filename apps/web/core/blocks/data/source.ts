import { SYSTEM_IDS } from '@graphprotocol/grc-20';
import { INITIAL_RELATION_INDEX_VALUE } from '@graphprotocol/grc-20/constants';
import { Match } from 'effect';

import { Filter } from '~/core/blocks/data/filters';
import { StoreRelation } from '~/core/database/types';
import { DB } from '~/core/database/write';
import { EntityId, SpaceId } from '~/core/io/schema';
import { Relation } from '~/core/types';

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
  value: Array<SpaceId>;
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
  blockId: EntityId;
  dataEntityRelations: Relation[];
  currentSpaceId: SpaceId;
  filterState: Filter[];
};

/**
 * Reads the relations on the data block to find the Data Source Type
 * and data source value and maps it to our local representation of the
 * {@link Source}.
 *
 * Valid data source types are:
 *  - Collection ({@link SYSTEM_IDS.COLLECTION_DATA_SOURCE})
 *  - Spaces ({@link SYSTEM_IDS.QUERY_DATA_SOURCE})
 *  - All of Geo ({@link SYSTEM_IDS.ALL_OF_GEO_DATA_SOURCE})
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
  const sourceType = dataEntityRelations.find(r => r.typeOf.id === SYSTEM_IDS.DATA_SOURCE_TYPE_RELATION_TYPE)?.toEntity
    .id;

  const maybeEntityFilter = filterState.find(f => f.columnId === SYSTEM_IDS.RELATION_FROM_ATTRIBUTE);

  if (maybeEntityFilter) {
    return {
      type: 'RELATIONS',
      value: maybeEntityFilter.value,
      name: maybeEntityFilter.valueName,
    };
  }

  if (sourceType === SYSTEM_IDS.COLLECTION_DATA_SOURCE) {
    // We default to using the block as the collection source. Any defined collection items
    // will point from the block itself.
    return {
      type: 'COLLECTION',
      value: blockId,
    };
  }

  if (sourceType === SYSTEM_IDS.QUERY_DATA_SOURCE) {
    return {
      type: 'SPACES',
      value: filterState.filter(f => f.columnId === SYSTEM_IDS.SPACE_FILTER).map(f => SpaceId(f.value)),
    };
  }

  if (sourceType === SYSTEM_IDS.ALL_OF_GEO_DATA_SOURCE) {
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
export function removeSourceType({
  relations,
  spaceId,
  entityId,
}: {
  relations: Relation[];
  spaceId: SpaceId;
  entityId: EntityId;
}) {
  // Delete the existing source type relation. There should only be one source type
  // relation, but delete many just in case.
  const sourceTypeRelations = relations.filter(r => r.typeOf.id === SYSTEM_IDS.DATA_SOURCE_TYPE_RELATION_TYPE);

  for (const relation of sourceTypeRelations) {
    DB.removeRelation({
      relationId: relation.id,
      fromEntityId: entityId,
      spaceId,
    });
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
export function upsertSourceType({
  source,
  blockId,
  spaceId,
}: {
  source: Source;
  blockId: EntityId;
  spaceId: SpaceId;
}) {
  const newSourceType = makeRelationForSourceType(source.type, blockId, spaceId); // Source: COLLECTION | SPACES | GEO | etc.
  DB.upsertRelation({
    relation: newSourceType,
    spaceId,
  });
}

/**
 * A data block has a relation representing the type of the source, either a Collection,
 * a set of Spaces, or All of Geo. This function returns the relation representing
 * the source type as a {@link StoreRelation}.
 *
 * The type of the source is represented in the knowledge graph as either {@link SYSTEM_IDS.COLLECTION_DATA_SOURCE},
 * {@link SYSTEM_IDS.QUERY_DATA_SOURCE}, or {@link SYSTEM_IDS.ALL_OF_GEO_DATA_SOURCE}.
 *
 * In the application it's mapped to a {@link Source}.
 *
 * @param sourceType - The source type to create as a {@link Source}
 * @param blockId - The id of the block that the source is associated with
 *                  as an {@link EntityId}
 * @returns a {@link StoreRelation} representing the source type.
 */
export function makeRelationForSourceType(
  sourceType: Source['type'],
  blockId: EntityId,
  spaceId: string
): StoreRelation {
  // Get the source type system id based on the source type
  const sourceTypeId = Match.value(sourceType).pipe(
    Match.when('COLLECTION', () => SYSTEM_IDS.COLLECTION_DATA_SOURCE),
    Match.when('SPACES', () => SYSTEM_IDS.QUERY_DATA_SOURCE),
    Match.when('GEO', () => SYSTEM_IDS.ALL_OF_GEO_DATA_SOURCE),
    Match.when('RELATIONS', () => SYSTEM_IDS.ALL_OF_GEO_DATA_SOURCE),
    Match.orElse(() => SYSTEM_IDS.COLLECTION_DATA_SOURCE)
  );

  return {
    space: spaceId,
    index: INITIAL_RELATION_INDEX_VALUE,
    typeOf: {
      id: EntityId(SYSTEM_IDS.DATA_SOURCE_TYPE_RELATION_TYPE),
      name: 'Data Source Type',
    },
    toEntity: {
      id: EntityId(sourceTypeId),
      renderableType: 'RELATION',
      name: getSourceTypeName(sourceTypeId),
      value: EntityId(sourceTypeId),
    },
    fromEntity: {
      id: EntityId(blockId),
      name: null,
    },
  };
}

function getSourceTypeName(
  sourceType:
    | typeof SYSTEM_IDS.COLLECTION_DATA_SOURCE
    | typeof SYSTEM_IDS.QUERY_DATA_SOURCE
    | typeof SYSTEM_IDS.ALL_OF_GEO_DATA_SOURCE
    | string
) {
  switch (sourceType) {
    case SYSTEM_IDS.COLLECTION_DATA_SOURCE:
      return 'Collection';
    case SYSTEM_IDS.QUERY_DATA_SOURCE:
      return 'Spaces';
    case SYSTEM_IDS.ALL_OF_GEO_DATA_SOURCE:
      return 'All of Geo';
    default:
      return null;
  }
}
