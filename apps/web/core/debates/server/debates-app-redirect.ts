import { Effect } from 'effect';

import { getEntityPage } from '~/core/io/queries';
import { isHiddenEntity } from '~/core/moderation/hidden';
import type { Entity } from '~/core/types';

import { debatesAppDebateUrl } from '../debates-app-url';
import { isDebateEntity } from '../is-debate-entity';

type DebateEntity = Pick<Entity, 'types' | 'values'>;

/**
 * The redirect sits in front of every entity page a person opens from outside geobrowser.io, so a
 * slow graph may cost the page only a moment before it renders as usual.
 */
export const DEBATES_APP_REDIRECT_TIMEOUT_MS = 400;

/** `?stay=1` keeps the geobrowser.io page, for editors who open a debate from outside. */
export const STAY_PARAM = 'stay';

/** Whether the redirect is on: on unless `DEBATE_PAGE_REDIRECT=off` (a redeploy turns it off). */
export function debatesAppRedirectEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.DEBATE_PAGE_REDIRECT?.trim().toLowerCase() !== 'off';
}

/**
 * A debate's id is geo-chat's, a version-7 UUID; most graph entities are version 4. Only an id that
 * could be a debate's is looked up, so other entity pages never wait on the graph for this.
 */
export function couldBeDebateId(id: string): boolean {
  return /^[0-9a-f]{12}7[0-9a-f]{19}$/.test(id.replace(/-/g, '').toLowerCase());
}

// Whether an entity id is a (visible) debate, by id. Types don't change and a hidden debate stays
// hidden, so answers are kept; a failed lookup is not. Bounded: oldest first out.
const MAX_REMEMBERED = 1000;
const remembered = new Map<string, boolean>();
function remember(id: string, isDebate: boolean) {
  remembered.delete(id);
  remembered.set(id, isDebate);
  if (remembered.size > MAX_REMEMBERED) remembered.delete(remembered.keys().next().value!);
}

/** Forgets every remembered answer (tests). */
export function forgetDebateLookups() {
  remembered.clear();
}

const fetchEntityFromGraph = async (entityId: string, spaceId: string, signal: AbortSignal) =>
  (await Effect.runPromise(getEntityPage(entityId, spaceId, signal), { signal }))?.entity ?? null;

/**
 * Where an old geobrowser.io debate URL (`/space/<space>/<debate>`) sends a person arriving from
 * outside geobrowser.io (GEO-3695, Yaniv): the debate in the debates app, with the link's query
 * (campaign tags) carried over. `null` keeps the page: not a debate, hidden (that page 404s), the
 * graph slow or unreachable, or `?stay=1`.
 *
 * A removed debate is still sent: removal lives in geo-chat, which this does not ask, and the
 * debates app says the debate isn't available.
 */
export async function debatesAppRedirect(
  spaceId: string,
  entityId: string,
  searchParams: URLSearchParams,
  {
    fetchEntity = fetchEntityFromGraph,
    timeoutMs = DEBATES_APP_REDIRECT_TIMEOUT_MS,
  }: {
    fetchEntity?: (entityId: string, spaceId: string, signal: AbortSignal) => Promise<DebateEntity | null>;
    timeoutMs?: number;
  } = {}
): Promise<string | null> {
  if (searchParams.has(STAY_PARAM) || !couldBeDebateId(entityId)) return null;
  let isDebate = remembered.get(entityId);
  if (isDebate === undefined) {
    let entity: DebateEntity | null;
    try {
      entity = await fetchEntity(entityId, spaceId, AbortSignal.timeout(timeoutMs));
    } catch {
      return null;
    }
    isDebate = !!entity && isDebateEntity(entity.types) && !isHiddenEntity(entity);
    remember(entityId, isDebate);
  }
  if (!isDebate) return null;
  const url = new URL(debatesAppDebateUrl(entityId));
  searchParams.forEach((value, key) => url.searchParams.append(key, value));
  return url.toString();
}
