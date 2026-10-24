// @vitest-environment node
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GET } from './route';

const DEBATE = '01a15b610e7075709ac5b5acd61c36d5';

const get = (id: string, query = '') =>
  GET(new Request(`https://www.geobrowser.io/api/email/debate-still/${id}${query}`), {
    params: Promise.resolve({ debateId: id }),
  });

const fetchMock = vi.fn<typeof fetch>();

describe('GET /api/email/debate-still/<debateId>', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_GEO_CHAT_API_BASE_URL', 'https://chat-api-testnet.geobrowser.io');
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("serves geo-chat's still with the play button, cached for a week", async () => {
    const still = await sharp({ create: { width: 400, height: 600, channels: 3, background: '#336699' } })
      .jpeg()
      .toBuffer();
    fetchMock.mockResolvedValue(new Response(new Uint8Array(still)));
    const res = await get(DEBATE);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/jpeg');
    expect(res.headers.get('cache-control')).toContain('s-maxage=604800');
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      `https://chat-api-testnet.geobrowser.io/debates/${DEBATE}/media/artifacts/preview_image/content`
    );
    const meta = await sharp(Buffer.from(await res.arrayBuffer())).metadata();
    expect([meta.width, meta.height]).toEqual([156, 216]);
  });

  it.each([
    ['a missing still', () => new Response('not found', { status: 404 })],
    ['a body that is not an image', () => new Response('<html></html>')],
  ])('answers with the placeholder for %s, cached for 5 minutes', async (_, answer) => {
    fetchMock.mockResolvedValue(answer());
    const res = await get(DEBATE);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('public, max-age=300, s-maxage=300');
  });

  it('answers with the placeholder when geo-chat is unreachable', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));
    const res = await get(DEBATE);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('public, max-age=300, s-maxage=300');
  });

  it.each([
    ['a malformed id', 'bad', ''],
    ['a dashed id', '01a15b61-0e70-7570-9ac5-b5acd61c36d5', ''],
    ['an uppercase id', DEBATE.toUpperCase(), ''],
    ['a query string', DEBATE, '?r=1'],
  ])('is 404 for %s, without fetching anything', async (_, id, query) => {
    const res = await get(id, query);
    expect(res.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
