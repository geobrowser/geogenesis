import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';

import * as React from 'react';

import * as Effect from 'effect/Effect';
import { type Mock, beforeEach, describe, expect, it, vi } from 'vitest';

import { graphql } from '~/core/io/graphql-client';

import { TAGGED_CLAIMS_LIMIT, dedupeTaggedClaims, fetchTaggedClaims, useTaggedClaims } from './tagged-claims';

/** Any tag: this module is the same query whichever entity it points at. */
const TAG = 'ec3086a54ddf43d8aaefd6cc6e1b0556';

vi.mock('~/core/io/graphql-client', () => ({
  graphql: vi.fn(),
}));

const graphqlMock = graphql as unknown as Mock;

const SPACE = '019fedae72b67ab2927adf044d57c566';

/**
 * One claim as `entitiesConnection` returns it: the entity, with the tag relations that put it on
 * the list. Several spaces means several relations, and the decoder emits one row apiece.
 */
function node(id: string, name: string, rankingScore: string | null, ...spaceIds: string[]) {
  const spaces = spaceIds.length > 0 ? spaceIds : [SPACE];
  return { id, name, description: null, rankingScore, relationsList: spaces.map(spaceId => ({ spaceId })) };
}

/** Runs the module's own decoder over one page of `nodes`, which is where the ordering lives. */
function respondWith(nodes: unknown[]) {
  respondWithPages([nodes]);
}

/** Answers each successive request with the next page, the last one closing the connection. */
function respondWithPages(pages: unknown[][]) {
  let index = 0;
  graphqlMock.mockImplementation(({ decoder }) => {
    const nodes = pages[index] ?? [];
    const hasNextPage = index < pages.length - 1;
    index += 1;
    return Effect.succeed(
      decoder({
        entitiesConnection: {
          pageInfo: { hasNextPage, endCursor: `cursor-${index}` },
          nodes,
        },
      })
    );
  });
}

function namesOf(claims: Array<{ name: string }>) {
  return claims.map(claim => claim.name);
}

describe('fetchTaggedClaims', () => {
  beforeEach(() => {
    graphqlMock.mockReset();
  });

  // Unordered, the relations connection comes back by relation id — random v4s, so a fixed shuffle
  // with no relationship to anything a reader would recognise. This is Explore's "Best" order.
  it('orders by ranking score, highest first', async () => {
    respondWith([node('a1', 'Middling', '120.5'), node('a2', 'Best', '900.25'), node('a3', 'Worst', '3')]);

    expect(namesOf((await fetchTaggedClaims(TAG)).claims)).toEqual(['Best', 'Middling', 'Worst']);
  });

  // `entities_ranked_for_feed` breaks ties on `entity_id DESC`, so two claims on the same score land
  // here exactly where Explore puts them.
  it('breaks a tie on entity id, descending, as the ranked feed does', async () => {
    respondWith([node('a1', 'Lower id', '500'), node('a3', 'Higher id', '500'), node('a2', 'Middle id', '500')]);

    expect(namesOf((await fetchTaggedClaims(TAG)).claims)).toEqual(['Higher id', 'Middle id', 'Lower id']);
  });

  // A claim the feed has never scored isn't in that table, so there is no place in the order for
  // it. Last rather than dropped: a curator tagged it deliberately.
  it('puts an unscored claim last rather than dropping it', async () => {
    respondWith([node('a1', 'Unscored', null), node('a2', 'Scored', '1')]);

    expect(namesOf((await fetchTaggedClaims(TAG)).claims)).toEqual(['Scored', 'Unscored']);
  });

  // Every tag survives the fetch. Which space a viewer may be shown is a question only the callers
  // can answer, so collapsing here would make an arbitrary one authoritative — and drop the claim
  // outright when that one falls outside their allowlist and another tag would have passed.
  it('keeps every tag when a claim is featured in more than one space', async () => {
    const OTHER_SPACE = '019fedae72b67ab2927adf044d57c599';
    respondWith([node('a1', 'Tagged twice', '10'), node('a1', 'Tagged twice', '10', OTHER_SPACE)]);

    expect((await fetchTaggedClaims(TAG)).claims.map(claim => claim.spaceId)).toEqual([SPACE, OTHER_SPACE]);
  });

  // The guard and the corpus ending on it are the same shape from the inside; only the server's
  // count separates them. Without it, a tag with exactly 5,000 claims reported itself truncated.
  it('calls a complete list complete, even at exactly the guard', async () => {
    graphqlMock.mockImplementation(({ decoder }) =>
      Effect.succeed(
        decoder({
          entitiesConnection: {
            totalCount: TAGGED_CLAIMS_LIMIT,
            pageInfo: { hasNextPage: false, endCursor: null },
            nodes: Array.from({ length: TAGGED_CLAIMS_LIMIT }, (_, index) => node(`a${index}`, `Claim ${index}`, '1')),
          },
        })
      )
    );

    const result = await fetchTaggedClaims(TAG);

    expect(result.claims).toHaveLength(TAGGED_CLAIMS_LIMIT);
    expect(result.truncated).toBe(false);
  });

  // A claim with no name has nothing to render, and a tag carrying no space can't be grouped for the
  // geo-chat lookups or tested against the viewer's spaces.
  it('drops rows it could not render or scope', async () => {
    respondWith([
      node('a1', 'Fine', '10'),
      // Unnamed: nothing to draw.
      { id: 'a2', name: null, description: null, rankingScore: '99', relationsList: [{ spaceId: SPACE }] },
      // Named, but the tag relation carries no space.
      { id: 'a3', name: 'No space', description: null, rankingScore: '99', relationsList: [{ spaceId: null }] },
      // Named, but no tag relation came back at all.
      { id: 'a4', name: 'No tag', description: null, rankingScore: '99', relationsList: [] },
      { id: 'a5', name: 'Null relations', description: null, rankingScore: '99', relationsList: null },
      null,
    ]);

    expect(namesOf((await fetchTaggedClaims(TAG)).claims)).toEqual(['Fine']);
  });

  // Paged to exhaustion, then ranked. Ranking cannot be the paging order — `RANKING_SCORE_DESC`
  // silently drops every unscored claim past the first page — so the connection pages by id and the
  // sort happens here, over the complete set.
  it('pages to exhaustion and ranks the whole set, not the first page', async () => {
    respondWithPages([
      [node('a1', 'Page one, low', '1')],
      [node('a2', 'Page two, high', '10')],
      [node('a3', 'Page three, middling', '5')],
    ]);

    expect(namesOf((await fetchTaggedClaims(TAG)).claims)).toEqual([
      'Page two, high',
      'Page three, middling',
      'Page one, low',
    ]);
  });

  it('passes the previous page cursor along', async () => {
    respondWithPages([[node('a1', 'One', '1')], [node('a2', 'Two', '2')]]);

    await fetchTaggedClaims(TAG);

    expect(graphqlMock.mock.calls.map(call => call[0].variables.after)).toEqual([null, 'cursor-1']);
  });

  // Ordering by id is what makes the paging exact. Ranking by the server instead loses rows, so the
  // query must not quietly acquire an `orderBy` that reads better and pages worse.
  it('pages by id, leaving the ranking to the client', async () => {
    respondWith([node('a1', 'Only', '10')]);

    await fetchTaggedClaims(TAG);

    const source = graphqlMock.mock.calls[0][0].query?.loc?.source?.body ?? '';
    expect(source).toContain('ID_DESC');
    expect(source).not.toContain('RANKING_SCORE_DESC');
  });

  // A guard against a mis-tagging pointing the whole corpus at one tag, not a product limit — and
  // it says so, because the slice it leaves is arbitrary rather than the lowest-ranked.
  it('stops at the runaway guard rather than paging forever', async () => {
    graphqlMock.mockImplementation(({ decoder }) =>
      Effect.succeed(
        decoder({
          entitiesConnection: {
            pageInfo: { hasNextPage: true, endCursor: 'cursor' },
            nodes: Array.from({ length: 1_000 }, (_, index) => node(`a${index}`, `Claim ${index}`, '1')),
          },
        })
      )
    );

    const result = await fetchTaggedClaims(TAG);

    expect(result.claims.length).toBeGreaterThanOrEqual(TAGGED_CLAIMS_LIMIT);
    expect(graphqlMock.mock.calls.length).toBeLessThanOrEqual(Math.ceil(TAGGED_CLAIMS_LIMIT / 1_000));
    expect(result.truncated).toBe(true);
  });

  // The guard exists to stop a mis-tagging, so it has to count what the server sent rather than what
  // survived decoding. Rows the decoder drops — an unnamed claim, a tag relation with no space —
  // never grow `claims`, so a corpus made of exactly those pages straight past a guard counting only
  // renderable rows. The cap in the mock stands in for the paging that would otherwise not stop.
  it('stops on the entities it fetched, not only on the rows it kept', async () => {
    let calls = 0;
    graphqlMock.mockImplementation(({ decoder }) => {
      calls += 1;
      return Effect.succeed(
        decoder({
          // Well past the guard's own page budget, so a run that reaches it has not stopped.
          entitiesConnection: {
            pageInfo: { hasNextPage: calls < 50, endCursor: 'cursor' },
            nodes: Array.from({ length: 1_000 }, (_, index) => ({
              id: `a${index}`,
              name: null,
              description: null,
              rankingScore: '1',
              relationsList: [{ spaceId: SPACE }],
            })),
          },
        })
      );
    });

    const result = await fetchTaggedClaims(TAG);

    expect(result.claims).toEqual([]);
    expect(result.truncated).toBe(true);
    expect(calls).toBeLessThanOrEqual(Math.ceil(TAGGED_CLAIMS_LIMIT / 1_000));
  });

  it('calls an exhausted list complete, however large', async () => {
    respondWithPages([[node('a1', 'One', '1')], [node('a2', 'Two', '2')]]);

    expect((await fetchTaggedClaims(TAG)).truncated).toBe(false);
  });

  // A row the decoder drops is not a truncated list. `totalCount` counts entities and the decoder
  // legitimately discards unrenderable ones, so comparing the two called a complete page a slice.
  it('does not call a complete page truncated because a row was dropped', async () => {
    graphqlMock.mockImplementation(({ decoder }) =>
      Effect.succeed(
        decoder({
          entitiesConnection: {
            pageInfo: { hasNextPage: false, endCursor: null },
            nodes: [
              node('a1', 'Fine', '10'),
              { id: 'a2', name: null, description: null, rankingScore: '9', relationsList: [{ spaceId: SPACE }] },
            ],
          },
        })
      )
    );

    const result = await fetchTaggedClaims(TAG);

    expect(namesOf(result.claims)).toEqual(['Fine']);
    expect(result.truncated).toBe(false);
  });

  // The multi-space shape the decoder emits, which is what `dedupeTaggedClaims` below collapses.
  it('emits one row per space a claim is tagged in', async () => {
    const OTHER = '019fedae72b67ab2927adf044d57c500';
    respondWith([node('a1', 'Tagged twice', '10', SPACE, OTHER)]);

    const claims = (await fetchTaggedClaims(TAG)).claims;

    expect(claims.map(claim => claim.spaceId).sort()).toEqual([OTHER, SPACE].sort());
    expect(new Set(claims.map(claim => claim.claimEntityId)).size).toBe(1);
  });
});

describe('dedupeTaggedClaims', () => {
  function claim(claimEntityId: string, spaceId: string) {
    return { claimEntityId, spaceId, name: claimEntityId, description: null, rankingScore: 1 };
  }

  it('keeps the first entry for each claim', () => {
    const first = claim('a1', 'space-1');
    const second = claim('a1', 'space-2');

    expect(dedupeTaggedClaims([first, second, claim('a2', 'space-1')])).toEqual([first, claim('a2', 'space-1')]);
  });

  // The point of deduplicating late: run after a space filter, the tag that survives is one the
  // viewer may actually be shown.
  it('collapses onto whichever tag survived a space filter', () => {
    const allowed = claim('a1', 'space-2');

    expect(dedupeTaggedClaims([claim('a1', 'space-1'), allowed].filter(c => c.spaceId === 'space-2'))).toEqual([
      allowed,
    ]);
  });
});


/**
 * A claim the ranking feed has never scored has no place in the order, so it goes last rather than
 * being dropped — a curator tagged it deliberately, and leaving it out would quietly overrule them.
 */
describe('unscored claims', () => {
  it('ranks them last rather than first', async () => {
    respondWith([node('a1', 'Middling', '5'), node('a2', 'Unscored', null), node('a3', 'Top', '10')]);

    expect(namesOf((await fetchTaggedClaims(TAG)).claims)).toEqual(['Top', 'Middling', 'Unscored']);
  });

  it('keeps them in a stable order among themselves', async () => {
    // Two nulls compare equal on score, so the id tiebreak decides — descending, as the feed's own
    // `ORDER BY ranking_score DESC, entity_id DESC` does.
    respondWith([node('a1', 'First unscored', null), node('a2', 'Second unscored', null)]);

    expect(namesOf((await fetchTaggedClaims(TAG)).claims)).toEqual(['Second unscored', 'First unscored']);
  });
});

/**
 * A caller waiting on this hook has to be able to tell "not asked" from "still asking". react-query
 * v5 already answers that correctly for a disabled query — `isLoading` is `isPending && isFetching`
 * — so this pins the contract rather than the `enabled &&` guard that also expresses it. Reaching
 * for `isPending` instead would break it, and these cases would say so.
 */
describe('useTaggedClaims when it is not enabled', () => {
  function wrapper({ children }: { children: React.ReactNode }) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return React.createElement(QueryClientProvider, { client }, children);
  }

  it('reports settled rather than loading, so the caller can answer', () => {
    // Call counts carry across this file's cases; only what this render does is of interest.
    graphqlMock.mockClear();
    const { result } = renderHook(() => useTaggedClaims(TAG, false), { wrapper });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.claims).toEqual([]);
    expect(graphqlMock).not.toHaveBeenCalled();
  });

  it('still reports loading while it is enabled and in flight', () => {
    // The guard: without this, `isLoading: false` unconditionally would pass the case above.
    graphqlMock.mockImplementation(() => Effect.never);
    const { result } = renderHook(() => useTaggedClaims(TAG, true), { wrapper });

    expect(result.current.isLoading).toBe(true);
  });
});
