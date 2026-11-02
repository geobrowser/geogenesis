import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchGaiaPairFit } from './gaia-pair-fit';

const ARGS = { userId: 'a'.repeat(32), candidateIds: ['b'.repeat(32)] };
const ITEM = {
  userId: 'b'.repeat(32),
  score: 0.5,
  parts: { interest: 0.5, disagreement: 0.5, sharedClaims: 1, opposed: 1, agreed: 0, accountWeight: 1 },
  disagreeing: true,
  reason: { kind: 'disagree', claimId: 'c'.repeat(32), name: 'X', text: 'You two disagree on X' },
};

beforeEach(() => {
  vi.stubEnv('GAIA_INTERNAL_TOKEN', 't'.repeat(40));
  vi.stubEnv('GAIA_INTERNAL_URL', 'https://gaia.example.test/');
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('fetchGaiaPairFit', () => {
  it('posts the pair to gaia with the internal token and returns its items', async () => {
    const fetcher = vi.fn(async () => Response.json({ ranking: {}, items: [ITEM], excluded: [] }));
    expect(await fetchGaiaPairFit(ARGS, { fetcher: fetcher as unknown as typeof fetch })).toEqual([ITEM]);
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://gaia.example.test/internal/pair-fit');
    expect((init.headers as Record<string, string>)['x-internal-token']).toBe('t'.repeat(40));
    expect(JSON.parse(String(init.body))).toEqual(ARGS);
  });

  it('is off without a token, and never calls gaia', async () => {
    vi.stubEnv('GAIA_INTERNAL_TOKEN', '');
    const fetcher = vi.fn();
    expect(await fetchGaiaPairFit(ARGS, { fetcher: fetcher as unknown as typeof fetch })).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('fails open: an error status, a throw or a malformed body is null', async () => {
    const answers = [
      async () => new Response('no', { status: 500 }),
      async () => {
        throw new DOMException('timed out', 'TimeoutError');
      },
      async () => Response.json({ nope: true }),
    ];
    for (const answer of answers) {
      expect(await fetchGaiaPairFit(ARGS, { fetcher: vi.fn(answer) as unknown as typeof fetch })).toBeNull();
    }
  });
});
