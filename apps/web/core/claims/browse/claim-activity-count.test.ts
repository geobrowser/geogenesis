import { QueryClient } from '@tanstack/react-query';

import { describe, expect, it } from 'vitest';

import {
  adjustClaimActivityTotal,
  claimActivityCountsQueryKey,
  decodeClaimActivityCounts,
} from './claim-activity-count';
import type { ClaimActivityCount } from './claim-activity-fields';

function debate(comments: number, extracted: Array<number>) {
  return {
    fromEntity: {
      id: `debate${comments}${extracted.join('')}`,
      comments: { totalCount: comments },
      extracted: extracted.map((n, index) => ({
        fromEntity: { id: `extracted${index}`, comments: { totalCount: n } },
      })),
    },
  };
}

describe('decodeClaimActivityCounts', () => {
  it('adds up everything the feed shows by default', () => {
    const counts = decodeClaimActivityCounts({
      entities: [
        {
          id: 'claim1',
          comments: { totalCount: 3 },
          debates: [debate(2, [0, 1]), debate(0, [4])],
        },
      ],
    });

    // 3 claim comments + 2 debates + 3 extracted claims + (2 + 0) debate comments + (0 + 1 + 4)
    // comments on extracted claims.
    expect(counts.get('claim1')).toEqual({
      comments: 3,
      debates: 2,
      extractedClaims: 3,
      debateComments: 7,
      total: 15,
    });
  });

  it('keys by canonical id so a hyphenated lookup finds it', () => {
    const counts = decodeClaimActivityCounts({
      entities: [{ id: '3e4a0955-699a-4c8f-813f-cc803a3335ba', comments: { totalCount: 1 }, debates: [] }],
    });

    expect(counts.get('3e4a0955699a4c8f813fcc803a3335ba')?.total).toBe(1);
  });

  it('counts a claim nobody has touched as zero rather than leaving it out', () => {
    const counts = decodeClaimActivityCounts({
      entities: [{ id: 'claim1', comments: { totalCount: 0 }, debates: [] }],
    });

    expect(counts.get('claim1')?.total).toBe(0);
  });

  // A debate with no transcript yet is still a debate — it counts, its absent claims do not.
  it('counts a debate that produced no claims', () => {
    const counts = decodeClaimActivityCounts({
      entities: [{ id: 'claim1', comments: { totalCount: 0 }, debates: [debate(0, [])] }],
    });

    expect(counts.get('claim1')).toMatchObject({ debates: 1, extractedClaims: 0, total: 1 });
  });

  it('survives nulls anywhere the API may return them', () => {
    const counts = decodeClaimActivityCounts({
      entities: [
        null,
        { id: null, comments: null, debates: null },
        {
          id: 'claim1',
          comments: null,
          debates: [null, { fromEntity: null }, { fromEntity: { id: 'd', comments: null, extracted: [null] } }],
        },
      ],
    });

    expect([...counts.keys()]).toEqual(['claim1']);
    expect(counts.get('claim1')).toMatchObject({ comments: 0, debates: 1, extractedClaims: 0, total: 1 });
  });

  // A nested list inside a batched `entities(filter: { id: { in: … } })` query stops at ten rows
  // without erroring, so the list is the wrong thing to measure. The aggregate beside it is not
  // capped: a debate with 22 extracted claims returns `totalCount: 22` next to a ten-item list.
  it('takes the extracted total from the aggregate, not the length of a truncated list', () => {
    const counts = decodeClaimActivityCounts({
      entities: [
        {
          id: 'claim1',
          comments: { totalCount: 0 },
          debates: [
            {
              fromEntity: {
                id: 'debate1',
                comments: { totalCount: 0 },
                extractedCount: { totalCount: 22 },
                extracted: Array.from({ length: 10 }, (_, index) => ({
                  fromEntity: { id: `extracted${index}`, comments: { totalCount: 0 } },
                })),
              },
            },
          ],
        },
      ],
    });

    expect(counts.get('claim1')).toMatchObject({ debates: 1, extractedClaims: 22, total: 23 });
  });

  // Testnet has a debate carrying two `Claims` relations to the same claim. Each is its own backlink
  // row, but the feed reads debates as entities and draws one — so counting rows double-counts the
  // whole subtree under it.
  it('counts a debate once however many times it links the claim', () => {
    const twice = {
      fromEntity: {
        id: 'debate1',
        comments: { totalCount: 2 },
        extractedCount: { totalCount: 22 },
        extracted: [],
      },
    };

    const counts = decodeClaimActivityCounts({
      entities: [{ id: 'claim1', comments: { totalCount: 0 }, debates: [twice, twice] }],
    });

    expect(counts.get('claim1')).toMatchObject({ debates: 1, extractedClaims: 22, debateComments: 2, total: 25 });
  });

  it('is empty when nothing came back', () => {
    expect(decodeClaimActivityCounts({}).size).toBe(0);
    expect(decodeClaimActivityCounts({ entities: null }).size).toBe(0);
  });
});

/**
 * The reader's own comment, against a refetch that was already on its way.
 *
 * This aggregate is held for a minute, so a mount past that — or a reconnect — starts a background
 * fetch. That request answers with a number from before the comment existed, and if it lands after the
 * optimistic write it puts that number back: the heading drops a comment still sitting in the list
 * underneath it. Timestamps cannot separate the two, because the response was asked for before the
 * publish and arrives after it, so the write cancels first instead.
 */
describe('adjustClaimActivityTotal', () => {
  const CLAIM = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  const key = claimActivityCountsQueryKey([CLAIM]);

  function seeded(total: number) {
    return new Map([[CLAIM, { total, comments: 1, debates: 0, extractedClaims: 0 } as ClaimActivityCount]]);
  }

  function totalIn(client: QueryClient) {
    return client.getQueryData<Map<string, ClaimActivityCount>>(key)?.get(CLAIM)?.total;
  }

  it('counts the comment', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(key, seeded(33));

    await adjustClaimActivityTotal(client, CLAIM, 1);

    expect(totalIn(client)).toBe(34);
  });

  it('keeps it when a refetch that started earlier lands afterwards', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(key, seeded(33));

    // A fetch already in flight, holding the pre-publish answer.
    let landPreIndexAnswer = (_value: Map<string, ClaimActivityCount>) => {};
    const inFlight = new Promise<Map<string, ClaimActivityCount>>(resolve => {
      landPreIndexAnswer = resolve;
    });
    const fetching = client.fetchQuery({ queryKey: key, queryFn: () => inFlight, staleTime: 0 }).catch(() => {});

    await adjustClaimActivityTotal(client, CLAIM, 1);
    expect(totalIn(client)).toBe(34);

    // The indexer has not caught up, so what was already on its way still says 33.
    landPreIndexAnswer(seeded(33));
    await fetching;
    await Promise.resolve();

    expect(totalIn(client)).toBe(34);
  });

  it('gives the count back when the publish is rejected', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(key, seeded(33));

    await adjustClaimActivityTotal(client, CLAIM, 1);
    await adjustClaimActivityTotal(client, CLAIM, -1);

    expect(totalIn(client)).toBe(33);
  });

  /**
   * The cancel has to be as narrow as the write, and it was not.
   *
   * Matched on the key alone, a comment published while the very first request was still out aborted
   * that request — and then the write bailed, because there was no entry to adjust. Nothing was left to
   * answer, so the heading stayed on its incomplete fallback until something else happened to refetch.
   * A query with no baseline has nothing to overwrite, so there is no race worth cancelling.
   */
  it('does not abort the first request, which is the only thing that can answer', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    let landFirstAnswer = (_value: Map<string, ClaimActivityCount>) => {};
    const firstRequest = new Promise<Map<string, ClaimActivityCount>>(resolve => {
      landFirstAnswer = resolve;
    });
    const fetching = client.fetchQuery({ queryKey: key, queryFn: () => firstRequest, staleTime: 0 });

    await adjustClaimActivityTotal(client, CLAIM, 1);

    landFirstAnswer(seeded(33));
    await fetching;

    // The aggregate answered for itself, which is what the delta gives way to when there is no
    // baseline to adjust. Aborted, this would be `undefined` and the heading would have nothing.
    expect(totalIn(client)).toBe(33);
  });

  it('leaves a claim it has no answer for alone rather than inventing one', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    await adjustClaimActivityTotal(client, CLAIM, 1);

    expect(client.getQueryData(key)).toBeUndefined();
  });

  // Another claim's request is not this claim's business: abandoning it would cost it a refetch for
  // nothing.
  it('does not touch a cached set this claim is not in', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const otherKey = claimActivityCountsQueryKey(['bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb']);
    client.setQueryData(otherKey, seeded(7));

    await adjustClaimActivityTotal(client, CLAIM, 1);

    expect(client.getQueryData<Map<string, ClaimActivityCount>>(otherKey)?.get(CLAIM)?.total).toBe(7);
  });
});
