import { Effect, Schedule } from 'effect';
import * as db from 'zapatos/db';
import type * as Schema from 'zapatos/schema';

import { pool } from '../utils/pool';

export function mapTripleVersions(
  versions: Schema.versions.Insertable[]
): Effect.Effect<Schema.triple_versions.Insertable[], Error> {
  return Effect.gen(function* (awaited) {
    // A new version of an entity should include all of the triples that were included in the previous
    // version, minus any triples that were deleted as part of a proposal.
    //
    // This fetches all of the triples that were included in the previous version of an entity. Later
    // on we process all triples that were added and removed as part of this proposal and remove
    // deleted triples from the new version.
    //
    // @TODO: This is insanely slow for large data sets (some of which we have)
    const triplesForVersionsEffect: Effect.Effect<Schema.triple_versions.Insertable[], Error> = Effect.gen(
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

    return existingTripleVersions;
  });
}
