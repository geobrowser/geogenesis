import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { listClaimPublishCandidates } from './claim-publish-candidates';
import { GeoChatRequestError } from './debate-source';

const BASE = 'https://chat.example';
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

beforeEach(() => vi.stubEnv('GEO_CHAT_API_BASE_URL', BASE));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('listClaimPublishCandidates (GEO-3635)', () => {
  it('walks every page and keeps the timestamp exactly as geo-chat sent it', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      expect(url.pathname).toBe('/spaces/space-1/debates/claim-publish-candidates');
      if (!url.searchParams.get('cursor')) {
        return json({
          debates: [{ debate_id: 'a', claims_generated_at: '2026-11-12T21:40:03.123456Z' }],
          next_cursor: 'c1',
        });
      }
      return json({
        debates: [{ debate_id: 'b', claims_generated_at: '2026-11-12T21:00:00.000000Z' }],
        next_cursor: null,
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    expect(await listClaimPublishCandidates('space-1')).toEqual([
      { debateId: 'a', claimsGeneratedAt: '2026-11-12T21:40:03.123456Z' },
      { debateId: 'b', claimsGeneratedAt: '2026-11-12T21:00:00.000000Z' },
    ]);
  });

  it('is null on a geo-chat without the endpoint, and throws on any other failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 404 }))
    );
    expect(await listClaimPublishCandidates('space-1')).toBeNull();
    // geo-chat's own 404 for a space it has no row for is an empty space, not a missing endpoint.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json({ error: { code: 'space_not_found', message: 'x' } }, 404))
    );
    expect(await listClaimPublishCandidates('space-1')).toEqual([]);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 500 }))
    );
    await expect(listClaimPublishCandidates('space-1')).rejects.toBeInstanceOf(GeoChatRequestError);
  });

  it('stops at the per-space cap', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const limit = Number(new URL(String(input)).searchParams.get('limit'));
      return json({
        debates: Array.from({ length: limit }, (_, i) => ({ debate_id: `d${i}`, claims_generated_at: 't' })),
        next_cursor: 'more',
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    expect(await listClaimPublishCandidates('space-1', 150)).toHaveLength(150);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
