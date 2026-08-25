import { Effect } from 'effect';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  ENTITY_ID_BATCH_SIZE,
  buildSearchPath,
  getBatchEntities,
  groupRestResults,
  hasDefaultSearchExcludedType,
  shouldIncludeRestSearchResult,
} from './queries';

const graphqlMock = vi.hoisted(() => vi.fn());

vi.mock('./graphql-client', () => ({
  graphql: (...args: unknown[]) => graphqlMock(...args),
}));

describe('buildSearchPath', () => {
  const ROOT = 'a19c345ab9866679b001d7d2138d88a1';
  const CURRENT = 'c9f267dcb0d270718c2a3c45a64afd32';
  const PERSONAL = 'f3dab79cb5a3d9d1759656dd5361d1c6';

  it('builds a minimal global path with default limit/offset', () => {
    expect(buildSearchPath({ query: 'football' })).toBe('/search?query=football&limit=10&offset=0');
  });

  it('omits additional_space_ids when the array is empty or undefined', () => {
    expect(buildSearchPath({ query: 'football', additionalSpaceIds: [] })).toBe(
      '/search?query=football&limit=10&offset=0'
    );
    expect(buildSearchPath({ query: 'football', additionalSpaceIds: undefined })).toBe(
      '/search?query=football&limit=10&offset=0'
    );
  });

  it('serializes additional_space_ids as a comma-joined list of hyphenated UUIDs', () => {
    const path = buildSearchPath({
      query: 'baseball',
      additionalSpaceIds: [ROOT, CURRENT, PERSONAL],
    });

    // URLSearchParams encodes commas as %2C.
    expect(path).toBe(
      '/search?query=baseball&limit=10&offset=0&additional_space_ids=' +
        'a19c345a-b986-6679-b001-d7d2138d88a1%2Cc9f267dc-b0d2-7071-8c2a-3c45a64afd32%2Cf3dab79c-b5a3-d9d1-7596-56dd5361d1c6'
    );
  });

  it('passes through ids that already contain hyphens', () => {
    const alreadyHyphenated = 'a19c345a-b986-6679-b001-d7d2138d88a1';
    const path = buildSearchPath({ query: 'q', additionalSpaceIds: [alreadyHyphenated] });
    expect(path).toContain('additional_space_ids=a19c345a-b986-6679-b001-d7d2138d88a1');
  });

  it('emits include_non_canonical only when the request scopes no additional spaces', () => {
    // Unscoped: the server filters. A client-side gate would only see the endpoint's
    // first 100 rows, which for a type dominated by non-canonical entities can contain
    // zero canonical ones — the Explore community-calls digest went empty that way.
    expect(buildSearchPath({ query: 'q', includeNonCanonical: false })).toBe(
      '/search?query=q&limit=10&offset=0&include_non_canonical=false'
    );

    // Only `false` filters; `true` and omitted both mean "no server-side filter".
    expect(buildSearchPath({ query: 'q', includeNonCanonical: true })).toBe('/search?query=q&limit=10&offset=0');
    expect(buildSearchPath({ query: 'q' })).toBe('/search?query=q&limit=10&offset=0');
  });

  it('suppresses include_non_canonical when additional_space_ids is in play', () => {
    // The endpoint ignores additional_space_ids when include_non_canonical=false, so
    // sending both drops the scoped spaces entirely — the regression #1949 fixed.
    const path = buildSearchPath({ query: 'q', includeNonCanonical: false, additionalSpaceIds: [ROOT] });

    expect(path).toContain('additional_space_ids=');
    expect(path).not.toContain('include_non_canonical');
  });

  it('still emits include_non_canonical when additional space ids are dropped for SPACE_SINGLE', () => {
    // space_id wins over additionalSpaceIds, so nothing is being widened and the
    // server-side filter is safe again.
    const path = buildSearchPath({
      query: 'q',
      includeNonCanonical: false,
      spaceId: ROOT,
      additionalSpaceIds: [ROOT],
    });

    expect(path).not.toContain('additional_space_ids=');
    expect(path).toContain('include_non_canonical=false');
  });

  it('omits additional_space_ids when space_id is set (SPACE_SINGLE scope)', () => {
    const path = buildSearchPath({
      query: 'q',
      spaceId: ROOT,
      typeIds: [CURRENT],
      additionalSpaceIds: [PERSONAL],
      limit: 25,
      offset: 50,
    });

    expect(path).toBe(
      '/search?query=q&limit=25&offset=50' +
        '&scope=SPACE_SINGLE&space_id=a19c345a-b986-6679-b001-d7d2138d88a1' +
        '&type_ids=c9f267dc-b0d2-7071-8c2a-3c45a64afd32'
    );
  });
});

describe('groupRestResults', () => {
  it('groups nested REST search rows into search results', () => {
    const results = groupRestResults([
      {
        entityId: '11111111-1111-1111-1111-111111111111',
        space: {
          id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
          name: 'Alpha',
          avatar: 'ipfs://alpha',
        },
        name: 'Valid result',
        types: [{ id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' }],
      },
      {
        entityId: '11111111-1111-1111-1111-111111111111',
        space: {
          id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
        },
        types: [{ id: 'dddddddd-dddd-dddd-dddd-dddddddddddd', name: 'Person' }],
      },
    ]);

    expect(results).toEqual([
      {
        id: '11111111111111111111111111111111',
        name: 'Valid result',
        description: null,
        types: [
          { id: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', name: null },
          { id: 'dddddddddddddddddddddddddddddddd', name: 'Person' },
        ],
        typesBySpace: {
          aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa: [{ id: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', name: null }],
          cccccccccccccccccccccccccccccccc: [{ id: 'dddddddddddddddddddddddddddddddd', name: 'Person' }],
        },
        namesBySpace: {
          aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa: 'Valid result',
          cccccccccccccccccccccccccccccccc: null,
        },
        spaces: [
          {
            id: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
            name: 'Alpha',
            description: null,
            image: 'ipfs://alpha',
            relations: [],
            spaceId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
            spaces: ['aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'],
            values: [],
            types: [],
          },
          {
            id: 'cccccccccccccccccccccccccccccccc',
            name: null,
            description: null,
            image: '',
            relations: [],
            spaceId: 'cccccccccccccccccccccccccccccccc',
            spaces: ['cccccccccccccccccccccccccccccccc'],
            values: [],
            types: [],
          },
        ],
      },
    ]);
  });
});

describe('hasDefaultSearchExcludedType', () => {
  it('matches excluded type ids in hyphenated and non-hyphenated forms', () => {
    expect(hasDefaultSearchExcludedType([{ id: 'b8803a86-65de-412b-bb35-7e0c84adf473' }])).toBe(true);
    expect(hasDefaultSearchExcludedType([{ id: 'B8803A8665DE412BBB357E0C84ADF473' }])).toBe(true);
  });

  it('does not match non-excluded type ids', () => {
    expect(hasDefaultSearchExcludedType([{ id: '11111111-1111-1111-1111-111111111111' }])).toBe(false);
  });
});

describe('shouldIncludeRestSearchResult canonical gating', () => {
  const SCOPED = 'a19c345ab9866679b001d7d2138d88a1';
  const result = (overrides: Partial<{ inCanonicalGraph: boolean; spaceId: string }>) => ({
    entityId: '11111111-1111-1111-1111-111111111111',
    space: { id: overrides.spaceId ?? 'cccccccc-cccc-cccc-cccc-cccccccccccc' },
    inCanonicalGraph: overrides.inCanonicalGraph,
  });
  const gate = { canonicalOnly: true, scopedSpaceIds: new Set([SCOPED]) };

  it('keeps canonical-graph results', () => {
    expect(shouldIncludeRestSearchResult(result({ inCanonicalGraph: true }), gate)).toBe(true);
  });

  it('keeps non-canonical results whose space is scoped (hex vs hyphenated match)', () => {
    expect(
      shouldIncludeRestSearchResult(
        result({ inCanonicalGraph: false, spaceId: 'a19c345a-b986-6679-b001-d7d2138d88a1' }),
        gate
      )
    ).toBe(true);
  });

  it('drops non-canonical out-of-scope results when canonical-only', () => {
    expect(shouldIncludeRestSearchResult(result({ inCanonicalGraph: false }), gate)).toBe(false);
    // Absent flag is treated as non-canonical.
    expect(shouldIncludeRestSearchResult(result({}), gate)).toBe(false);
  });

  it('keeps everything (subject to type exclusion) when not canonical-only', () => {
    expect(
      shouldIncludeRestSearchResult(result({ inCanonicalGraph: false }), {
        canonicalOnly: false,
        scopedSpaceIds: new Set(),
      })
    ).toBe(true);
    expect(shouldIncludeRestSearchResult(result({ inCanonicalGraph: false }))).toBe(true);
  });

  it('still excludes blocked types even when canonical', () => {
    const blockResult = {
      entityId: '11111111-1111-1111-1111-111111111111',
      space: { id: 'cccccccc-cccc-cccc-cccc-cccccccccccc' },
      inCanonicalGraph: true,
      types: [{ id: 'b8803a86-65de-412b-bb35-7e0c84adf473' }],
    };
    expect(shouldIncludeRestSearchResult(blockResult, gate)).toBe(false);
  });
});

/**
 * The batches ask for disjoint id sets, so they were only sequential by construction: a
 * caller handing in 300 ids paid six round trips end to end. `syncMany` pre-batches to
 * exactly one page and never hit it, but the callers that pass an unbounded id list
 * through — `core/blocks/data/filters.ts`, `partials/diffs/changed-entity.tsx`,
 * `core/sync/engine.ts`, the community-calls fetchers — did.
 */
describe('getBatchEntities', () => {
  afterEach(() => graphqlMock.mockReset());

  const idsFor = (count: number) => Array.from({ length: count }, (_, index) => `entity-${index}`);

  /** Resolves only once every batch has been asked for, so a sequential run deadlocks. */
  const gateOnAllBatches = (expectedBatches: number) => {
    let started = 0;
    let release = () => {};
    const allStarted = new Promise<void>(resolve => {
      release = resolve;
    });
    graphqlMock.mockImplementation((args: { variables: { filter: { id: { in: string[] } } } }) => {
      const batch = args.variables.filter.id.in;
      started += 1;
      if (started === expectedBatches) release();
      return Effect.promise(async () => {
        await allStarted;
        return batch.map(id => ({ id }));
      });
    });
    return () => started;
  };

  it('asks for every batch concurrently rather than one after the next', async () => {
    const ids = idsFor(ENTITY_ID_BATCH_SIZE * 3);
    const started = gateOnAllBatches(3);

    // Sequential code cannot finish this: batch 1 awaits a promise only batch 3 releases.
    const entities = await Effect.runPromise(getBatchEntities(ids));

    expect(started()).toBe(3);
    expect(entities).toHaveLength(ids.length);
  });

  it('keeps the results in the order the ids were given', async () => {
    const ids = idsFor(ENTITY_ID_BATCH_SIZE * 3);
    // Later batches answer first, so input order can only survive if it is preserved
    // deliberately rather than by arrival.
    graphqlMock.mockImplementation((args: { variables: { filter: { id: { in: string[] } } } }) => {
      const batch = args.variables.filter.id.in;
      const delay = batch[0] === ids[0] ? 20 : 0;
      return Effect.promise(
        () =>
          new Promise(resolve => {
            setTimeout(() => resolve(batch.map(id => ({ id }))), delay);
          })
      );
    });

    const entities = await Effect.runPromise(getBatchEntities(ids));

    expect(entities.map(entity => (entity as { id: string }).id)).toEqual(ids);
  });

  // The bound is the point, not an implementation detail: `EntitiesBatch` pulls every value
  // and relation per entity (0.31 MB for 50 claims, measured), so an unbounded fan-out on a
  // few hundred ids trades a queue we control for the browser's per-host connection limit.
  it('keeps the number of in-flight requests bounded', async () => {
    const ids = idsFor(ENTITY_ID_BATCH_SIZE * 20);
    let inFlight = 0;
    let peak = 0;
    graphqlMock.mockImplementation((args: { variables: { filter: { id: { in: string[] } } } }) => {
      const batch = args.variables.filter.id.in;
      return Effect.promise(async () => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await new Promise(resolve => setTimeout(resolve, 5));
        inFlight -= 1;
        return batch.map(id => ({ id }));
      });
    });

    await Effect.runPromise(getBatchEntities(ids));

    expect(peak).toBeGreaterThan(1);
    expect(peak).toBeLessThanOrEqual(6);
  });

  it('sends a single request when the ids fit one batch', async () => {
    graphqlMock.mockImplementation(() => Effect.succeed([]));

    await Effect.runPromise(getBatchEntities(idsFor(ENTITY_ID_BATCH_SIZE)));

    expect(graphqlMock).toHaveBeenCalledTimes(1);
  });
});
