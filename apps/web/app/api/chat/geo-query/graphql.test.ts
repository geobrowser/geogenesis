import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('~/core/environment/environment', () => ({
  getConfig: () => ({ chainId: '1', rpc: 'https://rpc.example', api: 'https://api.example/graphql' }),
}));

const { geoGraphqlEndpoint, runGeoGraphql } = await import('./graphql');

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('geoGraphqlEndpoint', () => {
  it('comes from the app config, never the skill hardcoded testnet URL', () => {
    // Answering about testnet while the user reads mainnet is a silent
    // wrong-scope bug — the answer looks right and cannot be spotted.
    expect(geoGraphqlEndpoint()).toBe('https://api.example/graphql');
    expect(geoGraphqlEndpoint()).not.toContain('api-testnet.geobrowser.io');
  });
});

describe('runGeoGraphql', () => {
  it('returns data on success', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ data: { entity: { name: 'Ether' } } })));

    const result = await runGeoGraphql('{ entity { name } }', undefined);

    expect(result).toEqual({ ok: true, data: { entity: { name: 'Ether' } } });
  });

  it('surfaces GraphQL errors instead of reporting empty data', async () => {
    // The skill calls this "the classic false-'entity not found' bug": a schema
    // error that comes back as empty data reads to the model as "no such
    // entity", and it tells the user that as fact.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ data: null, errors: [{ message: 'Cannot query field "spaceId" on type "Entity"' }] }))
    );

    const result = await runGeoGraphql('{ entity { spaceId } }', undefined);

    expect(result.ok).toBe(false);
    // The full text matters — the sub-agent reads it to correct its own query.
    expect(result.ok === false && result.error).toContain('Cannot query field "spaceId"');
  });

  it('treats data:null with no errors as a failure, not an empty result', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ data: null })));

    const result = await runGeoGraphql('{ entity { name } }', undefined);

    expect(result.ok).toBe(false);
  });

  it('reports the body on a non-2xx so the cause is visible', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('Pagination argument "first" cannot exceed 1000', { status: 400 })));

    const result = await runGeoGraphql('{ entities(first: 5000) { id } }', undefined);

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toContain('cannot exceed 1000');
  });

  it('reports a non-JSON response rather than throwing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>502 Bad Gateway</html>', { status: 200 })));

    const result = await runGeoGraphql('{ entity { name } }', undefined);

    expect(result.ok).toBe(false);
  });

  it('sends variables only when given', async () => {
    const fetchMock = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(async () =>
      jsonResponse({ data: {} })
    );
    vi.stubGlobal('fetch', fetchMock);

    const sentBody = (call: number) => JSON.parse(String(fetchMock.mock.calls[call][1].body));

    await runGeoGraphql('query($id: UUID!) { entity(id: $id) { name } }', { id: 'abc' });
    expect(sentBody(0)).toHaveProperty('variables', { id: 'abc' });

    await runGeoGraphql('{ entity { name } }', undefined);
    expect(sentBody(1)).not.toHaveProperty('variables');
  });
});
