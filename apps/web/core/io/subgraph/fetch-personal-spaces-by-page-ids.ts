import { IdUtils } from '@geoprotocol/geo-sdk/lite';

import { Effect, Either } from 'effect';

import { Environment } from '~/core/environment';
import { normId } from '~/core/utils/norm-id';

import { graphql } from './graphql';

type PageEntitiesResult = { entities: { id: string; spaceIds: string[] }[] };
type SpacesResult = { spaces: { id: string; type: string; page: { id: string } | null }[] };

async function run<T>(query: string): Promise<T> {
  const result = await Effect.runPromise(Effect.either(graphql<T>({ endpoint: Environment.getConfig().api, query })));
  if (Either.isLeft(result)) throw new Error('Failed to resolve personal spaces by page id', { cause: result.left });
  return result.right;
}

/**
 * The personal space each page entity fronts, keyed by the normalized page id.
 *
 * A geo-chat user id *is* this page id — geo-chat takes it from `space.page.id` at sign-in — so this
 * is how a bare participant id becomes someone the app can name and link. There is no filter for
 * spaces by page, so it is two reads: the entities' spaces, then which of those they are the page of.
 * Checking `page.id` rather than trusting `spaceIds[0]` matters because a person entity can also
 * appear in spaces that merely mention them.
 */
export async function fetchPersonalSpacesByPageIds(pageIds: string[]): Promise<Map<string, string>> {
  // Validated before being written into the query, which takes them inline.
  const ids = [...new Set(pageIds.map(normId).filter(id => IdUtils.isValid(id)))];
  const byPageId = new Map<string, string>();
  if (ids.length === 0) return byPageId;

  const { entities } = await run<PageEntitiesResult>(
    `query { entities(filter: { id: { in: ${JSON.stringify(ids)} } }) { id spaceIds } }`
  );
  const spaceIds = [...new Set(entities.flatMap(entity => entity.spaceIds.map(normId)))];
  if (spaceIds.length === 0) return byPageId;

  const { spaces } = await run<SpacesResult>(
    `query { spaces(filter: { id: { in: ${JSON.stringify(spaceIds)} } }) { id type page { id } } }`
  );
  for (const space of spaces) {
    if (space.type !== 'PERSONAL' || !space.page) continue;
    const pageId = normId(space.page.id);
    if (ids.includes(pageId)) byPageId.set(pageId, normId(space.id));
  }
  return byPageId;
}
