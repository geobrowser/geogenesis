import { Effect, Layer } from 'effect';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CALL_SCHEMA } from './constants';
import { fetchCommunityCallsForExplore } from './fetch-community-calls';

const getResultsPage = vi.fn();
const getBatchEntities = vi.fn();
const getSpaces = vi.fn();

vi.mock('~/core/io/queries', () => ({
  getAllEntities: vi.fn(),
  getResultsPage: (...args: unknown[]) => getResultsPage(...args),
  getBatchEntities: (...args: unknown[]) => getBatchEntities(...args),
  getSpaces: (...args: unknown[]) => getSpaces(...args),
}));

// The real Telemetry layer wires up an OTel exporter; the spans are incidental here.
vi.mock('~/app/api/telemetry', () => ({ Telemetry: Layer.empty }));

const SPACE_ID = '41e851610e13a19441c4d980f2f2ce6b';
const CALL_ID = '9fbd6edaa4064498b939175e53a239da';
const SCHEDULE = 'DTSTART:20260128T140000Z\nDTEND:20260128T160000Z';

function searchPage(overrides: Partial<{ results: { id: string }[]; total: number }> = {}) {
  const results = overrides.results ?? [{ id: CALL_ID }];
  return Effect.succeed({
    results,
    total: overrides.total ?? results.length,
    rawCount: results.length,
    serverCount: results.length,
  });
}

beforeEach(() => {
  getResultsPage.mockReset();
  getBatchEntities.mockReset();
  getSpaces.mockReset();

  getBatchEntities.mockReturnValue(
    Effect.succeed([
      {
        id: CALL_ID,
        name: 'AI community call',
        description: null,
        spaces: [SPACE_ID],
        values: [{ property: { id: CALL_SCHEMA.MEETING_TIME_PROPERTY }, value: SCHEDULE, spaceId: SPACE_ID }],
      },
    ])
  );
  getSpaces.mockReturnValue(Effect.succeed([{ id: SPACE_ID, entity: { name: 'AI', image: null } }]));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('fetchCommunityCallsForExplore', () => {
  it('asks the server for canonical calls only, one page', async () => {
    // The whole point of GEO-2480: the canonical gate has to be applied at the source.
    // The endpoint caps a page at 100 rows, and on testnet 374 of 382 Community Call
    // entities are non-canonical test-space rows — every one of the 8 curated calls sat
    // past offset 100, so a client-side gate over page 1 filtered down to nothing and the
    // Explore panel disappeared. Scoping no spaces is what earns the server-side filter
    // (see buildSearchPath), so this request must not acquire additionalSpaceIds.
    getResultsPage.mockReturnValue(searchPage());

    await fetchCommunityCallsForExplore();

    expect(getResultsPage).toHaveBeenCalledTimes(1);
    const args = getResultsPage.mock.calls[0][0];
    expect(args.includeNonCanonical).toBe(false);
    expect(args.limit).toBe(100);
    expect(args.additionalSpaceIds).toBeUndefined();
    expect(args.spaceId).toBeUndefined();
  });

  it('joins each call to its space name and avatar', async () => {
    getResultsPage.mockReturnValue(searchPage());

    const calls = await fetchCommunityCallsForExplore();

    expect(calls).toEqual([
      {
        callId: CALL_ID,
        spaceId: SPACE_ID,
        name: 'AI community call',
        description: null,
        schedule: SCHEDULE,
        spaceName: 'AI',
        spaceImage: null,
      },
    ]);
  });

  it('reports a failed search instead of rendering it as "no calls"', async () => {
    // Both outcomes hide the Explore section, so without the log they are
    // indistinguishable in production — which is why this shipped unnoticed.
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    getResultsPage.mockReturnValue(Effect.fail(new Error('boom')));

    await expect(fetchCommunityCallsForExplore()).resolves.toEqual([]);
    expect(error).toHaveBeenCalled();
    expect(getBatchEntities).not.toHaveBeenCalled();
  });

  it('warns when the canonical set outgrows a single page', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    getResultsPage.mockReturnValue(searchPage({ total: 140 }));

    await fetchCommunityCallsForExplore();

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('140'));
  });

  it('stays quiet when the results fit on one page', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    getResultsPage.mockReturnValue(searchPage({ total: 8 }));

    await fetchCommunityCallsForExplore();

    expect(warn).not.toHaveBeenCalled();
  });

  it('drops calls with no schedule rather than rendering an undated card', async () => {
    getResultsPage.mockReturnValue(searchPage());
    getBatchEntities.mockReturnValue(
      Effect.succeed([{ id: CALL_ID, name: 'No schedule', description: null, spaces: [SPACE_ID], values: [] }])
    );

    await expect(fetchCommunityCallsForExplore()).resolves.toEqual([]);
  });
});
