import { SYSTEM_IDS } from '@geogenesis/sdk';
import { INITIAL_COLLECTION_ITEM_INDEX_VALUE } from '@geogenesis/sdk/constants';
import { Match } from 'effect';

import { StoreRelation } from '~/core/database/types';
import { DB } from '~/core/database/write';
import { EntityId, SpaceId } from '~/core/io/schema';
import { Relation } from '~/core/types';

import { Source } from './types';

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
export function getSource(blockId: string, dataEntityRelations: Relation[], currentSpaceId: SpaceId): Source {
  const sourceType = dataEntityRelations.find(r => r.typeOf.id === SYSTEM_IDS.DATA_SOURCE_TYPE_RELATION_TYPE)?.toEntity
    .id;

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
      value: dataEntityRelations
        .filter(r => r.typeOf.id === SYSTEM_IDS.DATA_SOURCE_ATTRIBUTE)
        .map(r => SpaceId(r.toEntity.id)),
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
export function removeSources({ relations, spaceId }: { relations: Relation[]; spaceId: SpaceId }) {
  // Delete the existing source type relation. There should only be one source type
  // relation, but delete many just in case.
  const sourceTypeRelations = relations.filter(r => r.typeOf.id === SYSTEM_IDS.DATA_SOURCE_TYPE_RELATION_TYPE);
  // Delete the existing sources relations. There might be one or many of these depending
  // on the source type.
  const sourceRelations = relations.filter(r => r.typeOf.id === SYSTEM_IDS.DATA_SOURCE_ATTRIBUTE);

  // @TODO(relations): Remove many
  for (const relation of [...sourceRelations, ...sourceTypeRelations]) {
    DB.removeRelation({
      relationId: relation.id,
      spaceId,
    });
  }
}

/**
 * A data entity can have a source representing where the data should be read from.
 * This can be a collection, a set of spaces, or all of the knowledge graph. The
 * source in the knowledge graph is represented as relations. In this application
 * the source is represented as a {@link Source} .
 *
 * Creating a source requires the following steps:
 * 1. Create the relation representing the type of the source, whether it's a collection,
 *    a set of spaces, or all of the knowledge graph.
 * 2. Create the relations representing the entities that are part of the source.
 *
 * @param source - The source to create as a {@link Source}
 * @param blockId - The id of the block that the source is associated with as an {@link EntityId}
 * @param spaceId - The space id as a {@link SpaceId}
 */
export function upsertSource({ source, blockId, spaceId }: { source: Source; blockId: EntityId; spaceId: SpaceId }) {
  const newSourceType = makeRelationForSourceType(source.type, blockId, spaceId); // Source: COLLECTION | SPACES | GEO | etc.
  const newSources = makeRelationsForSourceEntities(source, blockId, spaceId); // Source ids: SpaceId[] | CollectionId | GeoId

  for (const relation of [newSourceType, ...newSources]) {
    DB.upsertRelation({
      relation: relation,
      spaceId,
    });
  }
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
    Match.orElse(() => SYSTEM_IDS.COLLECTION_DATA_SOURCE)
  );

  return {
    space: spaceId,
    index: INITIAL_COLLECTION_ITEM_INDEX_VALUE,
    typeOf: {
      id: EntityId(SYSTEM_IDS.DATA_SOURCE_TYPE_RELATION_TYPE),
      name: 'Data Source Type',
    },
    toEntity: {
      id: EntityId(sourceTypeId),
      renderableType: 'RELATION',
      name: null,
      value: EntityId(sourceTypeId),
    },
    fromEntity: {
      id: EntityId(blockId),
      name: null,
    },
  };
}

/**
 * A data block has multiple data sources depending on the source type.
 *
 * - If the source type is a collection, the data source is the collection id.
 * - If the source type is a query, the data source one or more space ids.
 * - If the source type is all of geo, the data source is the all of geo id.
 *
 * This function returns the relations representing the data sources
 * as an array of {@link StoreRelation}.
 *
 * @param source - The source to create as a {@link Source}
 * @param blockId - The id of the block that the source is associated with
 *                  as an {@link EntityId}
 * @returns an array of {@link StoreRelation} representing the data sources.
 */
function makeRelationsForSourceEntities(source: Source, blockId: EntityId, spaceId: string): StoreRelation[] {
  if (source.type === 'COLLECTION') {
    return [
      // Set the new collection as a data source. This points from the block entity to
      // the collection entity.
      makeRelationForSource(EntityId(source.value), blockId, spaceId),
    ];
  }

  if (source.type === 'SPACES') {
    return source.value.map(spaceId => {
      return makeRelationForSource(EntityId(spaceId), blockId, spaceId);
    });
  }

  return [makeRelationForSource(EntityId(SYSTEM_IDS.ALL_OF_GEO_DATA_SOURCE), blockId, spaceId)];
}

/**
 * Returns a {@link StoreRelation} representing a data source for an arbitrary
 * source id and a data block id.
 *
 * @param sourceId the id of the source entity as an {@link EntityId}
 * @param blockId the id of the data block as an {@link EntityId}
 * @returns a {@link StoreRelation} representing a data source.
 */
export function makeRelationForSource(sourceId: EntityId, blockId: EntityId, spaceId: string): StoreRelation {
  // Set the new collection as a data source. This points from the block entity to
  // the collection entity.
  return {
    space: spaceId,
    index: INITIAL_COLLECTION_ITEM_INDEX_VALUE,
    typeOf: {
      id: EntityId(SYSTEM_IDS.DATA_SOURCE_ATTRIBUTE),
      name: 'Data Source',
    },
    toEntity: {
      id: EntityId(sourceId),
      renderableType: 'DATA',
      name: null,
      value: EntityId(sourceId),
    },
    fromEntity: {
      id: EntityId(blockId),
      name: null,
    },
  };
}
