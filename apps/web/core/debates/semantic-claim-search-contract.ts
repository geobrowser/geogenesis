import { capSearchQuery } from '~/core/io/search-query';

/**
 * The wire between the hub's search box and `POST /api/debates/claims/semantic-search`, shared by
 * the route and the client hook so neither can drift from the other.
 *
 * Deliberately narrow. The route is a proxy for geo-lens, which answers arbitrary graph questions
 * given the key it holds; what crosses this boundary is only what the search box can ask — which
 * tag, which spaces, which topics, which words — and the route fixes everything else (the relation
 * types, the cache, the strategy, the floor) on its side. No relation type, no strategy name and
 * no score threshold ever arrives from the browser.
 */
export type SemanticClaimSearchRequest = {
  /** The words typed, already debounced and trimmed. Capped like every other search box. */
  query: string;
  /** The curation tag the list is drawn from — Featured or Debate. */
  tagId: string;
  /**
   * The spaces the claim must be *tagged* in, or `null` for any. The viewer's eligible set, never
   * the picked one: the picked spaces narrow the rows and the topic menu on the graph side, and
   * the space menu must not be narrowed by its own selection — the same rule `taggedEntityFilter`
   * follows, applied one step earlier.
   */
  spaceIds: string[] | null;
  /** AND-ed, as everywhere else: a claim has to carry every one of them. */
  topicIds: string[];
};

export type SemanticClaimSearchResponse = {
  /**
   * Closest first, already above the floor. `null` means the search was not made — geo-lens is not
   * configured on this deployment — which the client reads as "use the words", not as "nothing".
   */
  hits: Array<{ id: string; score: number }> | null;
};

/** Enough claims to fill a page of the list; the list shows a semantic answer as one page. */
export const SEMANTIC_SEARCH_K = 50;

/**
 * The most topics a request may carry. geo-lens bounds its relation filters at eight and the tag
 * takes one of them; nobody narrowing a list of a few hundred claims picks more.
 */
export const MAX_SEMANTIC_TOPIC_IDS = 7;

/** The most spaces a request may name. The widest viewer allowlist is a few dozen. */
export const MAX_SEMANTIC_SPACE_IDS = 200;

const HEX32 = /^[0-9a-f]{32}$/;

/** Dashless lowercase, the spelling geo-lens stores; `null` for anything that is not a Geo id. */
export function normalizeGeoId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.replace(/-/g, '').toLowerCase();
  return HEX32.test(normalized) ? normalized : null;
}

function normalizeIdList(value: unknown, max: number): string[] | null {
  if (!Array.isArray(value) || value.length > max) return null;
  const ids: string[] = [];
  for (const item of value) {
    const id = normalizeGeoId(item);
    if (!id) return null;
    ids.push(id);
  }
  return ids;
}

export type ParsedSemanticClaimSearchRequest =
  { ok: true; request: SemanticClaimSearchRequest } | { ok: false; error: string };

/**
 * A request as the route accepts it, or why it does not.
 *
 * Every id is normalized here rather than trusted, so the route can hand them to geo-lens as-is;
 * a query that caps to nothing is refused rather than sent, since geo-lens would refuse it too.
 */
export function parseSemanticClaimSearchRequest(body: unknown): ParsedSemanticClaimSearchRequest {
  if (typeof body !== 'object' || body === null) return { ok: false, error: 'Body must be a JSON object.' };
  const raw = body as Record<string, unknown>;

  const query = typeof raw.query === 'string' ? capSearchQuery(raw.query).trim() : '';
  if (!query) return { ok: false, error: 'query must be a non-empty string.' };

  const tagId = normalizeGeoId(raw.tagId);
  if (!tagId) return { ok: false, error: 'tagId must be a Geo entity id.' };

  const spaceIds =
    raw.spaceIds === null || raw.spaceIds === undefined ? null : normalizeIdList(raw.spaceIds, MAX_SEMANTIC_SPACE_IDS);
  if (raw.spaceIds !== null && raw.spaceIds !== undefined && spaceIds === null) {
    return { ok: false, error: `spaceIds must be null or up to ${MAX_SEMANTIC_SPACE_IDS} Geo space ids.` };
  }

  const topicIds = raw.topicIds === undefined ? [] : normalizeIdList(raw.topicIds, MAX_SEMANTIC_TOPIC_IDS);
  if (topicIds === null)
    return { ok: false, error: `topicIds must be up to ${MAX_SEMANTIC_TOPIC_IDS} Geo entity ids.` };

  return { ok: true, request: { query, tagId, spaceIds, topicIds } };
}
