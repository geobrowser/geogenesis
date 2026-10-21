import { Effect } from 'effect';

import { getEntityPage } from '~/core/io/queries';
import { isHiddenEntity } from '~/core/moderation/hidden';
import type { Entity } from '~/core/types';
import { NavUtils } from '~/core/utils/utils';

import { isDebateEntity } from '../is-debate-entity';

type DebateEntity = Pick<Entity, 'types' | 'values'>;

/**
 * Long enough for a healthy by-id read, short enough that a slow or failing graph costs a recording
 * link a small, bounded delay: the graph client retries and has no timeout of its own, and the
 * proxy holds the request meanwhile. The same bound `DEBATE_VISIBILITY_TIMEOUT_MS` sets.
 */
export const PUBLISHED_DEBATE_LOOKUP_TIMEOUT_MS = 2_500;

/**
 * The debate page's own query (`cachedFetchEntityPage` in the entity route), so a link redirects
 * exactly when that page would render: the hidden flag is read in the same space scope it uses.
 *
 * The signal goes to the runtime as well as the query. The query only uses it to cancel a request
 * in flight; the client's retries sleep between attempts (honouring Retry-After, up to 30s), and
 * only interrupting the fiber ends that sleep on time.
 */
const fetchEntityFromGraph = async (entityId: string, spaceId: string, signal: AbortSignal) =>
  (await Effect.runPromise(getEntityPage(entityId, spaceId, signal), { signal }))?.entity ?? null;

/**
 * Where a debate's recording link should go instead, once the debate is on the graph (GEO-3435).
 *
 * geo-chat's "Your debate is ready" email links the bare recording page
 * (`/space/<space>/debates/<debate>/recording`), because the debate's own page only exists once
 * the publish sweep has put the debate on the graph, which happens after the email goes out. The
 * Debate entity carries the debate's id, so the same link can open the debate's page from then
 * on: for every email already sent, and every recording link shared since.
 *
 * `proxy.ts` asks this for every recording link, so the redirect is a real 307 before anything
 * renders: the recording route streams (it has a `loading.tsx`), so a redirect from the page itself
 * would arrive inside a 200 after the loading state had painted.
 *
 * Returns the debate page's path, with the link's query carried over (a start time, email
 * tracking), or `null` to stay on the recording page: the debate isn't on the graph yet, the
 * entity at that id isn't a Debate, it's hidden (its page would 404), or the graph can't be
 * reached in time. That page plays the video from geo-chat, as the recording page does, so it is
 * watchable as soon as it exists.
 */
export async function publishedDebatePath(
  spaceId: string,
  debateId: string,
  searchParams: URLSearchParams,
  {
    fetchEntity = fetchEntityFromGraph,
    timeoutMs = PUBLISHED_DEBATE_LOOKUP_TIMEOUT_MS,
  }: {
    fetchEntity?: (entityId: string, spaceId: string, signal: AbortSignal) => Promise<DebateEntity | null>;
    timeoutMs?: number;
  } = {}
): Promise<string | null> {
  let entity: DebateEntity | null;
  try {
    entity = await fetchEntity(debateId, spaceId, AbortSignal.timeout(timeoutMs));
  } catch {
    return null;
  }
  if (!entity || !isDebateEntity(entity.types) || isHiddenEntity(entity)) return null;

  const qs = searchParams.toString();
  return `${NavUtils.toEntity(spaceId, debateId)}${qs ? `?${qs}` : ''}`;
}
