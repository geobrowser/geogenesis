import { Effect, Schedule } from 'effect';
import * as db from 'zapatos/db';
import type * as Schema from 'zapatos/schema';

import { DESCRIPTION, NAME, TYPES } from '../constants/system-ids';
import { TripleAction } from '../types';
import { upsertChunked } from '../utils/db';
import { pool } from '../utils/pool';
import { type FullEntry } from '../zod';
import {
  mapAccounts,
  mapActions,
  mapEntities,
  mapProposals,
  mapProposedVersions,
  mapSpaces,
  mapTriplesWithActionType,
  mapVersions,
} from './map-entries';

export async function populateWithFullEntries({
  fullEntries,
  blockNumber,
  timestamp,
  cursor,
}: {
  fullEntries: FullEntry[];
  blockNumber: number;
  timestamp: number;
  cursor: string;
}) {
  const populateEffect = Effect.gen(function* (awaited) {
    const accounts = mapAccounts(fullEntries[0]?.author);

    const actions: Schema.actions.Insertable[] = mapActions({
      fullEntries,
      cursor,
      timestamp,
      blockNumber,
    });

    const geoEntities: Schema.geo_entities.Insertable[] = mapEntities({
      fullEntries,
      blockNumber,
      timestamp,
    });

    const proposals: Schema.proposals.Insertable[] = mapProposals({
      fullEntries,
      blockNumber,
      timestamp,
      cursor,
    });

    const proposed_versions: Schema.proposed_versions.Insertable[] = mapProposedVersions({
      fullEntries,
      blockNumber,
      timestamp,
      cursor,
    });

    const spaces: Schema.spaces.Insertable[] = mapSpaces(fullEntries, blockNumber);

    const versions: Schema.versions.Insertable[] = mapVersions({
      fullEntries,
      blockNumber,
      timestamp,
      cursor,
    });

    // A new version of an entity should include all of the triples that were included in the previous
    // version, minus any triples that were deleted as part of a proposal.
    //
    // This fetches all of the triples that were included in the previous version of an entity. Later
    // on we process all triples that were added and removed as part of this proposal and remove
    // deleted triples from the new version.
    //
    // @TODO: This is insanely slow for large data sets (some of which we have)
    const triplesForVersionsEffect: Effect.Effect<never, Error, Schema.triple_versions.Insertable[]> = Effect.gen(
      function* (awaited) {
        const triplesForVersions = yield* awaited(
          Effect.all(
            versions.map(version => {
              return Effect.gen(function* (awaited) {
                const previousTripleVersions = yield* awaited(
                  Effect.tryPromise({
                    try: () => db.select('triples', { entity_id: version.entity_id, is_stale: false }).run(pool),
                    catch: error =>
                      new Error(
                        `Failed to fetch triples for entity id ${version.entity_id}. ${(error as Error).message}`
                      ),
                  })
                );

                // Take the triples from the last version and add them to the new version
                return previousTripleVersions.map(tripleVersion => {
                  return {
                    triple_id: tripleVersion.id,
                    version_id: version.id,
                  };
                });
              });
            }),
            // We limit the number of connections to the DB to 75 to avoid errors where we surpass the pg
            // connection limit. This mostly only occurs in very large data sets.
            {
              concurrency: 75,
            }
          )
        );

        return triplesForVersions.flat();
      }
    );

    const existingTripleVersions: Schema.triple_versions.Insertable[] = yield* awaited(
      Effect.retry(triplesForVersionsEffect, Schedule.exponential(100).pipe(Schedule.jittered))
    );

    // Write all non-version and non-triple data in parallel
    yield* awaited(
      Effect.all([
        Effect.tryPromise({
          try: () =>
            upsertChunked('spaces', spaces, 'id', {
              updateColumns: db.doNothing,
            }),
          catch: error => new Error(`Failed to insert bulk spaces. ${(error as Error).message}`),
        }),
        Effect.tryPromise({
          try: () =>
            upsertChunked('accounts', accounts, 'id', {
              updateColumns: db.doNothing,
            }),
          catch: error => new Error(`Failed to insert bulk accounts. ${(error as Error).message}`),
        }),
        Effect.tryPromise({
          try: () =>
            upsertChunked('actions', actions, 'id', {
              updateColumns: db.doNothing,
            }),
          catch: error => new Error(`Failed to insert bulk actions. ${(error as Error).message}`),
        }),
        Effect.tryPromise({
          try: () =>
            // We update the name and description for an entity when mapping
            // through triples.
            upsertChunked('geo_entities', geoEntities, 'id', {
              updateColumns: ['name', 'description', 'updated_at', 'updated_at_block', 'created_by_id'],
              noNullUpdateColumns: ['name', 'description', 'updated_at', 'updated_at_block', 'created_by_id'],
            }),
          catch: error => new Error(`Failed to insert bulk entities. ${(error as Error).message}`),
        }),
        Effect.tryPromise({
          try: () =>
            upsertChunked('proposals', proposals, 'id', {
              updateColumns: db.doNothing,
            }),
          catch: error => new Error(`Failed to insert bulk proposals. ${(error as Error).message}`),
        }),
        Effect.tryPromise({
          try: () =>
            upsertChunked('proposed_versions', proposed_versions, 'id', {
              updateColumns: db.doNothing,
            }),
          catch: error => new Error(`Failed to insert bulk proposed versions. ${(error as Error).message}`),
        }),
        Effect.tryPromise({
          try: () =>
            upsertChunked('versions', versions, 'id', {
              updateColumns: db.doNothing,
            }),
          catch: error => new Error(`Failed to insert bulk versions. ${(error as Error).message}`),
        }),
        Effect.tryPromise({
          try: () => upsertChunked('triple_versions', existingTripleVersions, ['triple_id', 'version_id']),
          catch: error => new Error(`Failed to insert bulk triple versions. ${(error as Error).message}`),
        }),
      ]),
      Effect.tryPromise({
        try: () => upsertChunked('triple_versions', existingTripleVersions, ['triple_id', 'version_id']),
        catch: error => new Error(`Failed to insert bulk triple versions. ${(error as Error).message}`),
      })
    );

    const triplesDatabaseTuples = mapTriplesWithActionType(fullEntries, timestamp, blockNumber);

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
                  created_by_id: accounts[0]!.id,
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
        const deleteNameEffect = Effect.tryPromise({
          try: () =>
            db
              .upsert(
                'geo_entities',
                {
                  id: triple.entity_id,
                  name: null,
                  created_by_id: accounts[0]!.id,
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
                  created_by_id: accounts[0]!.id,
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
                  created_by_id: accounts[0]!.id,
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

  return await Effect.runPromise(populateEffect);
}
