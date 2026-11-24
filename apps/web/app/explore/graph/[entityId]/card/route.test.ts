import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GET } from './route';

const mocks = vi.hoisted(() => ({
  rate: { ok: true } as { ok: true } | { ok: false; retryAfter: number },
  load: vi.fn(),
  render: vi.fn(),
}));

vi.mock('~/app/api/ranking-og/rate-limit', () => ({
  checkRankingOgIpRateLimit: async () => mocks.rate,
  getClientIp: () => '1.2.3.4',
}));
vi.mock('~/core/graph-explorer/server/graph-card-data', async importOriginal => ({
  ...(await importOriginal<typeof import('~/core/graph-explorer/server/graph-card-data')>()),
  loadGraphCardData: mocks.load,
}));
vi.mock('~/core/graph-explorer/server/graph-card-meta', () => ({ loadGraphCardMeta: vi.fn() }));
vi.mock('~/core/graph-explorer/graph-card-image', () => ({ generateGraphCardResponse: mocks.render }));

const TOPIC = '4ed3162278994f29bde7a6f7cf60e28e';
const SPACE = '89bd89bf28ff8a0963faf92a8c905e20';

const get = (entityId: string, query: string) =>
  GET(new Request(`https://geobrowser.io/explore/graph/${entityId}/card?${query}`), {
    params: Promise.resolve({ entityId }),
  });

beforeEach(() => {
  mocks.rate = { ok: true };
  mocks.load.mockReset();
  mocks.render.mockReset();
  mocks.render.mockImplementation(async () => new Response('jpeg', { headers: { 'Content-Type': 'image/jpeg' } }));
});

describe('GET /explore/graph/[entityId]/card', () => {
  it('serves a JPEG with a long cache', async () => {
    mocks.load.mockResolvedValue({ degraded: false });
    const response = await get(TOPIC, `topic=${TOPIC}&space=${SPACE}&v=1`);
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('image/jpeg');
    expect(response.headers.get('Cache-Control')).toBe(
      'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800'
    );
    expect(mocks.load).toHaveBeenCalledWith({ entityId: TOPIC, topicId: TOPIC, spaceId: SPACE });
  });

  it('caches a degraded card briefly', async () => {
    mocks.load.mockResolvedValue({ degraded: true });
    const response = await get(TOPIC, `topic=${TOPIC}`);
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=300, s-maxage=300');
  });

  it('rejects invalid ids with 400, before loading anything', async () => {
    for (const [id, query] of [
      ['not-an-id', `topic=${TOPIC}`],
      [TOPIC, 'topic=nope'],
      [TOPIC, ''],
      [TOPIC, `topic=${TOPIC}&space=nope`],
    ])
      expect((await get(id, query)).status).toBe(400);
    expect(mocks.load).not.toHaveBeenCalled();
  });

  it('404s an unknown or hidden entity, with a short cache and no name', async () => {
    mocks.load.mockResolvedValue(null);
    const response = await get(TOPIC, `topic=${TOPIC}`);
    expect(response.status).toBe(404);
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=300, s-maxage=300');
    expect(await response.text()).toBe('{"ok":false,"error":"not_found"}');
  });

  it('429s past the rate limit', async () => {
    mocks.rate = { ok: false, retryAfter: 30 };
    expect((await get(TOPIC, `topic=${TOPIC}`)).status).toBe(429);
  });

  it('502s, uncached, when loading fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.load.mockRejectedValue(new Error('down'));
    const response = await get(TOPIC, `topic=${TOPIC}`);
    expect(response.status).toBe(502);
    expect(response.headers.get('Cache-Control')).toBeNull();
  });
});
