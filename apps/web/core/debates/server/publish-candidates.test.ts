import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GeoChatRequestError } from './debate-source';
import { listPublishCandidateDebateIds } from './publish-candidates';

const BASE = 'https://chat.example';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

/** A feed-listing debate, as the fallback path reads it. */
function listed(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    status: 'complete',
    turn_ends_at: '2026-07-30T11:58:00.000Z',
    completed_at: '2026-07-30T11:58:00.000Z',
    recording_cancelled_at: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.stubEnv('GEO_CHAT_API_BASE_URL', BASE);
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-07-30T12:00:00.000Z'));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('listPublishCandidateDebateIds (GEO-3157)', () => {
  it('walks every page of the candidates endpoint, so a debate older than the feed window is reached', async () => {
    // 120 newer candidates and, on the last page, the old one the feed's 50-debate window hid.
    const newer = Array.from({ length: 120 }, (_, index) => `newer-${index}`);
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      expect(url.origin + url.pathname).toBe(`${BASE}/spaces/space-1/debates/publish-candidates`);
      const cursor = url.searchParams.get('cursor');
      if (!cursor) return json({ debate_ids: newer.slice(0, 100), next_cursor: 'c1' });
      expect(cursor).toBe('c1');
      return json({ debate_ids: [...newer.slice(100), 'old-unpublished'], next_cursor: null });
    });
    vi.stubGlobal('fetch', fetchMock);

    const ids = await listPublishCandidateDebateIds('space-1');

    expect(ids).toHaveLength(121);
    expect(ids.at(-1)).toBe('old-unpublished');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('stops at the per-space cap, so one tick stays bounded', async () => {
    let page = 0;
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const limit = Number(new URL(String(input)).searchParams.get('limit'));
      page += 1;
      return json({
        debate_ids: Array.from({ length: limit }, (_, index) => `p${page}-${index}`),
        next_cursor: `c${page}`,
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const ids = await listPublishCandidateDebateIds('space-1', 150);

    expect(ids).toHaveLength(150);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // The second request asks only for what is left under the cap.
    expect(new URL(String(fetchMock.mock.calls[1][0])).searchParams.get('limit')).toBe('50');
  });

  it('falls back to the feed listing when geo-chat predates the endpoint (404)', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith('/publish-candidates')) return new Response('', { status: 404 });
      expect(url.pathname).toBe('/spaces/space-1/debates');
      return json({
        debates: [
          listed('eligible'),
          listed('cancelled', { recording_cancelled_at: '2026-07-30T11:59:00.000Z' }),
          listed('settling', { turn_ends_at: '2026-07-30T11:59:30.001Z' }),
        ],
        matches: [],
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(listPublishCandidateDebateIds('space-1')).resolves.toEqual(['eligible']);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('raises other geo-chat failures rather than falling back', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 503 }))
    );

    await expect(listPublishCandidateDebateIds('space-1')).rejects.toBeInstanceOf(GeoChatRequestError);
  });

  it('does not fall back on a 404 after the first page', async () => {
    let calls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        calls += 1;
        return calls === 1 ? json({ debate_ids: ['a'], next_cursor: 'c1' }) : new Response('', { status: 404 });
      })
    );

    await expect(listPublishCandidateDebateIds('space-1')).rejects.toMatchObject({ status: 404 });
  });
});
