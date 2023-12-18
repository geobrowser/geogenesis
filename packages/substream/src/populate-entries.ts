import { Effect, Schedule } from 'effect';
import * as db from 'zapatos/db';
import type * as Schema from 'zapatos/schema';

import { DESCRIPTION, NAME, TYPES } from './constants/system-ids';
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
import { TripleAction } from './types';
import { upsertChunked } from './utils/db';
import { pool } from './utils/pool';
import { type FullEntry } from './zod';

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

    // Fetch all existing triples into the new triple_versions join table. A new version of an entity
    // should include all of the triples that were included in the previous entity, minus any triples
    // that were deleted as part of a proposal.
    //
    // This fetches all of the triples that were included in the previous version of an entity. Later
    // on we process all triples that were added and removed as part of this proposal and remove
    // deleted triples from the new version.
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
            {
              concurrency: 75,
            }
          )
        );

        return triplesForVersions.flat();
      }
    );

    console.time('Fetching existing triples for versions');
    const existingTripleVersions: Schema.triple_versions.Insertable[] = yield* awaited(
      Effect.retry(triplesForVersionsEffect, Schedule.exponential(100).pipe(Schedule.jittered))
    );
    console.timeEnd('Fetching existing triples for versions');

    console.time('Inserting bulk accounts');
    yield* awaited(
      Effect.tryPromise({
        try: () =>
          upsertChunked('accounts', accounts, 'id', {
            updateColumns: db.doNothing,
          }),
        catch: error => new Error(`Failed to insert bulk accounts. ${(error as Error).message}`),
      })
    );
    console.timeEnd('Inserting bulk accounts');

    console.time('Inserting bulk actions');
    yield* awaited(
      Effect.tryPromise({
        try: () =>
          upsertChunked('actions', actions, 'id', {
            updateColumns: db.doNothing,
          }),
        catch: error => new Error(`Failed to insert bulk actions. ${(error as Error).message}`),
      })
    );
    console.timeEnd('Inserting bulk actions');

    console.time('Inserting bulk entities');
    yield* awaited(
      Effect.tryPromise({
        try: () =>
          // We update the name and description for an entity when mapping
          // through triples.
          upsertChunked('geo_entities', geoEntities, 'id', {
            updateColumns: ['name', 'description', 'updated_at', 'updated_at_block', 'created_by_id'],
            noNullUpdateColumns: ['name', 'description', 'updated_at', 'updated_at_block', 'created_by_id'],
          }),
        catch: error => new Error(`Failed to insert bulk entities. ${(error as Error).message}`),
      })
    );
    console.timeEnd('Inserting bulk entities');

    console.time('Inserting bulk proposals');
    yield* awaited(
      Effect.tryPromise({
        try: () =>
          upsertChunked('proposals', proposals, 'id', {
            updateColumns: db.doNothing,
          }),
        catch: error => new Error(`Failed to insert bulk proposals. ${(error as Error).message}`),
      })
    );
    console.timeEnd('Inserting bulk proposals');

    console.time('Inserting bulk proposed versions');
    yield* awaited(
      Effect.tryPromise({
        try: () =>
          upsertChunked('proposed_versions', proposed_versions, 'id', {
            updateColumns: db.doNothing,
          }),
        catch: error => new Error(`Failed to insert bulk proposed versions. ${(error as Error).message}`),
      })
    );
    console.timeEnd('Inserting bulk proposed versions');

    console.time('Inserting bulk spaces');
    yield* awaited(
      Effect.tryPromise({
        try: () =>
          upsertChunked('spaces', spaces, 'id', {
            updateColumns: db.doNothing,
          }),
        catch: error => new Error(`Failed to insert bulk spaces. ${(error as Error).message}`),
      })
    );
    console.timeEnd('Inserting bulk spaces');

    console.time('Inserting bulk versions');
    yield* awaited(
      Effect.tryPromise({
        try: () =>
          upsertChunked('versions', versions, 'id', {
            updateColumns: db.doNothing,
          }),
        catch: error => new Error(`Failed to insert bulk versions. ${(error as Error).message}`),
      })
    );

    console.timeEnd('Inserting bulk versions');

    console.time('Inserting bulk triple versions');
    yield* awaited(
      Effect.tryPromise({
        try: () => upsertChunked('triple_versions', existingTripleVersions, ['triple_id', 'version_id']),
        catch: error => new Error(`Failed to insert bulk triple versions. ${(error as Error).message}`),
      })
    );
    console.timeEnd('Inserting bulk triple versions');

    const triplesDatabaseTuples = mapTriplesWithActionType(fullEntries, timestamp, blockNumber);

    console.time('Inserting individual triples and triple versions');
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

      // Insert all new triples and existing triples into the new triple_versions join table.
      //
      // A Version should include all triples that were added as part of this proposal, and also all
      // triples that exist in previous versions of the entity. In the next step we delete all
      // triples that were deleted as part of this proposal to ensure they aren't included in the new version.
      const version = versions.find(v => v.entity_id === triple.entity_id);

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
          catch: () => new Error('Failed to insert triple'),
        });

        yield* awaited(Effect.retry(insertTripleEffect, Schedule.exponential(100).pipe(Schedule.jittered)));
        yield* awaited(Effect.retry(insertTripleVersionEffect, Schedule.exponential(100).pipe(Schedule.jittered)));
      }

      // We don't delete triples. Instead we store all triples ever created over time. We need
      // to track these so we can look at historical state for entities. We do remove them from
      // any new versions.
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

        const setStaleEffect = Effect.tryPromise({
          try: () => db.update('triples', { is_stale: true }, { id: triple.id }).run(pool),
          catch: () => new Error('Failed to set triple as stale'),
        });

        yield* awaited(Effect.retry(deleteEffect, Schedule.exponential(100).pipe(Schedule.jittered)));
        yield* awaited(Effect.retry(setStaleEffect, Schedule.exponential(100).pipe(Schedule.jittered)));
      }

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
          catch: () => new Error('Failed to create name'),
        });

        yield* awaited(Effect.retry(insertNameEffect, Schedule.exponential(100).pipe(Schedule.jittered)));
      }

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
          catch: () => new Error('Failed to delete name'),
        });

        yield* awaited(Effect.retry(deleteNameEffect, Schedule.exponential(100).pipe(Schedule.jittered)));
      }

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
          catch: () => new Error('Failed to create description'),
        });

        yield* awaited(Effect.retry(insertDescriptionEffect, Schedule.exponential(100).pipe(Schedule.jittered)));
      }

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
          catch: () => new Error('Failed to delete description'),
        });

        yield* awaited(Effect.retry(deleteDescriptionEffect, Schedule.exponential(100).pipe(Schedule.jittered)));
      }

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

    console.timeEnd('Inserting individual triples and triple versions');
  });

  return await Effect.runPromise(populateEffect);
}
