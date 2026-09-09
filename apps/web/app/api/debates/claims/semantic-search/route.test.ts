import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  config: null as null | { url: string; apiKey: string; minScore: number; timeoutMs: number },
  configError: null as null | Error,
  search: vi.fn(),
}));

vi.mock('~/core/debates/server/geo-lens-search', () => ({
  getGeoLensSearchConfig: () => {
    if (mocks.configError) throw mocks.configError;
    return mocks.config;
  },
  searchSemanticClaims: (...args: unknown[]) => mocks.search(...args),
}));

const TAG = 'ec3086a54ddf43d8aaefd6cc6e1b0556';

async function post(body: unknown, headers: Record<string, string> = {}) {
  const { POST } = await import('./route');
  return POST(
    new Request('https://geo.test/api/debates/claims/semantic-search', {
      method: 'POST',
      headers: { 'content-type': 'application/json', host: 'geo.test', origin: 'https://geo.test', ...headers },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    })
  );
}

beforeEach(() => {
  mocks.config = { url: 'https://lens.test', apiKey: 'k', minScore: 0.8, timeoutMs: 1000 };
  mocks.configError = null;
  mocks.search.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('POST /api/debates/claims/semantic-search', () => {
  it('refuses another origin', async () => {
    const response = await post({ query: 'q', tagId: TAG }, { origin: 'https://elsewhere.test' });
    expect(response.status).toBe(403);
    expect(mocks.search).not.toHaveBeenCalled();
  });

  it('refuses a body that is not JSON, and one that is not a request', async () => {
    expect((await post('{not json')).status).toBe(400);
    expect((await post({ query: '', tagId: TAG })).status).toBe(400);
    expect(mocks.search).not.toHaveBeenCalled();
  });

  it('answers null hits, without asking, when geo-lens is not configured', async () => {
    mocks.config = null;
    const response = await post({ query: 'q', tagId: TAG });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ hits: null });
    expect(mocks.search).not.toHaveBeenCalled();
  });

  it('reports a misconfiguration rather than pretending to be off', async () => {
    mocks.configError = new Error('GEO_LENS_API_KEY is required');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect((await post({ query: 'q', tagId: TAG })).status).toBe(503);
  });

  it('hands the parsed request to geo-lens and returns its hits', async () => {
    mocks.search.mockResolvedValue([{ id: 'a1', score: 0.9 }]);
    const response = await post({ query: ' trump ', tagId: TAG.toUpperCase(), spaceIds: null, topicIds: [] });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ hits: [{ id: 'a1', score: 0.9 }] });
    expect(mocks.search).toHaveBeenCalledWith(
      { query: 'trump', tagId: TAG, spaceIds: null, topicIds: [] },
      mocks.config
    );
  });

  it('answers 502 when geo-lens fails, which the client shows as the search failing', async () => {
    mocks.search.mockRejectedValue(new Error('geo-lens replied 500'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect((await post({ query: 'q', tagId: TAG })).status).toBe(502);
  });
});
