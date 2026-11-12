import { describe, expect, it, vi } from 'vitest';

import { DEBATE_TYPE_ID } from './best-debates';
import { fetchBestDebatesWindow } from './fetch-best-debates-window';

describe('fetchBestDebatesWindow', () => {
  it('asks for Debates in the range in Best order and keeps that order', async () => {
    const fromMs = Date.UTC(2026, 10, 5, 5);
    const toMs = Date.UTC(2026, 10, 12, 5);
    const request = vi.fn().mockResolvedValue({
      entitiesRankedForFeedByType: [
        { id: 'BBBBBBBB-0000-0000-0000-000000000000', name: 'Best', createdAt: String(fromMs / 1000 + 10) },
        null,
        { id: 'a0', name: 'No date', createdAt: null },
        { id: 'c0', name: 'Second', createdAt: String(toMs / 1000 - 1) },
        // Edges are re-checked here: exactly toMs is the next window.
        { id: 'd0', name: 'Too late', createdAt: String(toMs / 1000) },
      ],
    });

    const debates = await fetchBestDebatesWindow({ fromMs, toMs }, request);

    expect(request).toHaveBeenCalledWith({
      typeIds: [DEBATE_TYPE_ID],
      createdAfter: String(fromMs / 1000),
      createdBefore: String(toMs / 1000),
      maxPerType: 2000,
      first: 1000,
    });
    expect(debates).toEqual([
      { id: 'bbbbbbbb000000000000000000000000', name: 'Best', createdAtMs: fromMs + 10_000 },
      { id: 'c0', name: 'Second', createdAtMs: toMs - 1000 },
    ]);
  });
});
