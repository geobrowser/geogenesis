import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

import * as React from 'react';

import * as Effect from 'effect/Effect';
import { type Mock, beforeEach, describe, expect, it, vi } from 'vitest';

import { graphql } from '~/core/io/graphql-client';

import {
  NO_TAGGED_CLAIM_FILTERS,
  TAGGED_CLAIMS_PAGE_SIZE,
  type TaggedClaimFilters,
  useTaggedClaims,
  useTaggedSpaceFacet,
  useTaggedTopicFacet,
} from './tagged-claims';

/** Any tag: this module is the same query whichever entity it points at. */
const TAG = 'ec3086a54ddf43d8aaefd6cc6e1b0556';
const SPACE = '019fedae72b67ab2927adf044d57c566';
const OTHER_SPACE = '019fedae72b67ab2927adf044d57c599';
const TOPIC = '5d050707bc5840119b1e81ad3adb6244';

vi.mock('~/core/io/graphql-client', () => ({ graphql: vi.fn() }));
const graphqlMock = graphql as unknown as Mock;

beforeEach(() => {
  graphqlMock.mockReset();
});

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return React.createElement(QueryClientProvider, { client }, children);
}

/** One claim as `entitiesConnection` returns it, with the tag relations that put it on the list. */
function node(
  id: string,
  name: string | null,
  overrides: {
    rankingScore?: string | null;
    tagSpaces?: string[];
    spaceIds?: string[];
    topics?: Array<{ id: string; name: string }>;
    factual?: boolean;
  } = {}
) {
  return {
    id,
    name,
    description: null,
    rankingScore: 'rankingScore' in overrides ? overrides.rankingScore : '10',
    spaceIds: overrides.spaceIds ?? [SPACE],
    tagRelations: (overrides.tagSpaces ?? [SPACE]).map(spaceId => ({ spaceId })),
    valuesList:
      overrides.factual === undefined
        ? []
        : [{ spaceId: SPACE, propertyId: 'da4a6c1f9d4446f9832ff3b49a4400ef', text: null, boolean: overrides.factual }],
    relationsList: (overrides.topics ?? []).map(topic => ({ toEntity: { id: topic.id, name: topic.name } })),
  };
}

/** Answers each successive request with the next page, the last one closing the connection. */
function respondWithPages(pages: unknown[][]) {
  let index = 0;
  graphqlMock.mockImplementation(({ decoder }) => {
    const nodes = pages[index] ?? [];
    const hasNextPage = index < pages.length - 1;
    index += 1;
    return Effect.succeed(
      decoder({ entitiesConnection: { pageInfo: { hasNextPage, endCursor: `cursor-${index}` }, nodes } })
    );
  });
}

function renderClaims(filters: TaggedClaimFilters = NO_TAGGED_CLAIM_FILTERS, enabled = true) {
  return renderHook(() => useTaggedClaims(TAG, filters, enabled), { wrapper });
}

/** The variables the module actually sent, which is where the filter shape lives. */
function sentVariables(call = 0) {
  return graphqlMock.mock.calls[call][0].variables as Record<string, any>;
}

/** The query text, for the assertions about ordering that a decoder cannot make. */
function sentQuery(call = 0) {
  const { query } = graphqlMock.mock.calls[call][0];
  return JSON.stringify(query);
}

describe('the page it asks for', () => {
  it('orders by ranking score on the server', async () => {
    // The inverse of the assertion this file used to carry. Ranked cursors lost and duplicated rows
    // until GEO-2795, so the list was paged by id and sorted here; it is the server's job again.
    respondWithPages([[node('a1', 'One')]]);
    const { result } = renderClaims();
    await waitFor(() => expect(result.current.claims).toHaveLength(1));

    expect(sentQuery()).toContain('RANKING_SCORE_DESC');
    expect(sentQuery()).not.toContain('ID_DESC');
  });

  it('asks for one page rather than the whole tag', async () => {
    respondWithPages([[node('a1', 'One')], [node('a2', 'Two')]]);
    const { result } = renderClaims();
    await waitFor(() => expect(result.current.claims).toHaveLength(1));

    // One request, one page, and a second page left where it is until something asks for it.
    expect(graphqlMock).toHaveBeenCalledTimes(1);
    expect(sentVariables().first).toBe(TAGGED_CLAIMS_PAGE_SIZE);
    expect(result.current.hasNextPage).toBe(true);
  });

  it('follows the cursor when the next page is asked for', async () => {
    respondWithPages([[node('a1', 'One')], [node('a2', 'Two')]]);
    const { result } = renderClaims();
    await waitFor(() => expect(result.current.claims).toHaveLength(1));

    result.current.fetchNextPage();

    await waitFor(() => expect(result.current.claims).toHaveLength(2));
    expect(sentVariables(1).after).toBe('cursor-1');
    expect(result.current.claims.map(claim => claim.entity.name)).toEqual(['One', 'Two']);
  });

  it('reports settled rather than loading when it is not enabled', () => {
    const { result } = renderClaims(NO_TAGGED_CLAIM_FILTERS, false);

    // `enabled: false` leaves react-query pending, and a caller waiting on this would read that as
    // "still looking" and never reach its empty state.
    expect(result.current.isLoading).toBe(false);
    expect(result.current.claims).toEqual([]);
    expect(graphqlMock).not.toHaveBeenCalled();
  });
});

describe('what a row carries', () => {
  it('decodes the claim into the shape the rest of the app already reads', async () => {
    respondWithPages([
      [node('a1', 'Nuclear power is cheap', { topics: [{ id: TOPIC, name: 'Energy' }], factual: true })],
    ]);
    const { result } = renderClaims();
    await waitFor(() => expect(result.current.claims).toHaveLength(1));

    const [claim] = result.current.claims;
    expect(claim.entity.name).toBe('Nuclear power is cheap');
    expect(claim.entity.spaces).toEqual([SPACE]);
    // Topics and the Is factual value ride with the page, which is what retires the entity lookup.
    expect(claim.entity.relations.map(relation => relation.toEntity.name)).toEqual(['Energy']);
    // Booleans land as '1' / '0', matching `Entity`'s own decoding, so `claimResponseKind` reads it.
    expect(claim.entity.values).toEqual([
      { property: { id: 'da4a6c1f9d4446f9832ff3b49a4400ef' }, spaceId: SPACE, value: '1' },
    ]);
    expect(claim.rankingScore).toBe(10);
  });

  it('keeps every space the claim is tagged in, and collapses none of them', async () => {
    // The caller decides which space a card is drawn for: the hub tests them against the picked
    // spaces, the picker against what a debate can be published into. Choosing here would let an
    // arbitrary space stand for the claim and drop it whenever that one was the wrong one.
    respondWithPages([[node('a1', 'Tagged twice', { tagSpaces: [SPACE, OTHER_SPACE] })]]);
    const { result } = renderClaims();
    await waitFor(() => expect(result.current.claims).toHaveLength(1));

    expect(result.current.claims[0].tagSpaceIds).toEqual([SPACE, OTHER_SPACE]);
  });

  it('drops a claim with no name, and one whose every tag has no space', async () => {
    respondWithPages([
      [
        node('a1', 'Fine'),
        node('a2', null),
        { ...node('a3', 'No space'), tagRelations: [{ spaceId: null }] },
      ],
    ]);
    const { result } = renderClaims();
    await waitFor(() => expect(result.current.claims).toHaveLength(1));

    // Neither can be placed: one has nothing to render, the other nothing to be tested against the
    // allowlist or grouped for the geo-chat lookup.
    expect(result.current.claims.map(claim => claim.entity.name)).toEqual(['Fine']);
  });

  it('reads an unscored claim as null rather than zero', async () => {
    respondWithPages([[node('a1', 'Unscored', { rankingScore: null })]]);
    const { result } = renderClaims();
    await waitFor(() => expect(result.current.claims).toHaveLength(1));

    // Zero is a score. The server sorts these last; the distinction is kept in case anything reads it.
    expect(result.current.claims[0].rankingScore).toBeNull();
  });
});

describe('the filter it builds', () => {
  it('always asks for the tag', async () => {
    respondWithPages([[node('a1', 'One')]]);
    const { result } = renderClaims();
    await waitFor(() => expect(result.current.claims).toHaveLength(1));

    expect(sentVariables().filter.and).toContainEqual({
      relations: { some: { typeId: { is: '257090341ba5406f94e4d4af90042fba' }, toEntityId: { is: TAG } } },
    });
  });

  it('sends the search term to the server rather than filtering here', async () => {
    respondWithPages([[node('a1', 'One')]]);
    const { result } = renderClaims({ ...NO_TAGGED_CLAIM_FILTERS, search: 'nuclear' });
    await waitFor(() => expect(result.current.claims).toHaveLength(1));

    expect(sentVariables().filter.name).toEqual({ includesInsensitive: 'nuclear' });
  });

  it('intersects topics rather than uniting them', async () => {
    // AND since GEO-2696: a claim has to carry every picked topic, which is one clause each.
    respondWithPages([[node('a1', 'One')]]);
    const { result } = renderClaims({ ...NO_TAGGED_CLAIM_FILTERS, topicIds: [TOPIC, 'topic-2'] });
    await waitFor(() => expect(result.current.claims).toHaveLength(1));

    const topicClauses = sentVariables().filter.and.filter(
      (clause: any) => clause.relations?.some?.typeId?.is === '806d52bc27e94c9193c057978b093351'
    );
    expect(topicClauses).toHaveLength(2);
  });

  it('sends the picked spaces, and the eligible ones when nothing is picked', async () => {
    respondWithPages([[node('a1', 'One')]]);
    const { result, rerender } = renderHook(
      ({ filters }: { filters: TaggedClaimFilters }) => useTaggedClaims(TAG, filters, true),
      { wrapper, initialProps: { filters: { ...NO_TAGGED_CLAIM_FILTERS, eligibleSpaceIds: [SPACE, OTHER_SPACE] } } }
    );
    await waitFor(() => expect(result.current.claims).toHaveLength(1));

    // `spaceIds` on the entity is a list, so it takes a list filter — `overlaps`, not `in`.
    expect(sentVariables().filter.spaceIds).toEqual({ overlaps: [SPACE, OTHER_SPACE] });

    rerender({ filters: { ...NO_TAGGED_CLAIM_FILTERS, spaceIds: [SPACE], eligibleSpaceIds: [SPACE, OTHER_SPACE] } });
    await waitFor(() => expect(graphqlMock.mock.calls.length).toBeGreaterThan(1));

    // The picked set is already inside the eligible one, so the narrower wins.
    expect(sentVariables(graphqlMock.mock.calls.length - 1).filter.spaceIds).toEqual({ overlaps: [SPACE] });
  });

  it('narrows nothing by space while the allowlist is unresolved', async () => {
    respondWithPages([[node('a1', 'One')]]);
    const { result } = renderClaims({ ...NO_TAGGED_CLAIM_FILTERS, eligibleSpaceIds: null });
    await waitFor(() => expect(result.current.claims).toHaveLength(1));

    expect(sentVariables().filter.spaceIds).toBeUndefined();
  });
});

describe('the facet menus', () => {
  function respondWithGroups(groups: Array<{ id: string; count: number }>) {
    graphqlMock.mockImplementation(({ decoder, variables }) => {
      // The names query answers separately; it is the only one taking `ids`.
      if ((variables as any).ids) {
        return Effect.succeed(
          decoder({
            entitiesConnection: { nodes: (variables as any).ids.map((id: string) => ({ id, name: `Topic ${id}` })) },
          })
        );
      }
      return Effect.succeed(
        decoder({
          relationsConnection: {
            groupedAggregates: groups.map(group => ({
              keys: [group.id],
              distinctCount: { fromEntityId: String(group.count) },
            })),
          },
        })
      );
    });
  }

  it('counts topics over the tag, and puts a name to each id', async () => {
    respondWithGroups([{ id: TOPIC, count: 12 }]);
    const { result } = renderHook(() => useTaggedTopicFacet(TAG, NO_TAGGED_CLAIM_FILTERS, true), { wrapper });

    await waitFor(() => expect(result.current.topics).toHaveLength(1));
    // The aggregate answers in ids; a menu row needs a word, so a second request resolves them.
    expect(result.current.topics[0]).toEqual({ id: TOPIC, name: `Topic ${TOPIC}`, count: 12 });
  });

  it('counts topics over the topic selection, not around it', async () => {
    // The two menus are not symmetric, and that is the product's own rule. Spaces are OR, so the
    // space menu must not narrow by itself or every unpicked space would read zero. Topics are AND
    // and co-occurrence (GEO-2696): the menu answers "what else do the claims I have narrowed to
    // carry", so the selection *is* applied — and each picked topic comes back with its current
    // count, which is what lets it be un-picked.
    respondWithGroups([{ id: TOPIC, count: 12 }]);
    const { result } = renderHook(
      () => useTaggedTopicFacet(TAG, { ...NO_TAGGED_CLAIM_FILTERS, topicIds: [TOPIC], search: 'x' }, true),
      { wrapper }
    );
    await waitFor(() => expect(result.current.topics).toHaveLength(1));

    const fromEntity = sentVariables().fromEntity;
    expect(fromEntity.name).toEqual({ includesInsensitive: 'x' });
    expect(
      fromEntity.and.filter((clause: any) => clause.relations?.some?.typeId?.is === '806d52bc27e94c9193c057978b093351')
    ).toHaveLength(1);
  });

  it('does not narrow the space menu by the space selection, but still by the viewer', async () => {
    respondWithGroups([{ id: SPACE, count: 5 }]);
    const { result } = renderHook(
      () =>
        useTaggedSpaceFacet(
          TAG,
          { ...NO_TAGGED_CLAIM_FILTERS, spaceIds: [SPACE], eligibleSpaceIds: [SPACE, OTHER_SPACE] },
          true
        ),
      { wrapper }
    );
    await waitFor(() => expect(result.current.spaces).toHaveLength(1));

    // The picked space is dropped so the menu can still offer the others; the eligible set is not,
    // because a space the viewer cannot see should not be offered, counted or listed.
    expect(sentVariables().fromEntity.spaceIds).toEqual({ overlaps: [SPACE, OTHER_SPACE] });
    expect(result.current.spaces[0]).toEqual({ id: SPACE, count: 5 });
  });

  it('groups the space menu on the tag relation, so a space is counted for what is tagged in it', async () => {
    respondWithGroups([{ id: SPACE, count: 5 }]);
    const { result } = renderHook(() => useTaggedSpaceFacet(TAG, NO_TAGGED_CLAIM_FILTERS, true), { wrapper });
    await waitFor(() => expect(result.current.spaces).toHaveLength(1));

    expect(sentVariables().groupBy).toEqual(['SPACE_ID']);
    expect(sentVariables().relationTypeId).toBe('257090341ba5406f94e4d4af90042fba');
    expect(sentVariables().toEntityId).toBe(TAG);
  });

  it('reports a failed count as unsettled, so a selection is not reconciled against it', async () => {
    graphqlMock.mockImplementation(() => Effect.fail(new Error('facet exploded')));
    const { result } = renderHook(() => useTaggedSpaceFacet(TAG, NO_TAGGED_CLAIM_FILTERS, true), { wrapper });

    await waitFor(() => expect(result.current.error).toBeTruthy());
    // An error leaves the menu empty while it stops loading. Read as settled, that empty menu says
    // the viewer's picked space no longer exists, and the reconciliation spends their selection.
    expect(result.current.settled).toBe(false);
  });
});
