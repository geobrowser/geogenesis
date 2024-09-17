import { SYSTEM_IDS } from '@geogenesis/sdk';
import { Effect } from 'effect';
import * as db from 'zapatos/db';
import type * as Schema from 'zapatos/schema';

import { type BlockEvent } from '../../types';
import { pool } from '../../utils/pool';
import { retryEffect } from '../../utils/retry-effect';
import { type OpWithCreatedBy } from './map-triples';
import { EntitySpaces, SpaceMetadata, Triples, Types } from '~/sink/db';
import { Relations } from '~/sink/db/relations';

interface PopulateTriplesArgs {
  schemaTriples: OpWithCreatedBy[];
  block: BlockEvent;
}

function populateEntityNames(schemaTriples: OpWithCreatedBy[], block: BlockEvent) {
  return Effect.gen(function* (_) {
    const lastNameOpsByEntityId = schemaTriples
      .filter(t => t.triple.attribute_id === SYSTEM_IDS.NAME)
      .reduce((acc, op) => {
        acc.set(op.triple.entity_id.toString(), op);
        return acc;
      }, new Map<string, OpWithCreatedBy>());

    // @TODO: In the case of a delete we need to check if there's another triple
    // with the name triple for that entity id and set the name to that
    const entities = [...lastNameOpsByEntityId.values()].map(op => {
      return {
        id: op.triple.entity_id,
        name: op.triple.text_value,
        created_by_id: op.createdById,
        created_at: block.timestamp,
        created_at_block: block.blockNumber,
        updated_at: block.timestamp,
        updated_at_block: block.blockNumber,
      } satisfies Schema.entities.Insertable;
    });

    yield* _(
      Effect.tryPromise({
        try: () =>
          db
            .upsert('entities', entities, 'id', {
              updateColumns: ['name', 'updated_at', 'updated_at_block', 'created_by_id'],
              noNullUpdateColumns: ['description'],
            })
            .run(pool),
        catch: error => new Error(`Failed to create name for entities. ${(error as Error).message}`),
      })
    );
  });
}

function populateEntityDescriptions(schemaTriples: OpWithCreatedBy[], block: BlockEvent) {
  return Effect.gen(function* (_) {
    const lastNameOpsByEntityId = schemaTriples
      .filter(t => t.triple.attribute_id === SYSTEM_IDS.DESCRIPTION)
      .reduce((acc, op) => {
        acc.set(op.triple.entity_id.toString(), op);
        return acc;
      }, new Map<string, OpWithCreatedBy>());

    const entities = [...lastNameOpsByEntityId.values()].map(op => {
      return {
        id: op.triple.entity_id,
        description: op.triple.text_value,
        created_by_id: op.createdById,
        created_at: block.timestamp,
        created_at_block: block.blockNumber,
        updated_at: block.timestamp,
        updated_at_block: block.blockNumber,
      } satisfies Schema.entities.Insertable;
    });

    yield* _(
      Effect.tryPromise({
        try: () =>
          db
            .upsert('entities', entities, 'id', {
              updateColumns: ['description', 'updated_at', 'updated_at_block', 'created_by_id'],
              noNullUpdateColumns: ['name'],
            })
            .run(pool),
        catch: error => new Error(`Failed to create name for entities. ${(error as Error).message}`),
      })
    );
  });
}

/**
 * Handles writing triples to the database. At this point any triples from previous versions
 * of an entity are already part of the schemaTriples list, so this function just writes them.
 */
export function populateTriples({ schemaTriples, block }: PopulateTriplesArgs) {
  return Effect.gen(function* (_) {
    yield* _(
      Effect.tryPromise({
        try: () =>
          Triples.upsert(
            schemaTriples.filter(t => t.op === 'SET_TRIPLE').map(op => op.triple),
            { chunked: true }
          ),
        catch: error => new Error(`Failed to insert bulk triples. ${(error as Error).message}`),
      })
    );

    // Update the names and descriptions of the entities in this block
    // @TODO: Name and description should be written into the version and not the entity
    yield* _(Effect.all([populateEntityNames(schemaTriples, block), populateEntityDescriptions(schemaTriples, block)]));

    /**
     * Changes to data in Geo are modeled as "operations (ops)." You can create a triple or delete a triple.
     *
     * Set operations applied to a given triple are considered "upserts." Additionally, a triple is unique for
     * a given database by its (Space, Entity, Attribute) id tuple.
     */
    // for (const { op, triple, createdById } of schemaTriples) {
    //   const isUpsertTriple = op === 'SET_TRIPLE';
    //   const isDeleteTriple = op === 'DELETE_TRIPLE';

    //   const isAddTypeViaTriple = triple.attribute_id === SYSTEM_IDS.TYPES && isUpsertTriple && triple.entity_value_id;
    //   const isDeleteTypeViaTriple = triple.attribute_id === SYSTEM_IDS.TYPES && isDeleteTriple;

    //   const isStringValueType = triple.value_type === 'TEXT';

    //   /**
    //    * @TODO(bug): There's a bug here where we might create a triple_version for a triple that gets
    //    * deleted later on in the same actions processing loop. If we squash ahead of time this
    //    * shouldn't be an issue.
    //    */
    //   if (isUpsertTriple) {
    //     yield* _(upsertEntitySpace({ space_id: triple.space_id, entity_id: triple.entity_id }), retryEffect);
    //   }

    //   /**
    //    * We don't delete triples. Instead we store all triples ever created over time. We need
    //    * to track these so we can look at historical state for entities. We do remove them from
    //    * any new versions.
    //    *
    //    * Here we remove the triple from the current if it was deleted.
    //    */
    //   if (isDeleteTriple) {
    //     /**
    //      * If the deleted triple is the last triple for an entity in a space, we need to delete
    //      * the entity space from the public.entity_spaces table.
    //      */
    //     yield* _(maybeDeleteEntitySpace({ space_id: triple.space_id, entity_id: triple.entity_id }), retryEffect);
    //   }

    //   /**
    //    * If an entity has a type added to it then there are several side-effects we need to trigger.
    //    * There's probably a better way to do this in SQL using triggers
    //    */
    //   if (isAddTypeViaTriple) {
    //     yield* _(upsertEntityType(triple, block), retryEffect);

    //     // Relations are given types: Relation as a triple instead of a relation. This is to avoid
    //     // a recursive entity creation loop if we try to add a relation to a relation entity.
    //     if (triple.entity_value_id === SYSTEM_IDS.RELATION_TYPE) {
    //       const schemaRelation = getRelationTriplesFromSchemaTriples(schemaTriples, triple.entity_id.toString());

    //       // If we have a valid relation entity, we add it to the public.relations table.
    //       // if (schemaRelation) {
    //       //   yield* _(upsertRelation(schemaRelation), retryEffect);

    //       //   // Write any relations with Relation type -> Types to the types table
    //       //   if (schemaRelation.type_of_id === SYSTEM_IDS.TYPES) {
    //       //     yield* _(upsertEntityTypeViaRelation(schemaRelation, block), retryEffect);

    //       //     // Additionally, if this relation defines a type of space configuration we add it to the
    //       //     // public.spaces_metadata table.
    //       //     if (schemaRelation.to_entity_id === SYSTEM_IDS.SPACE_CONFIGURATION) {
    //       //       yield* _(upsertSpaceMetadata(schemaRelation, triple.space_id.toString()), retryEffect);
    //       //     }
    //       //   }
    //       // }
    //     }

    //     // Update the relation row if we change any of the values. At this point the
    //     // triple has already been inserted, we just need to update the relation itself
    //     // with the new relation values.
    //     //
    //     // Currently (Aug 05, 2024) only the index changes ad-hoc. The other triples are
    //     // only ever created or deleted at the time of creating or deleting the entire relation.
    //     if (triple.attribute_id === SYSTEM_IDS.RELATION_INDEX) {
    //       yield* _(updateRelationIndex(triple), retryEffect);
    //     }
    //   }

    //   /**
    //    * If an entity has a type removed from it then there are several side-effects we need to trigger.
    //    *
    //    * There's probably a better way to do this in SQL with triggers.
    //    */
    //   if (isDeleteTypeViaTriple) {
    //     yield* _(deleteEntityType(triple), retryEffect);

    //     // If the deleted type is a Relation then we need to remove it from the public.relations table.
    //     if (triple.entity_value_id === SYSTEM_IDS.RELATION_TYPE) {
    //       const relation = yield* _(Effect.promise(() => Relations.selectOne({ id: triple.entity_id })));

    //       if (!relation) {
    //         slog({
    //           message: `Failed to find relation with id ${triple.entity_id}`,
    //           requestId: block.requestId,
    //           level: 'error',
    //         });

    //         continue;
    //       }

    //       yield* _(deleteRelation(relation.id), retryEffect);

    //       // If the relation defines a type for an entity we need to delete that type from the public.entity_types table.
    //       if (relation?.type_of_id === SYSTEM_IDS.TYPES) {
    //         yield* _(deleteEntityTypeViaRelation(relation), retryEffect);

    //         // If the type is space configuration we need to delete it from the public.spaces_metadata table.
    //         if (relation.to_entity_id === SYSTEM_IDS.SPACE_CONFIGURATION) {
    //           yield* _(deleteSpaceMetadata(relation, triple.space_id.toString()), retryEffect);
    //         }
    //       }
    //     }
    //   }
    // }
  });
}

/**
 * Handle creating the database representation of a collection item when a new collection item
 * is created. We need to gather all of the required triples to fully flesh out the collection
 * item's data. We could do this linearly, but we want to ensure that all of the properties
 * exist before creating the item. If not all properties exist we don't create the collection
 * item.
 */
function getRelationTriplesFromSchemaTriples(
  schemaTriples: OpWithCreatedBy[],
  entityId: string
): Schema.relations.Insertable | null {
  // Grab other triples in this edit that match the collection item's entity id. We
  // want to add all of the collection item properties to the item in the
  // collection_items table.
  const otherTriples = schemaTriples.filter(t => t.triple.entity_id === entityId && t.op === 'SET_TRIPLE');

  const collectionItemIndex = otherTriples.find(t => t.triple.attribute_id === SYSTEM_IDS.RELATION_INDEX);
  const to = otherTriples.find(t => t.triple.attribute_id === SYSTEM_IDS.RELATION_TO_ATTRIBUTE);
  const from = otherTriples.find(t => t.triple.attribute_id === SYSTEM_IDS.RELATION_FROM_ATTRIBUTE);
  const type = otherTriples.find(t => t.triple.attribute_id === SYSTEM_IDS.RELATION_TYPE_ATTRIBUTE);

  const indexValue = collectionItemIndex?.triple.text_value;
  const toId = to?.triple.entity_value_id;
  const fromId = from?.triple.entity_value_id;
  const typeId = type?.triple.entity_value_id;

  if (!indexValue || !toId || !fromId || !typeId) {
    return null;
  }

  return {
    id: entityId,
    to_version_id: toId.toString(),
    from_version_id: fromId.toString(),
    entity_id: entityId,
    type_of_id: typeId.toString(),
    index: indexValue,
  };
}

function upsertEntitySpace({ space_id, version_id }: Schema.entity_spaces.Insertable) {
  return Effect.gen(function* (_) {
    const insertEntitySpaceEffect = Effect.tryPromise({
      try: () => EntitySpaces.upsert([{ space_id, version_id }]),
      catch: error =>
        new Error(
          `Failed to insert entity space for triple with space id ${space_id} and version id ${version_id} ${String(
            error
          )}`
        ),
    });

    yield* _(insertEntitySpaceEffect, retryEffect);
  });
}

function maybeDeleteEntitySpace({ space_id, version_id }: Schema.entity_spaces.Whereable) {
  return Effect.gen(function* (_) {
    const triplesForEntitySpace = yield* _(
      Effect.tryPromise({
        try: () =>
          Triples.select({
            version_id: version_id,
            space_id: space_id,
          }),
        catch: error =>
          new Error(`Failed to fetch triples with space id ${space_id} and version id ${version_id} ${String(error)}`),
      })
    );

    if (triplesForEntitySpace.length === 0) {
      const deleteEntitySpaceEffect = Effect.tryPromise({
        try: () => EntitySpaces.remove({ space_id, version_id }),
        catch: error =>
          new Error(
            `Failed to delete entity space for triple with space id ${space_id} and version id ${version_id} ${String(
              error
            )}`
          ),
      });

      yield* _(deleteEntitySpaceEffect, retryEffect);
    }
  });
}

function maybeUpdateEntityNameAfterDeletedNameTriple(
  triple: Schema.triples.Insertable,
  block: BlockEvent,
  createdById: string
) {
  return Effect.gen(function* (_) {
    const maybeNameTripleForEntityEffect = Effect.tryPromise({
      try: () =>
        db
          .selectOne('triples', {
            entity_id: triple.entity_id,
            attribute_id: SYSTEM_IDS.NAME,
            value_type: 'TEXT',
          })
          .run(pool),
      catch: error =>
        new Error(
          `Failed to fetch pre-existing name triple for entity ${triple.entity_id}. ${(error as Error).message}`
        ),
    });

    const maybeNameTripleForEntity = yield* _(maybeNameTripleForEntityEffect);

    // If there's a new name triple for the entity, we need to update the name
    if (maybeNameTripleForEntity) {
      const updateNameEffect = Effect.tryPromise({
        try: () =>
          db
            .upsert(
              'entities',
              {
                id: maybeNameTripleForEntity.entity_id,
                name: maybeNameTripleForEntity ? maybeNameTripleForEntity.text_value : null,
                created_by_id: createdById,
                created_at: block.timestamp,
                created_at_block: block.blockNumber,
                updated_at: block.timestamp,
                updated_at_block: block.blockNumber,
              },
              'id',
              {
                updateColumns: ['name'],
                noNullUpdateColumns: ['description'],
              }
            )
            .run(pool),
        catch: error =>
          new Error(
            `Failed to delete name ${String(triple.text_value)} for triple triple ${triple.space_id}:${
              triple.entity_id
            }:${triple.attribute_id}. ${(error as Error).message}`
          ),
      });

      return yield* _(updateNameEffect, retryEffect);
    }

    const deleteNameEffect = Effect.tryPromise({
      try: () =>
        db
          .upsert(
            'entities',
            {
              id: triple.entity_id,
              name: null,
              created_by_id: createdById,
              created_at: block.timestamp,
              created_at_block: block.blockNumber,
              updated_at: block.timestamp,
              updated_at_block: block.blockNumber,
            },
            'id',
            {
              updateColumns: ['name'],
              noNullUpdateColumns: ['description'],
            }
          )
          .run(pool),
      catch: error =>
        new Error(
          `Failed to delete name ${String(triple.text_value)} for triple ${triple.space_id}:${triple.entity_id}:${
            triple.attribute_id
          }. ${(error as Error).message}`
        ),
    });

    yield* _(deleteNameEffect, retryEffect);
  });
}

function upsertEntityType(triple: Schema.triples.Insertable, block: BlockEvent) {
  return Effect.gen(function* (_) {
    const insertTypeEffect = Effect.tryPromise({
      try: () =>
        Types.upsert([
          {
            version_id: triple.version_id,
            type_id: triple.entity_value_id!.toString(),
            created_at: block.timestamp,
            created_at_block: block.blockNumber,
          },
        ]),
      catch: () => new Error('Failed to create type'),
    });

    yield* _(insertTypeEffect, retryEffect);
  });
}

function upsertRelation(relation: Schema.relations.Insertable) {
  return Effect.gen(function* (_) {
    const insertRelationEffect = Effect.tryPromise({
      try: () => Relations.upsert([relation]),
      catch: error => new Error(`Failed to relation ${String(error)}`),
    });

    yield* _(insertRelationEffect, retryEffect);
  });
}

function upsertEntityTypeViaRelation(relation: Schema.relations.Insertable, block: BlockEvent) {
  return Effect.gen(function* (_) {
    const insertTypeEffect = Effect.tryPromise({
      try: async () => {
        return await Types.upsert([
          {
            version_id: relation.from_version_id,
            type_id: relation.to_version_id,
            created_at: block.timestamp,
            created_at_block: block.blockNumber,
          },
        ]);
      },
      catch: error => new Error(`Failed to create type from relation ${String(error)}`),
    });

    yield* _(insertTypeEffect, retryEffect);
  });
}

function upsertSpaceMetadata(relation: Schema.relations.Insertable, space_id: string) {
  return Effect.gen(function* (_) {
    const insertSpaceMetadataEffect = Effect.tryPromise({
      try: () =>
        SpaceMetadata.upsert([
          {
            space_id: space_id,
            entity_id: relation.from_version_id,
          },
        ]),
      catch: error =>
        new Error(
          `Failed to insert space metadata with id ${relation.from_version_id?.toString()} for space ${space_id} ${String(
            error
          )}`
        ),
    });

    yield* _(insertSpaceMetadataEffect, retryEffect);
  });
}

function updateRelationIndex(triple: Schema.triples.Insertable) {
  return Effect.gen(function* (_) {
    const insertCollectionItemIndexEffect = Effect.tryPromise({
      try: () =>
        Relations.update({
          id: triple.entity_id,
          index: triple.text_value,
        }),
      catch: error => new Error(`Failed to update relation fractional index ${String(error)}`),
    });

    yield* _(insertCollectionItemIndexEffect, retryEffect);
  });
}

function deleteRelation(id: string) {
  return Effect.gen(function* (_) {
    const deleteRelationEffect = Effect.tryPromise({
      try: () => Relations.remove({ id: id }),
      catch: error => new Error(`Failed to delete relation ${String(error)}`),
    });

    yield* _(deleteRelationEffect, retryEffect);
  });
}

function deleteEntityType(triple: Schema.triples.Insertable) {
  return Effect.gen(function* (_) {
    const deleteTypeEffect = Effect.tryPromise({
      try: () =>
        Types.remove({
          version_id: triple.version_id,
          type_id: triple.entity_value_id?.toString(),
        }),
      catch: () => new Error('Failed to delete type'),
    });

    yield* _(deleteTypeEffect, retryEffect);
  });
}

function deleteEntityTypeViaRelation(relation: Schema.relations.Insertable) {
  return Effect.gen(function* (_) {
    const deleteTypeEffect = Effect.tryPromise({
      try: () => Types.remove({ version_id: relation.from_version_id, type_id: relation.type_of_id }),
      catch: () => new Error('Failed to delete type'),
    });

    yield* _(deleteTypeEffect, retryEffect);
  });
}

function deleteSpaceMetadata(relation: Schema.relations.Insertable, space_id: string) {
  return Effect.gen(function* (_) {
    const deleteSpaceMetadataEffect = Effect.tryPromise({
      try: () =>
        SpaceMetadata.remove({
          entity_id: relation.from_version_id,
          space_id: space_id,
        }),
      catch: error =>
        new Error(
          `Failed to delete space metadata with id ${relation.from_version_id?.toString()} for space ${space_id} ${String(
            error
          )}`
        ),
    });

    yield* _(deleteSpaceMetadataEffect, retryEffect);
  });
}
