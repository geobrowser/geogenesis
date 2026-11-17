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
  const ids = await collectGeoChatPages<PublishCandidatesPage, string>({
    path: `/spaces/${spaceId}/debates/publish-candidates`,
    maxItems: maxIds,
    items: page => page.debate_ids,
    nextCursor: page => page.next_cursor,
  });
  return ids ?? listSweepCandidateDebateIds(spaceId);
}

/**
 * Every item of one of geo-chat's cursor-paged listings, up to `maxItems`, a page of at most
 * {@link PAGE_SIZE} at a time. Null when the first page is a 404 that `isMissingEndpoint` says is a
 * geo-chat deployed before the listing (by default, any 404); the caller decides what that means.
 * Any other failure throws. Shared by the publish candidates and the late claims candidates
 * (GEO-3635).
 */
export async function collectGeoChatPages<Page, Item>({
  path,
  maxItems,
  items,
  nextCursor,
  isMissingEndpoint = async () => true,
}: {
  path: string;
  maxItems: number;
  items: (page: Page) => Item[];
  nextCursor: (page: Page) => string | null;
  isMissingEndpoint?: (response: Response) => Promise<boolean>;
}): Promise<Item[] | null> {
  const collected: Item[] = [];
  let cursor: string | null = null;
  let firstPage = true;
  while (collected.length < maxItems) {
    const params = new URLSearchParams({ limit: String(Math.min(PAGE_SIZE, maxItems - collected.length)) });
    if (cursor) params.set('cursor', cursor);
    const url = `${path}?${params.toString()}`;
    const response = await fetch(`${geoChatBaseUrl()}${url}`, { cache: 'no-store' });
    if (firstPage && response.status === 404 && (await isMissingEndpoint(response))) return null;
    if (!response.ok) {
      throw new GeoChatRequestError(response.status, `geo-chat ${url} failed (${response.status})`);
    }
    firstPage = false;
    const page = (await response.json()) as Page;
    collected.push(...items(page));
    const next = nextCursor(page);
    if (!next) break;
    cursor = next;
  }
  return collected.slice(0, maxItems);
}
