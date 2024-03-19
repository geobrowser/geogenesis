import { Effect, Schedule } from 'effect';
import * as db from 'zapatos/db';
import type * as Schema from 'zapatos/schema';

import { DESCRIPTION, NAME, TYPES } from '../constants/system-ids';
import { TripleAction } from '../types';
import { pool } from '../utils/pool';
import type { Action } from '../zod';
import { mapTriplesWithActionType } from './map-entries';

interface PopulateTriplesArgs {
  entries: { space: string; actions: Action[] }[];
  timestamp: number;
  blockNumber: number;
  createdById: string;
  versions: Schema.versions.Insertable[];
}

export function populateTriples({ entries, timestamp, blockNumber, createdById, versions }: PopulateTriplesArgs) {
  return Effect.gen(function* (awaited) {
    const triplesDatabaseTuples = mapTriplesWithActionType(entries, timestamp, blockNumber);

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
    for (const [actionType, triple] of triplesDatabaseTuples) {
      const isCreateTriple = actionType === TripleAction.Create;
      const isDeleteTriple = actionType === TripleAction.Delete;
      const isAddType = triple.attribute_id === TYPES && isCreateTriple;
      const isDeleteType = triple.attribute_id === TYPES && isDeleteTriple;
      const isNameAttribute = triple.attribute_id === NAME;
      const isDescriptionAttribute = triple.attribute_id === DESCRIPTION;
      const isStringValueType = triple.value_type === 'string';

      const isNameCreateAction = isCreateTriple && isNameAttribute && isStringValueType;
      const isNameDeleteAction = isDeleteTriple && isNameAttribute && isStringValueType;
      const isDescriptionCreateAction = isCreateTriple && isDescriptionAttribute && isStringValueType;
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
      if (isCreateTriple && version) {
        const insertTripleEffect = Effect.tryPromise({
          try: () => db.upsert('triples', triple, 'id').run(pool),
          catch: () => new Error('Failed to insert triple'),
        });

        const insertTripleVersionEffect = Effect.tryPromise({
          try: () =>
            db
              .upsert(
                'triple_versions',
                { version_id: version.id, triple_id: triple.id },
                ['triple_id', 'version_id'],
                {
                  updateColumns: ['triple_id', 'version_id'],
                }
              )
              .run(pool),
          catch: error => new Error(`Failed to insert ${triple.id}. ${(error as Error).message}`),
        });

        // @TODO: Parallelize with Effect.all
        yield* awaited(Effect.retry(insertTripleEffect, Schedule.exponential(100).pipe(Schedule.jittered)));
        yield* awaited(Effect.retry(insertTripleVersionEffect, Schedule.exponential(100).pipe(Schedule.jittered)));
      }

      /**
       * We don't delete triples. Instead we store all triples ever created over time. We need
       * to track these so we can look at historical state for entities. We do remove them from
       * any new versions.
       *
       * Here we remove the triple from the current if it was deleted.
       */
      if (isDeleteTriple && version) {
        const deleteEffect = Effect.tryPromise({
          try: () =>
            db
              .deletes(
                'triple_versions',
                { version_id: version.id, triple_id: triple.id },
                { returning: ['triple_id', 'version_id'] }
              )
              .run(pool),
          catch: error =>
            new Error(`Failed to delete triple ${triple.id} from version ${version.id}}. ${(error as Error).message}`),
        });

        /**
         * With our versioning model we store all triples that have ever been written to the system. If a
         * triple is not part of the latest version for an entity we mark it as stale.
         */
        const setStaleEffect = Effect.tryPromise({
          try: () => db.update('triples', { is_stale: true }, { id: triple.id }).run(pool),
          catch: error => new Error(`Failed to set triple ${triple.id} as stale. ${(error as Error).message}`),
        });

        // @TODO: Parallelize with Effect.all
        yield* awaited(Effect.retry(deleteEffect, Schedule.exponential(100).pipe(Schedule.jittered)));
        yield* awaited(Effect.retry(setStaleEffect, Schedule.exponential(100).pipe(Schedule.jittered)));
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
                'geo_entities',
                {
                  id: triple.entity_id,
                  name: triple.string_value,
                  created_by_id: createdById,
                  created_at: timestamp,
                  created_at_block: blockNumber,
                  updated_at: timestamp,
                  updated_at_block: blockNumber,
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
              `Failed to create name ${String(triple.string_value)} for triple ${triple.id}. ${
                (error as Error).message
              }`
            ),
        });

        yield* awaited(Effect.retry(insertNameEffect, Schedule.exponential(100).pipe(Schedule.jittered)));
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
                attribute_id: NAME,
                // @TODO: should be a typed enum instead of `text`
                value_type: 'string',
                is_stale: false,
              })
              .run(pool),
          catch: error =>
            new Error(
              `Failed to fetch pre-existing name triple for entity ${triple.entity_id}. ${(error as Error).message}`
            ),
        });

        const maybeNameTripleForEntity = yield* awaited(maybeNameTripleForEntityEffect);

        const deleteNameEffect = Effect.tryPromise({
          try: () =>
            db
              .upsert(
                'geo_entities',
                {
                  id: triple.entity_id,
                  name: maybeNameTripleForEntity ? maybeNameTripleForEntity.string_value : null,
                  created_by_id: createdById,
                  created_at: timestamp,
                  created_at_block: blockNumber,
                  updated_at: timestamp,
                  updated_at_block: blockNumber,
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
              `Failed to delete name ${String(triple.string_value)} for triple ${triple.id}. ${
                (error as Error).message
              }`
            ),
        });

        yield* awaited(Effect.retry(deleteNameEffect, Schedule.exponential(100).pipe(Schedule.jittered)));
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
                'geo_entities',
                {
                  id: triple.entity_id,
                  description: triple.string_value,
                  created_by_id: createdById,
                  created_at: timestamp,
                  created_at_block: blockNumber,
                  updated_at: timestamp,
                  updated_at_block: blockNumber,
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
              `Failed to create description ${String(triple.string_value)} for triple ${triple.id}. ${
                (error as Error).message
              }`
            ),
        });

        yield* awaited(Effect.retry(insertDescriptionEffect, Schedule.exponential(100).pipe(Schedule.jittered)));
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
                'geo_entities',
                {
                  id: triple.entity_id,
                  description: null,
                  created_by_id: createdById,
                  created_at: timestamp,
                  created_at_block: blockNumber,
                  updated_at: timestamp,
                  updated_at_block: blockNumber,
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
              `Failed to delete description ${String(triple.string_value)} for triple ${triple.id}. ${
                (error as Error).message
              }`
            ),
        });

        yield* awaited(Effect.retry(deleteDescriptionEffect, Schedule.exponential(100).pipe(Schedule.jittered)));
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
                'geo_entity_types',
                {
                  entity_id: triple.entity_id,
                  type_id: triple.value_id,
                  created_at: timestamp,
                  created_at_block: blockNumber,
                },
                ['entity_id', 'type_id'],
                { updateColumns: db.doNothing }
              )
              .run(pool),
          catch: () => new Error('Failed to create type'),
        });

        yield* awaited(Effect.retry(insertTypeEffect, Schedule.exponential(100).pipe(Schedule.jittered)));
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
              .deletes('geo_entity_types', {
                entity_id: triple.entity_id,
                type_id: triple.value_id,
              })
              .run(pool),
          catch: () => new Error('Failed to delete type'),
        });
        yield* awaited(Effect.retry(deleteTypeEffect, Schedule.exponential(100).pipe(Schedule.jittered)));
      }
    }
  });
}
