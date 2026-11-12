import { uuidToHex } from '~/core/id/normalize';

import { debatesAppDebateUrl } from '../debates-app-url';
import { type DebateEntity, fetchEntityFromGraph, isVisibleDebate } from './published-debate-path';

/**
 * The redirect sits in front of every entity page a person opens from outside geobrowser.io, so a
 * slow graph may cost the page only a moment before it renders as usual (the recording link's
 * longer lookup budget guards a far rarer path).
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
  return /^[0-9a-f]{12}7[0-9a-f]{19}$/.test(uuidToHex(id));
}

/**
 * Whether a request must stay where it is whatever the page: `?stay=1`, or a sign-in provider
 * returning to the page it started from (Privy's `privy_oauth_*` parameters), whose code belongs
 * to geobrowser.io.
 */
export function mustStay(searchParams: URLSearchParams): boolean {
  if (searchParams.has(STAY_PARAM)) return true;
  for (const key of searchParams.keys()) if (key.startsWith('privy_oauth_')) return true;
  return false;
}

/** The debates app's link for a debate, the incoming query carried over (campaign tags). */
export function debatesAppDestination(entityId: string, searchParams: URLSearchParams): string {
  const url = new URL(debatesAppDebateUrl(entityId));
  searchParams.forEach((value, key) => url.searchParams.append(key, value));
  return url.toString();
}

// Whether an entity is a visible debate, per space and id, for a few minutes: as long as the
// entity page caches its debate visibility. An entity not on the graph yet is not remembered.
const REMEMBER_MS = 5 * 60_000;
const MAX_REMEMBERED = 1000;
const remembered = new Map<string, { isDebate: boolean; at: number }>();
function recall(key: string, now: number): boolean | undefined {
  const entry = remembered.get(key);
  if (!entry) return undefined;
  if (now - entry.at < REMEMBER_MS) return entry.isDebate;
  remembered.delete(key);
  return undefined;
}
function remember(key: string, isDebate: boolean, now: number) {
  remembered.delete(key);
  remembered.set(key, { isDebate, at: now });
  if (remembered.size > MAX_REMEMBERED) remembered.delete(remembered.keys().next().value!);
}

/** Forgets every remembered answer (tests). */
export function forgetDebateLookups() {
  remembered.clear();
}

/**
 * Where an old geobrowser.io debate URL (`/space/<space>/<debate>`) sends a person arriving from
 * outside geobrowser.io (GEO-3695, Yaniv): the debate in the debates app, with the link's query
 * carried over. `null` keeps the page: not a debate, hidden (that page 404s), the graph slow or
 * unreachable, or a request that must stay ({@link mustStay}).
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
    now = Date.now,
  }: {
    fetchEntity?: (entityId: string, spaceId: string, signal: AbortSignal) => Promise<DebateEntity | null>;
    timeoutMs?: number;
    now?: () => number;
  } = {}
): Promise<string | null> {
  if (mustStay(searchParams) || !couldBeDebateId(entityId)) return null;
  const key = `${uuidToHex(spaceId)}/${uuidToHex(entityId)}`;
  let isDebate = recall(key, now());
  if (isDebate === undefined) {
    let entity: DebateEntity | null;
    try {
      entity = await fetchEntity(entityId, spaceId, AbortSignal.timeout(timeoutMs));
    } catch {
      return null;
    }
    isDebate = isVisibleDebate(entity);
    if (entity) remember(key, isDebate, now());
  }
  return isDebate ? debatesAppDestination(entityId, searchParams) : null;
}
