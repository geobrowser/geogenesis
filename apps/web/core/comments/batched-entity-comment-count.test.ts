import { Effect } from 'effect';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { getEntityCommentCountBatched } from './batched-entity-comment-count';

const counts = vi.hoisted(() => ({ fetch: vi.fn() }));

vi.mock('./use-entity-comment-counts', () => ({ getEntityCommentCounts: counts.fetch }));

const id = (n: number) => n.toString(16).padStart(32, '0');

afterEach(() => {
  counts.fetch.mockReset();
});

describe('getEntityCommentCountBatched', () => {
  it('asks for every row requested in the same tick in one request', async () => {
    counts.fetch.mockImplementation((ids: string[]) => Effect.succeed(new Map(ids.map((x, i) => [x, i + 1]))));

    const answers = await Promise.all([1, 2, 3].map(n => getEntityCommentCountBatched(id(n))));

    expect(counts.fetch).toHaveBeenCalledTimes(1);
    expect(counts.fetch).toHaveBeenCalledWith([id(1), id(2), id(3)]);
    expect(answers).toEqual([1, 2, 3]);
  });

  it('answers every caller that asked for the same row', async () => {
    counts.fetch.mockImplementation(() => Effect.succeed(new Map([[id(1), 4]])));

    const answers = await Promise.all([getEntityCommentCountBatched(id(1)), getEntityCommentCountBatched(id(1))]);

    expect(counts.fetch).toHaveBeenCalledWith([id(1)]);
    expect(answers).toEqual([4, 4]);
  });

  it('splits a large set into requests of at most 100', async () => {
    counts.fetch.mockImplementation(() => Effect.succeed(new Map()));

    await Promise.all(Array.from({ length: 250 }, (_, n) => getEntityCommentCountBatched(id(n))));

    expect(counts.fetch.mock.calls.map(([ids]) => ids.length)).toEqual([100, 100, 50]);
  });

  it('reports no comments for a row the server does not return', async () => {
    counts.fetch.mockImplementation(() => Effect.succeed(new Map()));

    await expect(getEntityCommentCountBatched(id(1))).resolves.toBe(0);
  });

  it('fails every row in a request that failed', async () => {
    counts.fetch.mockImplementation(() => Effect.fail(new Error('down')));

    const answers = await Promise.allSettled([
      getEntityCommentCountBatched(id(1)),
      getEntityCommentCountBatched(id(2)),
    ]);

    expect(answers.map(a => a.status)).toEqual(['rejected', 'rejected']);
  });

  it('starts a new request for rows asked for after one has gone out', async () => {
    counts.fetch.mockImplementation(() => Effect.succeed(new Map()));

    await getEntityCommentCountBatched(id(1));
    await getEntityCommentCountBatched(id(2));

    expect(counts.fetch).toHaveBeenCalledTimes(2);
  });
});
