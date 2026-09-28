import * as Effect from 'effect/Effect';
import * as Either from 'effect/Either';

import { Environment } from '~/core/environment';

import { graphql } from './graphql';

type PageEntitiesResult = { entities: { id: string; spaceIds: string[] }[] };
type SpacesResult = { spaces: { id: string; type: string; page: { id: string } | null }[] };

const UUID = /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i;

function dashless(id: string) {
  return id.replace(/-/g, '').toLowerCase();
}

/**
 * The personal space each page entity fronts, keyed by the dashless page id.
 *
 * A geo-chat user id *is* this page id — geo-chat takes it from `space.page.id` at sign-in — so this
 * is how a bare participant id becomes someone the app can name and link. There is no filter for
 * spaces by page, so it is two reads: the entities' spaces, then which of those they are the page of.
 * Checking `page.id` rather than trusting `spaceIds[0]` matters because a person entity can also
 * appear in spaces that merely mention them.
 */
export async function fetchPersonalSpacesByPageIds(pageIds: string[]): Promise<Map<string, string>> {
  const ids = [...new Set(pageIds.filter(id => UUID.test(id)).map(dashless))];
  const bySpacePage = new Map<string, string>();
  if (ids.length === 0) return bySpacePage;

  const endpoint = Environment.getConfig().api;

  const entities = await Effect.runPromise(
    Effect.either(
      graphql<PageEntitiesResult>({
        endpoint,
        query: `query { entities(filter: { id: { in: ${JSON.stringify(ids)} } }) { id spaceIds } }`,
      })
    )
  );
  if (Either.isLeft(entities)) throw entities.left;

  const spaceIds = [...new Set(entities.right.entities.flatMap(entity => entity.spaceIds.map(dashless)))];
  if (spaceIds.length === 0) return bySpacePage;

  const spaces = await Effect.runPromise(
    Effect.either(
      graphql<SpacesResult>({
        endpoint,
        query: `query { spaces(filter: { id: { in: ${JSON.stringify(spaceIds)} } }) { id type page { id } } }`,
      })
    )
  );
  if (Either.isLeft(spaces)) throw spaces.left;

  for (const space of spaces.right.spaces) {
    if (space.type !== 'PERSONAL' || !space.page) continue;
    const pageId = dashless(space.page.id);
    if (ids.includes(pageId)) bySpacePage.set(pageId, dashless(space.id));
  }
  return bySpacePage;
}
