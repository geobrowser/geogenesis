import { describe, expect, it, vi } from 'vitest';

import { fetchDebateVisibility, isGeoChatDebateId } from './debate-visibility';

// A real geo-chat debate id (UUIDv7), as the Debate entity carries it: 32 hex, no dashes.
const DEBATE_ID = '01a0448a61d371018434a20fdadf6f97';
const BASE_URL = 'https://geo-chat.test';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const visibility = (fetchImpl: (input: string, init?: RequestInit) => Promise<Response>, id = DEBATE_ID) =>
  fetchDebateVisibility(id, { fetchImpl, baseUrl: BASE_URL, timeoutMs: 50 });

describe('fetchDebateVisibility (GEO-2785)', () => {
  it('asks geo-chat for the debate by its hyphenated id, anonymously and uncached', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json(200, { id: DEBATE_ID }));

    await expect(visibility(fetchImpl)).resolves.toBe('visible');

    expect(fetchImpl).toHaveBeenCalledWith(
      `${BASE_URL}/debates/01a0448a-61d3-7101-8434-a20fdadf6f97`,
      expect.objectContaining({ cache: 'no-store', signal: expect.any(AbortSignal) })
    );
    const init = fetchImpl.mock.calls[0][1] as RequestInit;
    expect(init.headers).toBeUndefined();
  });

  it('reads a revalidated caller through the data cache instead of opting it out', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json(200, {}));

    await fetchDebateVisibility(DEBATE_ID, { fetchImpl, baseUrl: BASE_URL, revalidateSeconds: 300 });

    const init = fetchImpl.mock.calls[0][1] as RequestInit & { next?: { revalidate?: number } };
    expect(init.cache).toBeUndefined();
    expect(init.next).toEqual({ revalidate: 300 });
  });

  // The one answer that fails closed.
  it('reports removed on geo-chat’s own debate_not_found', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(json(404, { error: { code: 'debate_not_found', message: 'debate was not found' } }));

    await expect(visibility(fetchImpl)).resolves.toBe('removed');
  });

  // Everything else fails open, so a geo-chat outage cannot blank every debate page.
  it.each([
    ['a network error', () => Promise.reject(new TypeError('fetch failed'))],
    ['a timeout', () => Promise.reject(new DOMException('The operation timed out.', 'TimeoutError'))],
    ['a 500', () => Promise.resolve(json(500, { error: { code: 'internal', message: 'boom' } }))],
    ['a 503 with no body', () => Promise.resolve(new Response(null, { status: 503 }))],
    ['a 401 (a debate that is not complete)', () => Promise.resolve(json(401, { error: { code: 'x' } }))],
    ['a 404 from a proxy, with no geo-chat body', () => Promise.resolve(new Response('Not Found', { status: 404 }))],
    ['a 404 with another code', () => Promise.resolve(json(404, { error: { code: 'route_not_found' } }))],
  ])('is unknown on %s', async (_, respond) => {
    await expect(visibility(vi.fn().mockImplementation(respond))).resolves.toBe('unknown');
  });

  it('does not ask geo-chat at all about an id it never minted', async () => {
    const fetchImpl = vi.fn();

    // A UUIDv4-shaped id: version nibble 4.
    await expect(visibility(fetchImpl, '3f2a9c1e5b7d4e8f9a0b1c2d3e4f5a6b')).resolves.toBe('unknown');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('gives up at the timeout instead of hanging the render', async () => {
    const fetchImpl = vi.fn(
      (_input: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
        })
    );

    await expect(fetchDebateVisibility(DEBATE_ID, { fetchImpl, baseUrl: BASE_URL, timeoutMs: 10 })).resolves.toBe(
      'unknown'
    );
  });
});

describe('isGeoChatDebateId', () => {
  it('accepts a UUIDv7 in either spelling', () => {
    expect(isGeoChatDebateId(DEBATE_ID)).toBe(true);
    expect(isGeoChatDebateId('01a0448a-61d3-7101-8434-a20fdadf6f97')).toBe(true);
  });

  it('rejects other versions and non-ids', () => {
    expect(isGeoChatDebateId('3f2a9c1e5b7d4e8f9a0b1c2d3e4f5a6b')).toBe(false);
    expect(isGeoChatDebateId('debate-1')).toBe(false);
    expect(isGeoChatDebateId('')).toBe(false);
  });
});
