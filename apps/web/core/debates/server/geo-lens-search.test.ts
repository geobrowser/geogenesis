import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CLAIM_TYPE_ID, TOPICS_PROPERTY_ID } from '~/core/claims/ontology';
import { TAG_PROPERTY_ID } from '~/core/constants';

import { SEMANTIC_SEARCH_K } from '../semantic-claim-search-contract';
import {
  CLAIMS_CACHE_SPEC,
  DEFAULT_GEO_LENS_SEARCH_MIN_SCORE,
  type GeoLensSearchConfig,
  buildSemanticQuery,
  getGeoLensSearchConfig,
  resetClaimsCacheIdForTests,
  resolveClaimsCacheId,
  searchSemanticClaims,
} from './geo-lens-search';

const TAG = 'ec3086a54ddf43d8aaefd6cc6e1b0556';
const SPACE = '019fedae72b67ab2927adf044d57c566';
const TOPIC = '5d050707bc5840119b1e81ad3adb6244';
const CACHE_ID = '28644288d488eac0';

const config: GeoLensSearchConfig = { url: 'https://lens.test', apiKey: 'k', minScore: 0.8, timeoutMs: 1000 };

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

/** A geo-lens that registers the cache and answers queries, recording what it was sent. */
function lens(answers: { register?: () => Response; query?: () => Response } = {}) {
  const calls: Array<{ path: string; body: any }> = [];
  const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const path = String(input).replace(config.url, '');
    calls.push({ path, body: JSON.parse(String(init?.body)) });
    if (path === '/caches')
      return (answers.register ?? (() => json(202, { id: CACHE_ID, handle: 'claims', status: 'ready' })))();
    return (answers.query ?? (() => json(200, { hits: [] })))();
  });
  return { fetchImpl: fetchImpl as unknown as typeof fetch, calls };
}

beforeEach(() => {
  resetClaimsCacheIdForTests();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('getGeoLensSearchConfig', () => {
  it('is off without a URL', () => {
    vi.stubEnv('GEO_LENS_URL', '');
    vi.stubEnv('GEO_LENS_API_KEY', 'k');
    expect(getGeoLensSearchConfig()).toBeNull();
  });

  it('reads the URL, the key and the defaults, trimming quotes and trailing slashes', () => {
    vi.stubEnv('GEO_LENS_URL', '"https://lens.test/"');
    vi.stubEnv('GEO_LENS_API_KEY', "'k'");
    vi.stubEnv('GEO_LENS_SEARCH_MIN_SCORE', '');
    expect(getGeoLensSearchConfig()).toEqual({
      url: 'https://lens.test',
      apiKey: 'k',
      minScore: DEFAULT_GEO_LENS_SEARCH_MIN_SCORE,
      timeoutMs: 6000,
    });
  });

  it('takes a floor and a timeout from the environment', () => {
    vi.stubEnv('GEO_LENS_URL', 'https://lens.test');
    vi.stubEnv('GEO_LENS_API_KEY', 'k');
    vi.stubEnv('GEO_LENS_SEARCH_MIN_SCORE', '0.9');
    vi.stubEnv('GEO_LENS_TIMEOUT_MS', '250');
    expect(getGeoLensSearchConfig()).toMatchObject({ minScore: 0.9, timeoutMs: 250 });
  });

  it('fails fast on a URL without a key, or a floor that is not a score', () => {
    vi.stubEnv('GEO_LENS_URL', 'https://lens.test');
    vi.stubEnv('GEO_LENS_API_KEY', '');
    expect(() => getGeoLensSearchConfig()).toThrow(/GEO_LENS_API_KEY/);

    vi.stubEnv('GEO_LENS_API_KEY', 'k');
    vi.stubEnv('GEO_LENS_SEARCH_MIN_SCORE', '1.5');
    expect(() => getGeoLensSearchConfig()).toThrow(/GEO_LENS_SEARCH_MIN_SCORE/);
  });
});

describe('buildSemanticQuery', () => {
  it('asks the vector strategy for the tag first, then every topic, floor and page size fixed', () => {
    expect(
      buildSemanticQuery({ query: 'trump affair', tagId: TAG, spaceIds: [SPACE], topicIds: [TOPIC] }, 0.8)
    ).toEqual({
      strategy: 'vector',
      input: { text: 'trump affair' },
      k: SEMANTIC_SEARCH_K,
      min_score: 0.8,
      filters: {
        relations: [
          { typeId: TAG_PROPERTY_ID, toEntityId: TAG, spaceIds: [SPACE] },
          { typeId: TOPICS_PROPERTY_ID, toEntityId: TOPIC },
        ],
      },
      consistency: 'cached',
    });
  });

  it('sends no spaces on the tag when any space will do', () => {
    const query = buildSemanticQuery({ query: 'q', tagId: TAG, spaceIds: null, topicIds: [] }, 0.8);
    expect(query.filters.relations).toEqual([{ typeId: TAG_PROPERTY_ID, toEntityId: TAG, spaceIds: [] }]);
  });
});

describe('resolveClaimsCacheId', () => {
  it('registers the shared claims spec once and keeps the id', async () => {
    const { fetchImpl, calls } = lens();
    await expect(resolveClaimsCacheId(config, fetchImpl)).resolves.toBe(CACHE_ID);
    await expect(resolveClaimsCacheId(config, fetchImpl)).resolves.toBe(CACHE_ID);
    expect(calls).toHaveLength(1);
    expect(calls[0].body).toEqual({ name: 'claims', spec: CLAIMS_CACHE_SPEC, visibility: 'shared' });
    expect(CLAIMS_CACHE_SPEC.type_ids).toEqual([CLAIM_TYPE_ID]);
  });

  it('does not keep a cache that is still warming, nor a failed registration', async () => {
    const warming = lens({ register: () => json(202, { id: CACHE_ID, handle: 'claims', status: 'warming' }) });
    await expect(resolveClaimsCacheId(config, warming.fetchImpl)).rejects.toThrow(/warming/);

    const down = lens({ register: () => json(503, 'down') });
    await expect(resolveClaimsCacheId(config, down.fetchImpl)).rejects.toThrow(/503/);
    // the next call tries again rather than replaying the failure
    const up = lens();
    await expect(resolveClaimsCacheId(config, up.fetchImpl)).resolves.toBe(CACHE_ID);
  });
});

describe('searchSemanticClaims', () => {
  it('queries the registered cache and answers ids with scores, closest first as geo-lens sent them', async () => {
    const { fetchImpl, calls } = lens({
      query: () =>
        json(200, {
          hits: [
            { id: 'a2', name: 'Two', score: 0.93 },
            { id: 'a1', name: 'One', score: 0.85 },
          ],
        }),
    });
    const hits = await searchSemanticClaims(
      { query: 'q', tagId: TAG, spaceIds: null, topicIds: [] },
      config,
      fetchImpl
    );
    expect(hits).toEqual([
      { id: 'a2', score: 0.93 },
      { id: 'a1', score: 0.85 },
    ]);
    expect(calls.map(call => call.path)).toEqual(['/caches', `/caches/${CACHE_ID}/query`]);
    expect(calls[1].body).toMatchObject({ strategy: 'vector', min_score: 0.8 });
  });

  it('forgets the cache id on a 404 so the next search registers again', async () => {
    let queries = 0;
    const { fetchImpl, calls } = lens({
      query: () => (queries++ === 0 ? json(404, 'No cache') : json(200, { hits: [] })),
    });
    const request = { query: 'q', tagId: TAG, spaceIds: null, topicIds: [] };
    await expect(searchSemanticClaims(request, config, fetchImpl)).rejects.toThrow(/404/);
    await expect(searchSemanticClaims(request, config, fetchImpl)).resolves.toEqual([]);
    expect(calls.map(call => call.path)).toEqual([
      '/caches',
      `/caches/${CACHE_ID}/query`,
      '/caches',
      `/caches/${CACHE_ID}/query`,
    ]);
  });

  it('keeps the cache id across an ordinary failure', async () => {
    let queries = 0;
    const { fetchImpl, calls } = lens({
      query: () => (queries++ === 0 ? json(500, 'boom') : json(200, { hits: [] })),
    });
    const request = { query: 'q', tagId: TAG, spaceIds: null, topicIds: [] };
    await expect(searchSemanticClaims(request, config, fetchImpl)).rejects.toThrow(/500/);
    await expect(searchSemanticClaims(request, config, fetchImpl)).resolves.toEqual([]);
    expect(calls.filter(call => call.path === '/caches')).toHaveLength(1);
  });
});
