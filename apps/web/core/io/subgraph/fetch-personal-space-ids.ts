import { Effect, Either } from 'effect';

import { Environment } from '~/core/environment';
import { normId } from '~/core/utils/norm-id';

import { graphql } from './graphql';

/** Ids per query: an `in` filter this long stays a sane request. */
const LOOKUP_SIZE = 100;

/**
 * Which of these ids are personal spaces — a person, where Geo has one (GEO-3236). Asks only for
 * each space's id and type, the one fact needed to tell a person from a topic or a shared space.
 */
export async function fetchPersonalSpaceIds(ids: readonly string[], signal?: AbortSignal): Promise<Set<string>> {
  const unique = [...new Set(ids.map(normId))];
  const people = new Set<string>();

  for (let start = 0; start < unique.length; start += LOOKUP_SIZE) {
    const chunk = unique.slice(start, start + LOOKUP_SIZE);
    const result = await Effect.runPromise(
      Effect.either(
        graphql<{ spaces: { id: string; type: string }[] }>({
          query: `query {
            spaces(filter: { id: { in: [${chunk.map(id => JSON.stringify(id)).join(', ')}] } }, first: ${chunk.length}) {
              id
              type
            }
          }`,
          endpoint: Environment.getConfig().api,
          signal,
        })
      )
    );
    if (Either.isLeft(result)) {
      throw new Error('Failed to read which spaces are personal', { cause: result.left });
    }
    for (const space of result.right.spaces) if (space.type === 'PERSONAL') people.add(normId(space.id));
  }

  return people;
}
