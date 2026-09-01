import * as Effect from 'effect/Effect';
import { type Mock, beforeEach, describe, expect, it, vi } from 'vitest';

import { graphql } from '~/core/io/graphql-client';

import { TAGGED_CLAIMS_LIMIT, dedupeTaggedClaims, fetchTaggedClaims } from './tagged-claims';

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
          // The server's own count of the tagged set, which is what tells a truncated list from a
          // complete one. Every page carries it, so the fixtures do too.
          totalCount: pages.reduce((sum, page) => sum + page.length, 0),
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

  // A page-worth of tags is a sample, not the set: the connection orders by relation id, which is a
  // random v4, so a capped single request would drop rows at random from a list that is then ranked.
  it('pages to exhaustion and ranks the whole set, not the first page', async () => {
    respondWithPages([
      [node('a1', 'Page one, low', '10')],
      [node('a2', 'Page two, high', '900')],
      [node('a3', 'Page three, middling', '100')],
    ]);

    expect(namesOf((await fetchTaggedClaims(TAG)).claims)).toEqual([
      'Page two, high',
      'Page three, middling',
      'Page one, low',
    ]);
    expect(graphqlMock).toHaveBeenCalledTimes(3);
  });

  it('passes the previous page cursor along', async () => {
    respondWithPages([[node('a1', 'One', '1')], [node('a2', 'Two', '2')]]);

    await fetchTaggedClaims(TAG);

    expect(graphqlMock.mock.calls.map(call => call[0].variables.after)).toEqual([null, 'cursor-1']);
  });

  // A guard against a mis-tagging pointing the whole corpus at one tag, not a product limit.
  it('stops at the runaway guard rather than paging forever', async () => {
    graphqlMock.mockImplementation(({ decoder }) =>
      Effect.succeed(
        decoder({
          entitiesConnection: {
            totalCount: 50_000,
            pageInfo: { hasNextPage: true, endCursor: 'cursor' },
            nodes: Array.from({ length: 500 }, (_, index) => node(`a${index}`, `Claim ${index}`, '1')),
          },
        })
      )
    );

    const result = await fetchTaggedClaims(TAG);

    expect(result.claims.length).toBeGreaterThanOrEqual(TAGGED_CLAIMS_LIMIT);
    expect(graphqlMock.mock.calls.length).toBeLessThanOrEqual(Math.ceil(TAGGED_CLAIMS_LIMIT / 500));
    // And says so, which is the whole point of stopping: a slice that looks complete is worse than
    // a slow list.
    expect(result.truncated).toBe(true);
    expect(result.total).toBe(50_000);
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
