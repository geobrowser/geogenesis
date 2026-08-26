import * as Effect from 'effect/Effect';
import { type Mock, beforeEach, describe, expect, it, vi } from 'vitest';

import { graphql } from '~/core/io/graphql-client';

import { fetchFeaturedClaims } from './featured-claims';

vi.mock('~/core/io/graphql-client', () => ({
  graphql: vi.fn(),
}));

const graphqlMock = graphql as unknown as Mock;

const SPACE = '019fedae72b67ab2927adf044d57c566';

function node(id: string, name: string, rankingScore: string | null, spaceId = SPACE) {
  return { spaceId, fromEntity: { id, name, description: null, rankingScore } };
}

/** Runs the module's own decoder over `nodes`, which is what the ordering lives in. */
function respondWith(nodes: unknown[]) {
  graphqlMock.mockImplementation(({ decoder }) => Effect.succeed(decoder({ relationsConnection: { nodes } })));
}

function namesOf(claims: Array<{ name: string }>) {
  return claims.map(claim => claim.name);
}

describe('fetchFeaturedClaims', () => {
  beforeEach(() => {
    graphqlMock.mockReset();
  });

  // Unordered, the relations connection comes back by relation id — random v4s, so a fixed shuffle
  // with no relationship to anything a reader would recognise. This is Explore's "Best" order.
  it('orders by ranking score, highest first', async () => {
    respondWith([node('a1', 'Middling', '120.5'), node('a2', 'Best', '900.25'), node('a3', 'Worst', '3')]);

    expect(namesOf(await fetchFeaturedClaims())).toEqual(['Best', 'Middling', 'Worst']);
  });

  // `entities_ranked_for_feed` breaks ties on `entity_id DESC`, so two claims on the same score land
  // here exactly where Explore puts them.
  it('breaks a tie on entity id, descending, as the ranked feed does', async () => {
    respondWith([node('a1', 'Lower id', '500'), node('a3', 'Higher id', '500'), node('a2', 'Middle id', '500')]);

    expect(namesOf(await fetchFeaturedClaims())).toEqual(['Higher id', 'Middle id', 'Lower id']);
  });

  // A claim the feed has never scored isn't in that table, so there is no place in the order for
  // it. Last rather than dropped: a curator tagged it deliberately.
  it('puts an unscored claim last rather than dropping it', async () => {
    respondWith([node('a1', 'Unscored', null), node('a2', 'Scored', '1')]);

    expect(namesOf(await fetchFeaturedClaims())).toEqual(['Scored', 'Unscored']);
  });

  it('keeps the first tag when a claim is featured in more than one space', async () => {
    const OTHER_SPACE = '019fedae72b67ab2927adf044d57c599';
    respondWith([node('a1', 'Tagged twice', '10'), node('a1', 'Tagged twice', '10', OTHER_SPACE)]);

    const claims = await fetchFeaturedClaims();
    expect(claims).toHaveLength(1);
    expect(claims[0]!.spaceId).toBe(SPACE);
  });

  // A claim with no name has nothing to render, and one whose tag carries no space can't be grouped
  // for the geo-chat lookups or tested against the viewer's spaces.
  it('drops rows it could not render or scope', async () => {
    respondWith([
      node('a1', 'Fine', '10'),
      { spaceId: SPACE, fromEntity: { id: 'a2', name: null, description: null, rankingScore: '99' } },
      { spaceId: null, fromEntity: { id: 'a3', name: 'No space', description: null, rankingScore: '99' } },
      { spaceId: SPACE, fromEntity: null },
      null,
    ]);

    expect(namesOf(await fetchFeaturedClaims())).toEqual(['Fine']);
  });
});
