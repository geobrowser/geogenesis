import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  limit: vi.fn(),
}));

vi.mock('./rate-limit', () => ({ placesIpLimit: { limit: mocks.limit } }));

const { guardPlacesRequest, validSessionToken } = await import('./guard');

function req(headers: Record<string, string> = {}) {
  return new Request('https://geobrowser.io/api/places/search?query=x', { headers });
}

beforeEach(() => {
  mocks.limit.mockReset().mockResolvedValue({ success: true, reset: Date.now() + 1000 });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

function setProduction() {
  vi.stubEnv('NODE_ENV', 'production');
}

describe('guardPlacesRequest', () => {
  it('lets a same-origin request through', async () => {
    const blocked = await guardPlacesRequest(req({ origin: 'https://geobrowser.io', host: 'geobrowser.io' }));
    expect(blocked).toBeNull();
  });

  it('refuses a cross-origin request', async () => {
    const blocked = await guardPlacesRequest(req({ origin: 'https://evil.example', host: 'geobrowser.io' }));
    expect(blocked?.status).toBe(403);
    // Refused before the limiter, so a cross-origin flood cannot spend the budget either.
    expect(mocks.limit).not.toHaveBeenCalled();
  });

  it('refuses once the caller is over the limit, and says how long to wait', async () => {
    mocks.limit.mockResolvedValue({ success: false, reset: Date.now() + 30_000 });

    const blocked = await guardPlacesRequest(req({ origin: 'https://geobrowser.io', host: 'geobrowser.io' }));

    expect(blocked?.status).toBe(429);
    expect(Number(blocked?.headers.get('Retry-After'))).toBeGreaterThan(0);
  });

  // The point of the endpoint is that every call costs money, so an unusable limiter is not a
  // reason to serve it without one.
  it('refuses in production when the limiter is unavailable', async () => {
    setProduction();
    mocks.limit.mockRejectedValue(new Error('redis down'));

    const blocked = await guardPlacesRequest(req({ origin: 'https://geobrowser.io', host: 'geobrowser.io' }));

    expect(blocked?.status).toBe(503);
  });

  it('carries on outside production, where there is no Redis and no bill', async () => {
    mocks.limit.mockRejectedValue(new Error('redis down'));

    const blocked = await guardPlacesRequest(req({ origin: 'https://geobrowser.io', host: 'geobrowser.io' }));

    expect(blocked).toBeNull();
  });

  it('allows a missing Origin outside production, and refuses it in production', async () => {
    expect(await guardPlacesRequest(req({ host: 'geobrowser.io' }))).toBeNull();

    setProduction();
    expect((await guardPlacesRequest(req({ host: 'geobrowser.io' })))?.status).toBe(403);
  });
});

describe('validSessionToken', () => {
  it('accepts a Mapbox-shaped token', () => {
    expect(validSessionToken('2b1f1a3c-9d4e-4f2a-8c7b-0a1b2c3d4e5f')).toBe('2b1f1a3c-9d4e-4f2a-8c7b-0a1b2c3d4e5f');
  });

  it.each([
    [null],
    [''],
    // Anything that could add a parameter to the upstream query string.
    ['abc&access_token=stolen'],
    ['abc?foo=bar'],
    ['abc#frag'],
    ['../../elsewhere'],
    ['a'.repeat(65)],
  ])('rejects %s', raw => {
    expect(validSessionToken(raw as string | null)).toBeNull();
  });
});
