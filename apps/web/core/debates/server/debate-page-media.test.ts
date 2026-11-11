import { describe, expect, it, vi } from 'vitest';

import { fetchDebatePageMedia } from './debate-page-media';

const DEBATE_ID = '01a0448a61d371018434a20fdadf6f97';
const BASE_URL = 'https://geo-chat.test';
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const media = (fetchImpl: (input: string, init?: RequestInit) => Promise<Response>, id = DEBATE_ID) =>
  fetchDebatePageMedia(id, { fetchImpl, baseUrl: BASE_URL, timeoutMs: 50 });

describe('fetchDebatePageMedia (GEO-3604)', () => {
  it('reads the debate’s media anonymously and uncached, by its hyphenated id', async () => {
    const body = { job: null, artifacts: [{ kind: 'speaker_still_slot_1' }] };
    const fetchImpl = vi.fn().mockResolvedValue(json(200, body));

    await expect(media(fetchImpl)).resolves.toEqual(body);
    expect(fetchImpl).toHaveBeenCalledWith(
      `${BASE_URL}/debates/01a0448a-61d3-7101-8434-a20fdadf6f97/media`,
      expect.objectContaining({ cache: 'no-store', signal: expect.any(AbortSignal) })
    );
    expect((fetchImpl.mock.calls[0][1] as RequestInit).headers).toBeUndefined();
  });

  it('is null on a failed answer, an unexpected body or a network error', async () => {
    await expect(media(vi.fn().mockResolvedValue(json(503, {})))).resolves.toBeNull();
    await expect(media(vi.fn().mockResolvedValue(json(200, { job: null })))).resolves.toBeNull();
    await expect(media(vi.fn().mockRejectedValue(new Error('down')))).resolves.toBeNull();
  });

  it('does not ask about an id geo-chat never minted', async () => {
    const fetchImpl = vi.fn();
    await expect(media(fetchImpl, 'not-a-debate')).resolves.toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
