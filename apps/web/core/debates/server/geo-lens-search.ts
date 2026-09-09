import { CLAIM_TYPE_ID, TOPICS_PROPERTY_ID } from '~/core/claims/ontology';
import { TAG_PROPERTY_ID } from '~/core/constants';

import { SEMANTIC_SEARCH_K, type SemanticClaimSearchRequest } from '../semantic-claim-search-contract';

/**
 * Server-only client for geo-lens, the graph cache that answers "which claims mean this?" in
 * milliseconds (geo-lens `docs/design.md`). Used by the semantic-search route for the debates hub.
 *
 * Unprefixed env vars, like the acceptor's, so the key never reaches the client bundle. Presence
 * of `GEO_LENS_URL` turns the feature on — the same switch geo-chat's media worker uses — and a
 * deployment without it answers every search with "not configured", which the hub reads as "match
 * the words", the only search it then has. `GEO_LENS_API_KEY` is then required: a URL with no key
 * is a misconfiguration, not a quieter way of being off.
 */
export type GeoLensSearchConfig = {
  url: string;
  apiKey: string;
  /**
   * The score a claim must reach to count as an answer, on geo-lens's normalised cosine scale
   * (`(1 + cos) / 2`). Measured against the deployed claims cache over the Debate tag
   * (2026-09-09): claims that answer the words score 0.855–0.90 ("Trump affair allegations" →
   * the affair claims at 0.873–0.895; "dating apps" → "Dating apps have made relationships
   * worse" at 0.901); tangential neighbours 0.82–0.85 ("climate change" → "ICE should be
   * abolished" at 0.822); gibberish tops out at 0.794. 0.85 is the line between the first two
   * in every sample. Tunable per deployment because the right floor is a property of the
   * embedding model and the corpus, and both are geo-lens's to change.
   */
  minScore: number;
  /** How long one geo-lens round trip may take before the hub reports the search as failed. */
  timeoutMs: number;
};

export const DEFAULT_GEO_LENS_SEARCH_MIN_SCORE = 0.85;
export const DEFAULT_GEO_LENS_TIMEOUT_MS = 6_000;

/**
 * Our handle name for the claims cache. Handles are per consumer, but the spec below hashes to the
 * one cache every consumer of "all Claim entities, embedded by name" shares — geo-chat registers
 * the identical spec — so registering it is idempotent and free once that cache is warm.
 */
const CLAIMS_CACHE_NAME = 'claims';

/** Byte-for-byte the spec geo-chat's media worker sends; a different spec would hash to a different cache. */
export const CLAIMS_CACHE_SPEC = {
  kind: 'type',
  type_ids: [CLAIM_TYPE_ID],
  embed: [{ field: 'name' }],
  strategies: ['exact', 'text', 'vector'],
} as const;

/** Secrets UIs and shell exports often keep the wrapping quotes as part of the value. */
function readEnv(name: string): string {
  const value = process.env[name]?.trim() ?? '';
  const quoted = /^(['"])([\s\S]*)\1$/.exec(value);
  return quoted ? quoted[2].trim() : value;
}

function readNumber(name: string, fallback: number, valid: (n: number) => boolean): number {
  const raw = readEnv(name);
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || !valid(parsed)) {
    throw new Error(`${name} must be a number (got ${JSON.stringify(raw)})`);
  }
  return parsed;
}

/**
 * The geo-lens config, or `null` when the feature is off. A URL without a key throws: fail-fast on
 * bad config, mirroring `getDebateAcceptorConfig`.
 */
export function getGeoLensSearchConfig(): GeoLensSearchConfig | null {
  const url = readEnv('GEO_LENS_URL').replace(/\/+$/, '');
  if (!url) return null;
  const apiKey = readEnv('GEO_LENS_API_KEY');
  if (!apiKey) throw new Error('GEO_LENS_API_KEY is required when GEO_LENS_URL is set');
  return {
    url,
    apiKey,
    minScore: readNumber('GEO_LENS_SEARCH_MIN_SCORE', DEFAULT_GEO_LENS_SEARCH_MIN_SCORE, n => n >= 0 && n <= 1),
    timeoutMs: readNumber('GEO_LENS_TIMEOUT_MS', DEFAULT_GEO_LENS_TIMEOUT_MS, n => n > 0),
  };
}

/** A non-2xx reply, kept typed so the caller can tell "cache gone" from "request failed". */
export class GeoLensStatusError extends Error {
  constructor(
    public readonly status: number,
    detail: string
  ) {
    super(`geo-lens replied ${status}: ${detail}`);
    this.name = 'GeoLensStatusError';
  }
}

type FetchLike = typeof fetch;

async function postJson<T>(
  config: GeoLensSearchConfig,
  path: string,
  body: unknown,
  fetchImpl: FetchLike,
  signal?: AbortSignal
): Promise<T> {
  const response = await fetchImpl(`${config.url}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': config.apiKey },
    body: JSON.stringify(body),
    signal: signal ?? AbortSignal.timeout(config.timeoutMs),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new GeoLensStatusError(response.status, detail.slice(0, 200));
  }
  return (await response.json()) as T;
}

type CacheView = { id: string; handle: string; status: string };

/**
 * The claims cache's id, registered on first use and remembered for the life of the instance.
 *
 * The id rather than the handle name, as geo-chat's client does: geo-lens resolves a name with
 * `LIMIT 1` and no order, so a name registered against two specs would be ambiguous, while the id
 * is exact. One in-flight registration is shared by concurrent callers, and a failed one is not
 * remembered, so the next request tries again rather than failing until the instance recycles.
 */
let claimsCacheId: Promise<string> | null = null;

export function resolveClaimsCacheId(config: GeoLensSearchConfig, fetchImpl: FetchLike = fetch): Promise<string> {
  if (!claimsCacheId) {
    claimsCacheId = postJson<CacheView>(
      config,
      '/caches',
      { name: CLAIMS_CACHE_NAME, spec: CLAIMS_CACHE_SPEC, visibility: 'shared' },
      fetchImpl
    )
      .then(view => {
        if (view.status !== 'ready') {
          throw new Error(`geo-lens claims cache '${view.handle}' (${view.id}) is ${view.status}, not ready`);
        }
        return view.id;
      })
      .catch(error => {
        claimsCacheId = null;
        throw error;
      });
  }
  return claimsCacheId;
}

/** Drop the remembered id if it is still the one that failed, so a straggler cannot wipe a fresh one. */
async function forgetClaimsCacheId(failed: string) {
  const current = await claimsCacheId?.catch(() => null);
  if (current === failed) claimsCacheId = null;
}

/** Test seam: the module-level memo outlives a test. */
export function resetClaimsCacheIdForTests() {
  claimsCacheId = null;
}

/**
 * The query the search box's request becomes, as geo-lens reads it (`filters.relations`, AND-ed,
 * first one anchoring the scan). The tag goes first because it is by far the most selective —
 * 1.2k claims carry the Debate tag against 318k in the cache — and its spaces are the spaces the
 * claim was *tagged in*, the relation's own, which is what the hub filters by.
 */
export function buildSemanticQuery(request: SemanticClaimSearchRequest, minScore: number) {
  return {
    strategy: 'vector',
    input: { text: request.query },
    k: SEMANTIC_SEARCH_K,
    min_score: minScore,
    filters: {
      relations: [
        { typeId: TAG_PROPERTY_ID, toEntityId: request.tagId, spaceIds: request.spaceIds ?? [] },
        ...request.topicIds.map(topicId => ({ typeId: TOPICS_PROPERTY_ID, toEntityId: topicId })),
      ],
    },
    // The mirror validates every five minutes; a search does not wait on a refresh.
    consistency: 'cached',
  };
}

type QueryResponse = { hits?: Array<{ id: string; name?: string | null; score: number }> };

/**
 * The claims closest in meaning to the words, among those carrying the tag (in the spaces) and
 * every topic — closest first, floor applied by geo-lens.
 */
export async function searchSemanticClaims(
  request: SemanticClaimSearchRequest,
  config: GeoLensSearchConfig,
  fetchImpl: FetchLike = fetch
): Promise<Array<{ id: string; score: number }>> {
  const cacheId = await resolveClaimsCacheId(config, fetchImpl);
  try {
    const response = await postJson<QueryResponse>(
      config,
      `/caches/${cacheId}/query`,
      buildSemanticQuery(request, config.minScore),
      fetchImpl
    );
    return (response.hits ?? []).map(hit => ({ id: hit.id, score: hit.score }));
  } catch (error) {
    // geo-lens no longer knows the cache under this id (re-created, or our handle dropped): let the
    // next request register again rather than fail until the instance is replaced.
    if (error instanceof GeoLensStatusError && error.status === 404) await forgetClaimsCacheId(cacheId);
    throw error;
  }
}
