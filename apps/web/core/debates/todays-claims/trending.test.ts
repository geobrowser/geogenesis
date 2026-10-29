import { Effect } from 'effect';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { graphql } from '~/core/io/graphql-client';

import { isTrendingListing, loadLastListedOn } from './trending';

vi.mock('~/core/io/graphql-client', () => ({ graphql: vi.fn() }));

const mockedGraphql = vi.mocked(graphql);

function answer(rows: { id: string; lastListedOn: string | null }[]) {
  mockedGraphql.mockImplementation(({ decoder }: any) => Effect.succeed(decoder({ entities: rows })) as any);
}

afterEach(() => {
  mockedGraphql.mockReset();
});

describe('isTrendingListing', () => {
  // 14:00 UTC on 29 Oct is 10:00 in New York, the same calendar day.
  const now = new Date('2026-10-29T14:00:00Z');

  it("is trending on today's and yesterday's agenda", () => {
    expect(isTrendingListing('2026-10-29', now)).toBe(true);
    expect(isTrendingListing('2026-10-28', now)).toBe(true);
  });

  it('lapses after yesterday with no cleanup', () => {
    expect(isTrendingListing('2026-10-27', now)).toBe(false);
  });

  it('is not trending without a listing, or for an agenda dated ahead', () => {
    expect(isTrendingListing(null, now)).toBe(false);
    expect(isTrendingListing(undefined, now)).toBe(false);
    expect(isTrendingListing('2026-10-30', now)).toBe(false);
  });

  it('counts days in New York, not UTC', () => {
    // 02:00 UTC on 30 Oct is still 29 Oct in New York (22:00), so 28 Oct is still yesterday.
    const lateEvening = new Date('2026-10-30T02:00:00Z');
    expect(isTrendingListing('2026-10-28', lateEvening)).toBe(true);
    expect(isTrendingListing('2026-10-30', lateEvening)).toBe(false);
  });
});

describe('loadLastListedOn', () => {
  it('asks for every card mounting together in one request', async () => {
    answer([
      { id: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', lastListedOn: '2026-10-29' },
      { id: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', lastListedOn: null },
    ]);

    const [first, second, missing] = await Promise.all([
      loadLastListedOn('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'),
      loadLastListedOn('bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'),
      loadLastListedOn('cccccccccccccccccccccccccccccccc'),
    ]);

    expect(mockedGraphql).toHaveBeenCalledTimes(1);
    expect(mockedGraphql.mock.calls[0][0].variables).toEqual({
      ids: ['aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', 'cccccccccccccccccccccccccccccccc'],
    });
    expect(first).toBe('2026-10-29');
    expect(second).toBeNull();
    expect(missing).toBeNull();
  });

  it('asks once for an id two cards share', async () => {
    answer([{ id: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', lastListedOn: '2026-10-28' }]);

    const results = await Promise.all([
      loadLastListedOn('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'),
      loadLastListedOn('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'),
    ]);

    expect(mockedGraphql.mock.calls[0][0].variables).toEqual({ ids: ['aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'] });
    expect(results).toEqual(['2026-10-28', '2026-10-28']);
  });

  it('splits a long list into requests of 100', async () => {
    mockedGraphql.mockImplementation(({ decoder }: any) => Effect.succeed(decoder({ entities: [] })) as any);
    const ids = Array.from({ length: 150 }, (_, index) => index.toString(16).padStart(32, '0'));

    await Promise.all(ids.map(loadLastListedOn));

    expect(mockedGraphql).toHaveBeenCalledTimes(2);
    expect(mockedGraphql.mock.calls[0][0].variables.ids).toHaveLength(100);
    expect(mockedGraphql.mock.calls[1][0].variables.ids).toHaveLength(50);
  });

  it('fails every card in a failed request, so the query can retry', async () => {
    mockedGraphql.mockImplementation(() => Effect.fail(new Error('down')) as any);

    await expect(loadLastListedOn('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')).rejects.toBeTruthy();
  });
});
