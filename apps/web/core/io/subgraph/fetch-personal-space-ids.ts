import { Effect, Either } from 'effect';

import { Environment } from '~/core/environment';
import { normId } from '~/core/utils/norm-id';

import { graphql } from './graphql';

/** Ids per query: an `in` filter this long stays a sane request. */
const LOOKUP_SIZE = 100;

/**
 * Each known space's type (`PERSONAL`, `DAO`), keyed by normalized id. Asks only for id and type,
 * so it is the cheap way to answer anything that depends on nothing else about a space. Ids the API
 * doesn't know are absent from the map.
 */
export async function fetchSpaceTypes(ids: readonly string[], signal?: AbortSignal): Promise<Map<string, string>> {
  const unique = [...new Set(ids.map(normId))];
  const types = new Map<string, string>();

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
      throw new Error('Failed to read space types', { cause: result.left });
    }
    for (const space of result.right.spaces) types.set(normId(space.id), space.type);
  }

  return types;
}

/**
 * Which of these ids are personal spaces — a person, where Geo has one (GEO-3236). Asks only for
 * each space's id and type, the one fact needed to tell a person from a topic or a shared space.
 */
export async function fetchPersonalSpaceIds(ids: readonly string[], signal?: AbortSignal): Promise<Set<string>> {
  const types = await fetchSpaceTypes(ids, signal);
  return new Set([...types].filter(([, type]) => type === 'PERSONAL').map(([id]) => id));
}
