import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchProfilePoints, normalizePointsSpaceId, parseCuratorRewards } from './profile-points';

const SPACE_ID = '0123456789abcdef0123456789abcdef';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('normalizePointsSpaceId', () => {
  it('accepts a compact or dashed id and returns it compact and lowercase', () => {
    expect(normalizePointsSpaceId(SPACE_ID)).toBe(SPACE_ID);
    expect(normalizePointsSpaceId('01234567-89AB-CDEF-0123-456789ABCDEF')).toBe(SPACE_ID);
  });

  it('rejects anything that is not a space id, so nothing else reaches the upstream path', () => {
    expect(normalizePointsSpaceId('')).toBeNull();
    expect(normalizePointsSpaceId('../status')).toBeNull();
    expect(normalizePointsSpaceId(`${SPACE_ID}0`)).toBeNull();
  });
});

describe('parseCuratorRewards', () => {
  it('reads the total, including zero', () => {
    expect(parseCuratorRewards({ rewards: 1240 })).toBe(1240);
    expect(parseCuratorRewards({ rewards: 0 })).toBe(0);
  });

  // Zero is shown, so a malformed answer must fail rather than read as a confident `0`.
  it.each([[null], [{}], [{ rewards: '12' }], [{ rewards: -1 }], [{ rewards: Number.NaN }]])('throws on %j', body => {
    expect(() => parseCuratorRewards(body)).toThrow();
  });
});

describe('fetchProfilePoints', () => {
  it('asks the same-origin route and returns its total', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ points: 0 }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchProfilePoints(SPACE_ID)).resolves.toBe(0);
    expect(fetchMock).toHaveBeenCalledWith(`/api/curator/points/${SPACE_ID}`, { signal: undefined });
  });

  it('throws on a failed lookup rather than answering zero', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('points lookup failed', { status: 502 })));

    await expect(fetchProfilePoints(SPACE_ID)).rejects.toThrow('502');
  });

  it('throws on a body with no usable total', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({}), { status: 200 })));

    await expect(fetchProfilePoints(SPACE_ID)).rejects.toThrow();
  });
});
