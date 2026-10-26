// @vitest-environment node
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MAX_IMAGE_SIZE_BYTES } from '~/core/constants';

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

  it("serves geo-chat's still with the play button, cached for a day", async () => {
    const still = await sharp({ create: { width: 400, height: 600, channels: 3, background: '#336699' } })
      .jpeg()
      .toBuffer();
    fetchMock.mockResolvedValue(new Response(new Uint8Array(still)));
    const res = await get(DEBATE);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/jpeg');
    // A day, not a week: a debate hidden after its email went out stops showing its still soon.
    expect(res.headers.get('cache-control')).toBe('public, max-age=3600, s-maxage=86400');
    // Bounded: geo-chat gets a timeout, so a hung upstream can't hold the request.
    expect(fetchMock.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      `https://chat-api-testnet.geobrowser.io/debates/${DEBATE}/media/artifacts/preview_image/content`
    );
    const meta = await sharp(Buffer.from(await res.arrayBuffer())).metadata();
    expect([meta.width, meta.height]).toEqual([156, 216]);
  });

  it.each([
    ['a missing still', () => new Response('not found', { status: 404 })],
    ['a body that is not an image', () => new Response('<html></html>')],
    [
      'a body over the size cap',
      () => new Response('x', { headers: { 'content-length': String(MAX_IMAGE_SIZE_BYTES + 1) } }),
    ],
  ])('answers with the placeholder for %s, cached for 5 minutes', async (_, answer) => {
    fetchMock.mockResolvedValue(answer());
    const res = await get(DEBATE);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('public, max-age=300, s-maxage=300');
  });

  it.each([
    ['geo-chat is unreachable', () => Promise.reject(new TypeError('fetch failed'))],
    ['geo-chat answers 502', () => Promise.resolve(new Response('bad gateway', { status: 502 }))],
  ])('answers with the placeholder, cached nowhere, when %s', async (_, answer) => {
    fetchMock.mockImplementation(answer);
    const res = await get(DEBATE);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/jpeg');
    // A blip mustn't leave a grey still in the CDN or a mail provider's image cache.
    expect(res.headers.get('cache-control')).toBe('no-store');
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
