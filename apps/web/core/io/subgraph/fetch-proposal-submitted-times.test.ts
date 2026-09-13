import { Effect } from 'effect';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchProposalSubmittedTimes, getSubmittedTime } from './fetch-proposal-submitted-times';

const graphqlMock = vi.fn();
/**
 * Queries the fetcher actually issued. The spy's own call list isn't used for this:
 * under this harness the implementation is additionally invoked once with no payload
 * per real call, so counting raw invocations would double every expectation.
 */
const queriesIssued: string[] = [];

vi.mock('~/core/environment', () => ({
  Environment: {
    getConfig: () => ({ api: 'https://example.com/graphql', bundler: '', chainId: '19411', rpc: '' }),
  },
}));

vi.mock('./graphql', () => ({
  graphql: (...args: unknown[]) => graphqlMock(...args),
}));

/** Answer with `rows`, restricted to the ids each issued query actually asked about. */
function respondFor(handler: (query: string) => unknown) {
  graphqlMock.mockImplementation((arg: unknown) => {
    const query = (arg as { query?: string } | undefined)?.query;
    if (query === undefined) return Effect.succeed({ proposals: [] });
    queriesIssued.push(query);
    return handler(query);
  });
}

const BARE = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const DASHED = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const DASHED_BARE = DASHED.replace(/-/g, '');

/** Ids the API would return, as bare hex, with the given createdAt values. */
function respondWith(rows: { id: string; createdAt: string | null }[]) {
  respondFor(query => Effect.succeed({ proposals: rows.filter(r => query.includes(`"${r.id}"`)) }));
}

function hexId(n: number): string {
  return n.toString(16).padStart(32, '0');
}

describe('fetchProposalSubmittedTimes', () => {
  beforeEach(() => {
    graphqlMock.mockReset();
    queriesIssued.length = 0;
  });

  it('resolves a proposal whether the caller holds a dashed or bare id', async () => {
    // REST hands back bare ids and GraphQL takes bare ids, but callers elsewhere pass
    // the dashed form around, so lookups have to agree on one shape.
    respondWith([{ id: DASHED_BARE, createdAt: '1786969318' }]);

    const times = await fetchProposalSubmittedTimes([DASHED]);

    expect(getSubmittedTime(times, DASHED)).toBe(1786969318);
    expect(getSubmittedTime(times, DASHED_BARE)).toBe(1786969318);
  });

  it('asks once for a repeated id', async () => {
    respondWith([{ id: BARE, createdAt: '1786969318' }]);

    await fetchProposalSubmittedTimes([BARE, BARE, `${BARE.slice(0, 8)}-${BARE.slice(8)}`]);

    expect(queriesIssued).toHaveLength(1);
    expect(queriesIssued[0].match(new RegExp(`"${BARE}"`, 'g'))).toHaveLength(1);
  });

  it('splits past the API filter limit and merges every batch', async () => {
    const ids = Array.from({ length: 150 }, (_, i) => hexId(i + 1));
    respondWith(ids.map((id, i) => ({ id, createdAt: String(1_700_000_000 + i) })));

    const times = await fetchProposalSubmittedTimes(ids);

    expect(queriesIssued).toHaveLength(2);
    expect(times.size).toBe(150);
    expect(getSubmittedTime(times, ids[0])).toBe(1_700_000_000);
    expect(getSubmittedTime(times, ids[149])).toBe(1_700_000_149);
  });

  it('drops timestamps it cannot use rather than reporting a bogus date', async () => {
    // 0 is the sentinel for "no timestamp" throughout the governance rows, so a
    // null/garbage/zero createdAt has to land there rather than as a 1970 date.
    respondWith([
      { id: hexId(1), createdAt: null },
      { id: hexId(2), createdAt: 'not-a-number' },
      { id: hexId(3), createdAt: '0' },
      { id: hexId(4), createdAt: '1786969318' },
    ]);

    const times = await fetchProposalSubmittedTimes([hexId(1), hexId(2), hexId(3), hexId(4)]);

    expect(getSubmittedTime(times, hexId(1))).toBe(0);
    expect(getSubmittedTime(times, hexId(2))).toBe(0);
    expect(getSubmittedTime(times, hexId(3))).toBe(0);
    expect(getSubmittedTime(times, hexId(4))).toBe(1786969318);
  });

  it('keeps the batches that succeeded when one fails', async () => {
    // A dropped date costs one line of metadata; it must not take the proposals
    // list down, nor discard the batches that did come back.
    const ids = Array.from({ length: 150 }, (_, i) => hexId(i + 1));
    respondFor(query =>
      query.includes(`"${ids[0]}"`)
        ? Effect.fail(new Error('boom'))
        : Effect.succeed({ proposals: ids.slice(100).map(id => ({ id, createdAt: '1786969318' })) })
    );

    const times = await fetchProposalSubmittedTimes(ids);

    expect(getSubmittedTime(times, ids[0])).toBe(0);
    expect(getSubmittedTime(times, ids[100])).toBe(1786969318);
  });

  it('skips the request entirely when no id is usable', async () => {
    expect((await fetchProposalSubmittedTimes([])).size).toBe(0);
    expect((await fetchProposalSubmittedTimes(['not-an-id', ''])).size).toBe(0);
    expect(queriesIssued).toHaveLength(0);
  });
});
