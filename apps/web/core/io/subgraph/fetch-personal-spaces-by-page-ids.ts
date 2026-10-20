import { IdUtils } from '@geoprotocol/geo-sdk/lite';

import { Effect, Either } from 'effect';

import { chunk } from '~/core/community/community-graphql';
import { Environment } from '~/core/environment';
import { normId } from '~/core/utils/norm-id';
import { compareTiedSpaceIds } from '~/core/utils/space/space-ranking';

import { graphql } from './graphql';

type PageEntitiesResult = { entities: { id: string; spaceIds: string[] }[] };
type SpacesResult = { spaces: { id: string; type: string; page: { id: string } | null }[] };

/**
 * Rows per read. An `in` filter without `first` comes back capped at the API's default page of
 * 100 — silently, with no error — so every read asks in batches and says how many it wants.
 */
const BATCH_SIZE = 100;

async function run<T>(query: string): Promise<T> {
  const result = await Effect.runPromise(Effect.either(graphql<T>({ endpoint: Environment.getConfig().api, query })));
  if (Either.isLeft(result)) throw new Error('Failed to resolve personal spaces by page id', { cause: result.left });
  return result.right;
}

/** One `in` read over `ids`, split into batches that each name their own `first`. */
async function inBatches<T, R>(
  ids: string[],
  query: (batch: string, first: number) => string,
  rows: (result: T) => R[]
): Promise<R[]> {
  const results = await Promise.all(
    chunk(ids, BATCH_SIZE).map(batch => run<T>(query(JSON.stringify(batch), batch.length)))
  );
  return results.flatMap(rows);
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

  const entities = await inBatches(
    ids,
    (batch, first) => `query { entities(filter: { id: { in: ${batch} } }, first: ${first}) { id spaceIds } }`,
    (result: PageEntitiesResult) => result.entities
  );
  const spaceIds = [...new Set(entities.flatMap(entity => entity.spaceIds.map(normId)))];
  if (spaceIds.length === 0) return byPageId;

  // The larger of the two: it holds every space that merely mentions each person as well.
  const spaces = await inBatches(
    spaceIds,
    (batch, first) => `query { spaces(filter: { id: { in: ${batch} } }, first: ${first}) { id type page { id } } }`,
    (result: SpacesResult) => result.spaces
  );
  const candidatesByPageId = new Map<string, string[]>();
  for (const space of spaces) {
    if (space.type !== 'PERSONAL' || !space.page) continue;
    const pageId = normId(space.page.id);
    if (!ids.includes(pageId)) continue;
    candidatesByPageId.set(pageId, [...(candidatesByPageId.get(pageId) ?? []), normId(space.id)]);
  }

  // Someone can front more than one personal space: a second wallet that set up a space for the
  // same person (GEO-3395). Their positions and record live in whichever space they actually use,
  // so the main one is picked by activity rather than by the order the API listed them. Validated
  // before being written into the activity query, which takes them inline.
  const contested = [...new Set([...candidatesByPageId.values()].filter(c => c.length > 1).flat())].filter(id =>
    IdUtils.isValid(id)
  );
  const activity = contested.length > 0 ? await fetchSpaceActivity(contested) : new Map<string, SpaceActivity>();
  for (const [pageId, candidates] of candidatesByPageId) {
    byPageId.set(pageId, candidates.length === 1 ? candidates[0] : mainSpace(candidates, activity));
  }
  return byPageId;
}

type SpaceActivity = { votes: number; content: number };
type Count = { totalCount: number };
type ActivityResult = Record<`v${number}`, Count | null> &
  Record<`s${number}`, { valuesConnection: Count; relationsConnection: Count } | null>;

/**
 * Votes cast as each space, and the values and relations in it, for the few spaces in contention.
 * A failed read answers with no activity rather than failing the whole lookup: `mainSpace` then
 * falls back to the id, which picks the same space every time.
 */
async function fetchSpaceActivity(spaceIds: string[]): Promise<Map<string, SpaceActivity>> {
  const activity = new Map<string, SpaceActivity>();
  const selections = spaceIds.map(
    (id, index) => `
    v${index}: userVotesConnection(first: 0, filter: { userId: { is: "${id}" } }) { totalCount }
    s${index}: space(id: "${id}") { valuesConnection(first: 0) { totalCount } relationsConnection(first: 0) { totalCount } }`
  );
  const result = await run<ActivityResult>(`query {${selections.join('')}\n}`).catch(error => {
    console.error('[personal-spaces] failed to read activity for contested spaces:', error);
    return null;
  });
  if (!result) return activity;

  spaceIds.forEach((id, index) => {
    const space = result[`s${index}`];
    activity.set(id, {
      votes: result[`v${index}`]?.totalCount ?? 0,
      content: (space?.valuesConnection.totalCount ?? 0) + (space?.relationsConnection.totalCount ?? 0),
    });
  });
  return activity;
}

/** Most votes, then most content; a full tie goes to the lowest id, as space ranking breaks ties. */
function mainSpace(candidates: string[], activity: Map<string, SpaceActivity>): string {
  const none: SpaceActivity = { votes: 0, content: 0 };
  return [...candidates].sort((a, b) => {
    const left = activity.get(a) ?? none;
    const right = activity.get(b) ?? none;
    return right.votes - left.votes || right.content - left.content || compareTiedSpaceIds(a, b);
  })[0];
}
