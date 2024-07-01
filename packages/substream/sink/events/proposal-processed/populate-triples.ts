import { SYSTEM_IDS } from '@geogenesis/sdk';
import { Effect, Either } from 'effect';
import * as db from 'zapatos/db';
import type * as Schema from 'zapatos/schema';

import { type GeoBlock } from '../../types';
import { pool } from '../../utils/pool';
import { retryEffect } from '../../utils/retry-effect';
import { type OpWithCreatedBy } from './map-triples';
import { Collections, Triples } from '~/sink/db';
import { CollectionItems } from '~/sink/db/collection-items';

interface PopulateTriplesArgs {
  schemaTriples: OpWithCreatedBy[];
  block: GeoBlock;
  versions: Schema.versions.Insertable[];
}

export function populateTriples({ schemaTriples, block, versions }: PopulateTriplesArgs) {
  return Effect.gen(function* (_) {
    /**
     * Changes to data in Geo are modeled as "actions." You can create a triple or delete a triple.
     * A client might publish _many_ actions, some of which are operations on the same triple. e.g.,
     * Create, Delete, Create, Delete, Create.
     *
     * Therefore, we need to process all actions serially to ensure that the final result of the data
     * is correct.
     *
     * @TODO: This is obviously fairly slow as may perform many async operations for each Create or
     * Delete action. One way to speed this up is to "squash" all of the actions corresponding to each
     * triple ahead of time to generate the minimum number of actions for each triple. Additionally
     * there's a lot of optimizations we can do with _how_ we're processing the data serially.
     *
     * Right now (January 23, 2024) the Geo Genesis client _does_ squash actions before publishing, but
     * this wasn't always the case and other clients might not implement the squashing mechanism.
     */
    for (const { op, triple, createdById } of schemaTriples) {
      const isUpsertTriple = op === 'SET_TRIPLE';
      const isDeleteTriple = op === 'DELETE_TRIPLE';
      const isAddType = triple.attribute_id === SYSTEM_IDS.TYPES && isUpsertTriple && triple.entity_value_id;
      const isDeleteType = triple.attribute_id === SYSTEM_IDS.TYPES && isDeleteTriple;
      const isNameAttribute = triple.attribute_id === SYSTEM_IDS.NAME;
      const isDescriptionAttribute = triple.attribute_id === SYSTEM_IDS.DESCRIPTION;
      const isStringValueType = triple.value_type === 'TEXT';

      const isNameCreateAction = isUpsertTriple && isNameAttribute && isStringValueType;
      const isNameDeleteAction = isDeleteTriple && isNameAttribute && isStringValueType;
      const isDescriptionCreateAction = isUpsertTriple && isDescriptionAttribute && isStringValueType;
      const isDescriptionDeleteAction = isDeleteTriple && isDescriptionAttribute && isStringValueType;

      /**
       * Insert all new triples and existing triples into the triple_versions join table.
       *
       * The new Version should include all triples that were added as part of this proposal, and
       * also all triples that exist in previous versions of the entity. In the next step we delete
       * all triples that were deleted as part of this proposal to ensure they aren't included in
       * the new version.
       *
       * @TODO: This is insanely slow for large data sets (some of which we have)
       */
      const version = versions.find(v => v.entity_id === triple.entity_id);

      /**
       * @TODO: There's a bug here where we might create a triple_version for a triple that gets
       * deleted later on in the same actions processing loop. If we squash ahead of time this
       * shouldn't be an issue.
       */
      if (isUpsertTriple && version) {
        const insertTripleEffect = Effect.tryPromise({
          try: () => Triples.upsert([triple]),
          // @TODO: More specifically typed error
          catch: error =>
            new Error(`Failed to insert triple
            triple: ${JSON.stringify(triple, null, 2)}
            error:  ${String(error)}`),
        });

        // const insertTripleVersionEffect = Effect.tryPromise({
        //   try: () =>
        //     db
        //       .upsert(
        //         'triple_versions',
        //         { version_id: version.id, triple_id: triple.id },
        //         ['triple_id', 'version_id'],
        //         {
        //           updateColumns: ['triple_id', 'version_id'],
        //         }
        //       )
        //       .run(pool),
        //   catch: error => new Error(`Failed to insert ${triple.id}. ${(error as Error).message}`),
        // });

        // @TODO: Parallelize with Effect.all
        yield* _(insertTripleEffect, retryEffect);
        // yield* awaited(insertTripleVersionEffect, retryEffect);
      }

      /**
       * We don't delete triples. Instead we store all triples ever created over time. We need
       * to track these so we can look at historical state for entities. We do remove them from
       * any new versions.
       *
       * Here we remove the triple from the current if it was deleted.
       */
      if (isDeleteTriple && version) {
        // const deleteEffect = Effect.tryPromise({
        //   try: () =>
        //     db
        //       .deletes(
        //         'triple_versions',
        //         { version_id: version.id, triple_id: triple.id },
        //         { returning: ['triple_id', 'version_id'] }
        //       )
        //       .run(pool),
        //   catch: error =>
        //     new Error(`Failed to delete triple ${triple.id} from version ${version.id}}. ${(error as Error).message}`),
        // });
        // /**
        //  * With our versioning model we store all triples that have ever been written to the system. If a
        //  * triple is not part of the latest version for an entity we mark it as stale.
        //  */
        // const setStaleEffect = Effect.tryPromise({
        //   try: () => db.update('triples', { is_stale: true }, { id: triple.id }).run(pool),
        //   catch: error => new Error(`Failed to set triple ${triple.id} as stale. ${(error as Error).message}`),
        // });
        // // @TODO: Parallelize with Effect.all
        // yield* awaited(deleteEffect, retryEffect);
        // yield* awaited(setStaleEffect, retryEffect);
      }

      /**
       * We associate the triple data for the name and description triples with the entity itself to make
       * querying the name and description of an entity easier.
       *
       * There's probably a better way to do this in SQL.
       */
      if (isNameCreateAction) {
        const insertNameEffect = Effect.tryPromise({
          try: () =>
            db
              .upsert(
                'entities',
                {
                  id: triple.entity_id,
                  name: triple.text_value,
                  created_by_id: createdById,
                  created_at: block.timestamp,
                  updated_at: block.timestamp,
                  updated_at_block: block.blockNumber,
                  created_at_block: block.blockNumber,
                  created_at_block_hash: block.hash,
                  created_at_block_network: block.network,
                },
                'id',
                {
                  updateColumns: ['name', 'description', 'updated_at', 'updated_at_block', 'created_by_id'],
                  noNullUpdateColumns: ['description'],
                }
              )
              .run(pool),
          catch: error =>
            new Error(
              `Failed to create name ${String(triple.text_value)} for triple ${triple.space_id}:${triple.entity_id}:${
                triple.attribute_id
              }. ${(error as Error).message}`
            ),
        });

        yield* _(insertNameEffect, retryEffect);
      }

      /**
       * We associate the triple data for the name and description triples with the entity itself to make
       * querying the name and description of an entity easier.
       *
       * There's probably a better way to do this in SQL.
       */
      if (isNameDeleteAction) {
        /**
         * There might be more than one name triple defined on an entity at any given time. We need to make sure
         * we fall back to a random name if we're deleting the current name. There's probably a better way to
         * do this with derived/computed columns in SQL. We will also likely handle this in a FTS index that knows
         * how to handle entities with multiple names/spaces in the future.
         *
         * We have already processed any name triples that are to be deleted in the same proposal. We should be safe
         * to query for any current name triples for the entity without worrying about colliding with a name triple
         * that has yet to be deleted.
         */
        const maybeNameTripleForEntityEffect = Effect.tryPromise({
          try: () =>
            db
              .selectOne('triples', {
                entity_id: triple.entity_id,
                attribute_id: SYSTEM_IDS.NAME,
                value_type: 'TEXT',
                is_stale: false,
              })
              .run(pool),
          catch: error =>
            new Error(
              `Failed to fetch pre-existing name triple for entity ${triple.entity_id}. ${(error as Error).message}`
            ),
        });

        const maybeNameTripleForEntity = yield* _(maybeNameTripleForEntityEffect);

        const deleteNameEffect = Effect.tryPromise({
          try: () =>
            db
              .upsert(
                'entities',
                {
                  id: triple.entity_id,
                  name: maybeNameTripleForEntity ? maybeNameTripleForEntity.text_value : null,
                  created_by_id: createdById,
                  created_at: block.timestamp,
                  updated_at: block.timestamp,
                  updated_at_block: block.blockNumber,
                  created_at_block: block.blockNumber,
                  created_at_block_hash: block.hash,
                  created_at_block_network: block.network,
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

        yield* _(deleteNameEffect, retryEffect);
      }

      /**
       * We associate the triple data for the name and description triples with the entity itself to make
       * querying the name and description of an entity easier.
       *
       * There's probably a better way to do this in SQL.
       */
      if (isDescriptionCreateAction) {
        const insertDescriptionEffect = Effect.tryPromise({
          try: () =>
            db
              .upsert(
                'entities',
                {
                  id: triple.entity_id,
                  description: triple.text_value,
                  created_by_id: createdById,
                  created_at: block.timestamp,
                  updated_at: block.timestamp,
                  updated_at_block: block.blockNumber,
                  created_at_block: block.blockNumber,
                  created_at_block_hash: block.hash,
                  created_at_block_network: block.network,
                },
                'id',
                {
                  updateColumns: ['description'],
                  noNullUpdateColumns: ['name'],
                }
              )
              .run(pool),
          catch: error =>
            new Error(
              `Failed to create description ${String(triple.text_value)} for triple triple ${triple.space_id}:${
                triple.entity_id
              }:${triple.attribute_id}. ${(error as Error).message}`
            ),
        });

        yield* _(insertDescriptionEffect, retryEffect);
      }

      /**
       * We associate the triple data for the name and description triples with the entity itself to make
       * querying the name and description of an entity easier.
       *
       * There's probably a better way to do this in SQL.
       */
      if (isDescriptionDeleteAction) {
        const deleteDescriptionEffect = Effect.tryPromise({
          try: () =>
            db
              .upsert(
                'entities',
                {
                  id: triple.entity_id,
                  description: null,
                  created_by_id: createdById,
                  created_at: block.timestamp,
                  updated_at: block.timestamp,
                  updated_at_block: block.blockNumber,
                  created_at_block: block.blockNumber,
                  created_at_block_hash: block.hash,
                  created_at_block_network: block.network,
                },
                'id',
                {
                  updateColumns: ['description'],
                  noNullUpdateColumns: ['name'],
                }
              )
              .run(pool),
          catch: error =>
            new Error(
              `Failed to delete description ${String(triple.text_value)} for triple triple ${triple.space_id}:${
                triple.entity_id
              }:${triple.attribute_id}. ${(error as Error).message}`
            ),
        });

        yield* _(deleteDescriptionEffect, retryEffect);
      }

      /**
       * We associate the triple data for the name and description triples with the entity itself to make
       * querying the name and description of an entity easier.
       *
       * There's probably a better way to do this in SQL.
       */
      if (isAddType) {
        const insertTypeEffect = Effect.tryPromise({
          try: () =>
            db
              .upsert(
                'entity_types',
                {
                  entity_id: triple.entity_id,
                  type_id: triple.entity_value_id?.toString()!,
                  created_at: block.timestamp,
                  created_at_block: block.blockNumber,
                  created_at_block_hash: block.hash,
                  created_at_block_network: block.network,
                },
                ['entity_id', 'type_id'],
                { updateColumns: db.doNothing }
              )
              .run(pool),
          catch: () => new Error('Failed to create type'),
        });

        yield* _(insertTypeEffect, retryEffect);

        if (triple.entity_value_id === SYSTEM_IDS.COLLECTION_TYPE) {
          const insertCollectionEffect = Effect.tryPromise({
            try: () =>
              Collections.upsert([
                {
                  id: triple.entity_id,
                  entity_id: triple.entity_id,
                },
              ]),
            catch: error => new Error(`Failed to create collection item ${String(error)}`),
          });

          yield* _(insertCollectionEffect, retryEffect);
        }

        if (triple.entity_value_id === SYSTEM_IDS.COLLECTION_ITEM_TYPE) {
          const schemaCollectionItem = getCollectionItemTriplesFromSchemaTriples(
            schemaTriples,
            triple.entity_id.toString()
          );

          if (schemaCollectionItem) {
            const insertCollectionItemEffect = Effect.tryPromise({
              try: () => CollectionItems.upsert([schemaCollectionItem]),
              catch: error => new Error(`Failed to create collection item ${String(error)}`),
            });

            yield* _(insertCollectionItemEffect, retryEffect);
          }
        }

        // Update the collection item row if we change any of the values. At this point
        // the triple has already been inserted, we just need to update the collection
        // item itself with the new collection item values.
        //
        // Really only the index changes ad-hoc. The other triples are only ever created
        // or deleted at the time of creating or deleting the entire collection item.
        if (triple.attribute_id === SYSTEM_IDS.COLLECTION_ITEM_INDEX) {
          const insertCollectionItemIndexEffect = Effect.tryPromise({
            try: () =>
              CollectionItems.update({
                id: triple.entity_id,
                index: triple.text_value,
              }),
            catch: error => new Error(`Failed to update collection item fractional index ${String(error)}`),
          });

          yield* _(insertCollectionItemIndexEffect, retryEffect);
        }
      }

      /**
       * We associate the triple data for the name and description triples with the entity itself to make
       * querying the name and description of an entity easier.
       *
       * There's probably a better way to do this in SQL.
       */
      if (isDeleteType) {
        const deleteTypeEffect = Effect.tryPromise({
          try: () =>
            db
              .deletes('entity_types', {
                entity_id: triple.entity_id,
                type_id: triple.entity_value_id?.toString(),
              })
              .run(pool),
          catch: () => new Error('Failed to delete type'),
        });
        yield* _(deleteTypeEffect, retryEffect);

        if (triple.entity_value_id === SYSTEM_IDS.COLLECTION_TYPE) {
          const deleteCollectionEffect = Effect.tryPromise({
            try: () =>
              Collections.remove({
                id: triple.entity_id,
              }),
            catch: error => new Error(`Failed to delete collection ${String(error)}`),
          });

          yield* _(deleteCollectionEffect, retryEffect);
        }

        if (triple.entity_value_id === SYSTEM_IDS.COLLECTION_ITEM_TYPE) {
          const insertCollectionItemEffect = Effect.tryPromise({
            try: () =>
              CollectionItems.remove({
                id: triple.entity_id,
              }),
            catch: error => new Error(`Failed to delete collection item ${String(error)}`),
          });

          yield* _(insertCollectionItemEffect, retryEffect);
        }
      }
    }
  });
}

/**
 * Handle creating the database representation of a collection item when a new collection item
 * is created. We need to gather all of the required triples to fully flesh out the collection
 * item's data. We could do this linearly, but we want to ensure that all of the properties
 * exist before creating the item. If not all properties exist we don't create the collection
 * item.
 */
function getCollectionItemTriplesFromSchemaTriples(
  schemaTriples: OpWithCreatedBy[],
  entityId: string
): Schema.collection_items.Insertable | null {
  // Grab other triples in this edit that match the collection item's entity id. We
  // want to add all of the collection item properties to the item in the
  // collection_items table.
  const otherTriples = schemaTriples.filter(t => t.triple.entity_id === entityId && t.op === 'SET_TRIPLE');

  const collectionItemIndex = otherTriples.find(t => t.triple.attribute_id === SYSTEM_IDS.COLLECTION_ITEM_INDEX);
  const collectionItemEntityReferenceId = otherTriples.find(
    t => t.triple.attribute_id === SYSTEM_IDS.COLLECTION_ITEM_ENTITY_REFERENCE
  );
  const collectionItemCollectionReferenceId = otherTriples.find(
    t => t.triple.attribute_id === SYSTEM_IDS.COLLECTION_ITEM_COLLECTION_ID_REFERENCE_ATTRIBUTE
  );

  const indexValue = collectionItemIndex?.triple.text_value;
  const entityReferenceId = collectionItemEntityReferenceId?.triple.entity_value_id;
  const collectionReferenceId = collectionItemCollectionReferenceId?.triple.entity_value_id;

  if (!indexValue || !entityReferenceId || !collectionReferenceId) {
    return null;
  }

  return {
    id: entityId,
    collection_item_entity_id: entityId,
    collection_id: collectionReferenceId.toString(),
    entity_id: entityReferenceId.toString(),
    index: indexValue,
  };
}
