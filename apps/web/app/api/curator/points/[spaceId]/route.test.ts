import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const network = vi.hoisted(() => ({ isTestnet: true }));

vi.mock('~/core/sdk/geo-network', () => ({
  get IS_TESTNET() {
    return network.isTestnet;
  },
}));

const { GET } = await import('./route');

const SPACE_ID = '0123456789abcdef0123456789abcdef';
const BACKEND = 'https://curator.example';

function call(spaceId: string) {
  return GET(new Request(`https://geo.example/api/curator/points/${spaceId}`), {
    params: Promise.resolve({ spaceId }),
  });
}

beforeEach(() => {
  network.isTestnet = true;
  vi.stubEnv('CURATOR_BACKEND_URL', `${BACKEND}/`);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('GET /api/curator/points/[spaceId]', () => {
  it("reads the person's total from curator-backend by personal space id", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ rewards: 1240 }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const res = await call('01234567-89ab-cdef-0123-456789abcdef');

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ points: 1240 });
    expect(fetchMock.mock.calls[0][0]).toBe(`${BACKEND}/user/rewards/${SPACE_ID}`);
  });

  it('passes a zero total through as zero', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ rewards: 0 }), { status: 200 })));

    const res = await call(SPACE_ID);

    await expect(res.json()).resolves.toEqual({ points: 0 });
  });

  it('answers 502 when curator-backend fails, so the row shows a dash rather than 0', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('boom', { status: 500 })));

    expect((await call(SPACE_ID)).status).toBe(502);
  });

  it('answers 502 when curator-backend is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));

    expect((await call(SPACE_ID)).status).toBe(502);
  });

  it('answers 502 on a body with no usable total', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({}), { status: 200 })));

    expect((await call(SPACE_ID)).status).toBe(502);
  });

  it('rejects anything that is not a space id without calling curator-backend', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    expect((await call('..%2Fstatus')).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('answers 503 when the backend is not configured', async () => {
    vi.stubEnv('CURATOR_BACKEND_URL', '');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    expect((await call(SPACE_ID)).status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('is not served on mainnet, where curator-backend would answer 0 for everyone', async () => {
    network.isTestnet = false;
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    expect((await call(SPACE_ID)).status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
