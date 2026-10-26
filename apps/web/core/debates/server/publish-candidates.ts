import { GeoChatRequestError, listSweepCandidateDebateIds } from './debate-source';
import { geoChatBaseUrl } from './geo-chat-base-url';

/** geo-chat's page size for the candidates listing; its own ceiling is 200. */
const PAGE_SIZE = 100;

/**
 * Most ids one space contributes to one sweep tick. The listing leaves out debates geo-chat has
 * seen in the graph, so in steady state it is a handful (media still processing, plus anything the
 * acceptor cannot publish). The cap keeps a tick bounded if that ever stops being true, for
 * example while geo-chat's graph sync is switched off and every finished debate comes back.
 */
export const MAX_PUBLISH_CANDIDATES_PER_SPACE = 400;

type PublishCandidatesPage = { debate_ids: string[]; next_cursor: string | null };

/**
 * The debates in a space the publish sweep should still try, however old (GEO-3157).
 *
 * Reads geo-chat's `GET /spaces/{id}/debates/publish-candidates`: complete, not cancelled, not
 * hidden, past the settlement window, media not terminal, and not yet seen in the graph, newest
 * first. The sweep used to read the space feed's listing, which stops at the fifty newest debates,
 * so an older debate whose media finished late, or was requeued after a fix, never published.
 *
 * Falls back to that feed listing ({@link listSweepCandidateDebateIds}) when geo-chat answers the
 * first page with 404 — a geo-chat deployed before the endpoint. That keeps today's behaviour,
 * window and all, until geo-chat catches up; any other failure is raised as before.
 *
 * Every candidate is still re-checked per debate (graph idempotency, settlement, media), so this
 * only decides which debates get looked at, never whether one may publish.
 */
export async function listPublishCandidateDebateIds(
  spaceId: string,
  maxIds: number = MAX_PUBLISH_CANDIDATES_PER_SPACE
): Promise<string[]> {
  const ids: string[] = [];
  let cursor: string | null = null;
  let firstPage = true;
  while (ids.length < maxIds) {
    const params = new URLSearchParams({ limit: String(Math.min(PAGE_SIZE, maxIds - ids.length)) });
    if (cursor) params.set('cursor', cursor);
    const path = `/spaces/${spaceId}/debates/publish-candidates?${params.toString()}`;
    const response = await fetch(`${geoChatBaseUrl()}${path}`, { cache: 'no-store' });
    if (firstPage && response.status === 404) {
      return listSweepCandidateDebateIds(spaceId);
    }
    if (!response.ok) {
      throw new GeoChatRequestError(response.status, `geo-chat ${path} failed (${response.status})`);
    }
    firstPage = false;
    const page = (await response.json()) as PublishCandidatesPage;
    ids.push(...page.debate_ids);
    if (!page.next_cursor) break;
    cursor = page.next_cursor;
  }
  return ids.slice(0, maxIds);
}
