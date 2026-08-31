import { describe, expect, it, vi } from 'vitest';

// The route pulls in the Anthropic client, the Upstash limiters, and the SDK id
// constants at import time; none matter for the pure helpers under test.
vi.mock('@ai-sdk/anthropic', () => ({ createAnthropic: () => () => ({}) }));
vi.mock('../rate-limit', () => ({ ipCeilingLimit: {}, loggedInLimit: {} }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock('~/core/environment/environment', () => ({
  getConfig: () => ({ chainId: '1', rpc: 'https://rpc.example', api: 'https://api.example/graphql' }),
}));

const { clampAnswer, collectRows, collectTotalCount, validateQuestion } = await import('./route');

describe('validateQuestion', () => {
  it('accepts a normal question', () => {
    expect(validateQuestion('  how many articles this week?  ')).toBe('how many articles this week?');
  });

  it('rejects empty, blank, and non-string input', () => {
    expect(validateQuestion('')).toBeNull();
    expect(validateQuestion('   ')).toBeNull();
    expect(validateQuestion(null)).toBeNull();
    expect(validateQuestion(42)).toBeNull();
  });

  it('rejects a question too long to be one', () => {
    expect(validateQuestion('a'.repeat(1_001))).toBeNull();
  });

  it('accepts a question long enough to carry several resolved ids', () => {
    expect(validateQuestion('a'.repeat(900))).toHaveLength(900);
  });
});

describe('clampAnswer', () => {
  it('leaves a normal answer alone', () => {
    expect(clampAnswer('  13 articles.  ')).toBe('13 articles.');
  });

  it('truncates a runaway answer', () => {
    const clamped = clampAnswer('x'.repeat(5_000));
    expect(clamped.length).toBeLessThanOrEqual(4_000);
    expect(clamped.endsWith('…')).toBe(true);
  });
});

describe('collectRows', () => {
  const id = (n: number) => n.toString(16).padStart(32, '0');

  it('finds rows wherever the sub-agent nested them', () => {
    // The sub-agent writes its own queries, so the response shape isn't fixed —
    // `entities` is flat while `entity.relations` is a connection with `nodes`.
    const data = { entitiesConnection: { nodes: [{ id: id(1), name: 'Ether', spaceIds: [id(9)] }] } };

    expect(collectRows(data)).toEqual([{ id: id(1), name: 'Ether', spaceId: id(9) }]);
  });

  it('skips id-only objects', () => {
    // Relation edges and type stubs carry ids but are not rows the user asked
    // to see; including them would pad the answer with noise.
    const data = { entities: [{ id: id(1) }, { id: id(2), name: 'Real' }] };

    expect(collectRows(data)).toEqual([{ id: id(2), name: 'Real', spaceId: null }]);
  });

  it('deduplicates an entity that appears more than once', () => {
    const data = { a: [{ id: id(1), name: 'Ether' }], b: [{ id: id(1), name: 'Ether' }] };

    expect(collectRows(data)).toHaveLength(1);
  });

  it('caps the number of rows returned', () => {
    // A block can hold 1,000 entities. Rows ride along in the main turn's
    // context and get re-read on every resubmit, so the cap is the point.
    const data = { entities: Array.from({ length: 200 }, (_, i) => ({ id: id(i + 1), name: `E${i}` })) };

    expect(collectRows(data)).toHaveLength(50);
  });

  it('ignores strings that only look like ids', () => {
    const data = { entities: [{ id: 'not-a-uuid', name: 'Nope' }] };

    expect(collectRows(data)).toEqual([]);
  });

  it('returns nothing rather than throwing on a shape it cannot read', () => {
    // Rows are a bonus; the answer is the product. Finding none is normal.
    expect(collectRows(null)).toEqual([]);
    expect(collectRows('a string')).toEqual([]);
    expect(collectRows({ totalCount: 13 })).toEqual([]);
  });
});

describe('collectTotalCount', () => {
  it('reads the count from a connection', () => {
    expect(collectTotalCount({ entitiesConnection: { totalCount: 13, nodes: [] } })).toBe(13);
  });

  it('finds the count when no rows came back at all', () => {
    // The cheapest query in the skill is `first: 0` with `totalCount` — a count
    // question often returns zero rows, and this is the whole answer.
    expect(collectTotalCount({ entitiesConnection: { totalCount: 247, nodes: [] } })).toBe(247);
  });

  it('prefers the shallower count when two are nested at different depths', () => {
    // A per-row count sitting deeper must not win over the one that answers the
    // question. Ordered so a depth-first walk would reach the inner 4 before
    // the outer 13 — reporting "4 articles" when the answer is 13.
    const data = {
      page: { block: { rows: { totalCount: 4 } } },
      entitiesConnection: { totalCount: 13 },
    };

    expect(collectTotalCount(data)).toBe(13);
  });

  it('returns undefined when the query never asked for one', () => {
    // Must stay undefined rather than 0 — "0 results" is a different claim
    // from "we didn't count", and the caller renders them differently.
    expect(collectTotalCount({ entities: [{ id: 'a', name: 'A' }] })).toBeUndefined();
    expect(collectTotalCount(null)).toBeUndefined();
  });

  it('reports a genuine zero as zero', () => {
    expect(collectTotalCount({ entitiesConnection: { totalCount: 0 } })).toBe(0);
  });

  it('never reports a row\'s own count as the list\'s', () => {
    // A flat `entities` list has no totalCount of its own. Walking into the
    // first row found its `relations.totalCount` and returned it — so a
    // two-entity answer whose first entity has three relations was reported
    // as "3", and the closer is told to trust this number over the rows.
    const data = {
      entities: [
        { id: 'a', name: 'A', relations: { totalCount: 3, nodes: [] } },
        { id: 'b', name: 'B', relations: { totalCount: 9, nodes: [] } },
      ],
    };

    expect(collectTotalCount(data)).toBeUndefined();
  });

  it('still reads a single entity\'s own nested count', () => {
    // No array hop here: "how many relations does X have" is a real question
    // and this is its shape.
    expect(collectTotalCount({ entity: { relations: { totalCount: 7 } } })).toBe(7);
  });
});
