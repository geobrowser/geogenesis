import { Effect } from 'effect';

import { type OpWithCreatedBy } from './map-triples';
import { Triples } from '~/sink/db';

class CouldNotWriteTriplesError extends Error {
  readonly _tag = 'CouldNotWriteTriplesError';
}

interface PopulateTriplesArgs {
  schemaTriples: OpWithCreatedBy[];
}

/**
 * Handles writing triples to the database. At this point any triples from previous versions
 * of an entity are already part of the schemaTriples list, so this function just writes them.
 */
export function writeTriples({ schemaTriples }: PopulateTriplesArgs) {
  return Effect.gen(function* (_) {
    yield* _(
      Effect.tryPromise({
        try: () =>
          Triples.upsert(
            schemaTriples.filter(t => t.op === 'SET_TRIPLE').map(op => op.triple),
            { chunked: true }
          ),
        catch: error => new CouldNotWriteTriplesError(`Failed to insert bulk triples. ${(error as Error).message}`),
      })
    );
  });
}
