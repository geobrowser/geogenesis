import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

import * as React from 'react';

import * as Effect from 'effect/Effect';
import { type Mock, beforeEach, describe, expect, it, vi } from 'vitest';

import { graphql } from '~/core/io/graphql-client';
import { getResultsPage } from '~/core/io/queries';

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

// Search is answered by the REST endpoint now (GEO-2898), so it is a dependency of this module
// rather than part of the filter it builds.
vi.mock('~/core/io/queries', () => ({ getResultsPage: vi.fn() }));
const searchMock = getResultsPage as unknown as Mock;

/**
 * Pages of `/search` results, as ids, answered by the offset they were asked for.
 *
 * Keyed on the offset rather than on the call order, which is how the endpoint behaves and is
 * load-bearing here: a *refetch* asks for the same offset again, and a counter handed it the next
 * page instead — so a retry looked like an empty result and nothing about retrying could be
 * tested.
 */
function respondWithSearch(pages: string[][], total = pages.flat().length) {
  const byOffset = new Map<number, string[]>();
  let offset = 0;
  for (const page of pages) {
    byOffset.set(offset, page);
    offset += page.length;
  }
  searchMock.mockImplementation((args: { offset?: number }) => {
    const ids = byOffset.get(args.offset ?? 0) ?? [];
    return Effect.succeed({
      results: ids.map(id => ({ id, name: id, description: null, spaces: [], types: [] })),
      total,
      rawCount: ids.length,
      serverCount: ids.length,
    });
  });
}

/** What the module asked the search endpoint for. */
function sentSearchArgs(call = 0) {
  return searchMock.mock.calls[call][0] as Record<string, any>;
}

beforeEach(() => {
  graphqlMock.mockReset();
  searchMock.mockReset();
});

function wrapper({ children }: { children: React.ReactNode }) {
  // One client for the life of the mount. Rebuilt in the render body, as it was, every re-render
  // handed the tree a fresh cache — so nothing was ever really cached, and anything asserting
  // about a *second* pass over the same key (a retry, an invalidation) could not be written.
  const client = React.useMemo(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }), []);
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
  graphqlMock.mockImplementation(({ decoder, variables }) => {
    const nodes = pages[index] ?? [];
    const hasNextPage = index < pages.length - 1;
    index += 1;
    // Only the rows that were asked for, where the request named ids. The connection answers a
    // filter; a double that handed back its whole page regardless could not tell an id filter that
    // works from one that is ignored — and every search request names ids.
    const asked = (variables as any)?.filter?.and?.find((clause: any) => clause.id?.in)?.id?.in as string[] | undefined;
    const answered = asked ? nodes.filter(node => asked.includes((node as { id: string }).id)) : nodes;
    return Effect.succeed(
      decoder({ entitiesConnection: { pageInfo: { hasNextPage, endCursor: `cursor-${index}` }, nodes: answered } })
    );
  });
}

/**
 * Answers the first request and holds every one after it, which is a search whose ids have arrived
 * and whose appended page is still hydrating.
 */
function respondThenHold(firstPage: unknown[]) {
  let index = 0;
  graphqlMock.mockImplementation(({ decoder }) => {
    index += 1;
    if (index > 1) return Effect.never;
    return Effect.succeed(
      decoder({ entitiesConnection: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: firstPage } })
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

/**
 * What the server returned, as against what survived decoding.
 *
 * `useBoundedPaging` counts this to know a page *landed*, so it has to mean exactly that — a page
 * whose nodes all lack a name decodes to nothing and must still be charged, and a page that is not
 * this filter's must not be charged at all.
 */
describe('the count of what was fetched', () => {
  it('counts nodes the decoder dropped, which a page of them would otherwise hide', async () => {
    respondWithPages([[node('a', 'Kept'), node('b', null), node('c', 'No tag space', { tagSpaces: [] })]]);

    const { result } = renderClaims();

    await waitFor(() => expect(result.current.claims).toHaveLength(1));
    expect(result.current.fetched).toBe(3);
  });

  /**
   * And reports nothing while the previous filter's pages are being held.
   *
   * `keepPreviousData` is right for the list — narrowing should narrow rather than blank and refill
   * — but a count is not a list. The caller has already reset its paging budget for the new filter,
   * so handing it the old one's total charges a page belonging to a different question, and the
   * real first page then arrives at an equal or smaller count and is never evaluated.
   */
  it('reports nothing while the previous filter’s pages are still what it holds', async () => {
    respondWithPages([[node('a', 'First filter'), node('b', 'Also first')]]);
    const { result, rerender } = renderHook(
      ({ filters }: { filters: TaggedClaimFilters }) => useTaggedClaims(TAG, filters, true),
      {
        wrapper,
        initialProps: { filters: NO_TAGGED_CLAIM_FILTERS },
      }
    );
    await waitFor(() => expect(result.current.fetched).toBe(2));

    // A different filter, whose own page has not arrived: the list is held, the count is not.
    let release: (() => void) | undefined;
    graphqlMock.mockImplementation(
      ({ decoder }) =>
        new Promise(resolve => {
          release = () =>
            resolve(decoder({ entitiesConnection: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [] } }));
        })
    );
    rerender({ filters: { ...NO_TAGGED_CLAIM_FILTERS, search: 'nuclear' } });

    await waitFor(() => expect(result.current.claims).toHaveLength(2));
    expect(result.current.fetched).toBe(0);
    release?.();
  });
});

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
      [node('a1', 'Fine'), node('a2', null), { ...node('a3', 'No space'), tagRelations: [{ spaceId: null }] }],
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

/** The `Tags` clause the filter is built around — where the space narrowing lives. */
function tagClause(variables: any) {
  return variables.and.find((clause: any) => clause.relations?.some?.typeId?.is === '257090341ba5406f94e4d4af90042fba')
    ?.relations.some;
}

describe('the filter it builds', () => {
  it('always asks for the tag', async () => {
    respondWithPages([[node('a1', 'One')]]);
    const { result } = renderClaims();
    await waitFor(() => expect(result.current.claims).toHaveLength(1));

    expect(sentVariables().filter.and).toContainEqual({
      relations: { some: { typeId: { is: '257090341ba5406f94e4d4af90042fba' }, toEntityId: { is: TAG } } },
    });
  });

  /**
   * The text goes to `/search` and comes back as ids, and it is the ids that narrow this filter.
   * That is what lets the matching be fuzzy, stemmed and relevance-ranked while the tag, the topics
   * and the spaces keep being answered by the graph over the set it returned.
   */
  it('narrows by the ids the search endpoint matched rather than by the text', async () => {
    respondWithSearch([['a1']]);
    respondWithPages([[node('a1', 'One')]]);
    const { result } = renderClaims({ ...NO_TAGGED_CLAIM_FILTERS, search: 'nuclear' });
    await waitFor(() => expect(result.current.claims).toHaveLength(1));

    expect(sentSearchArgs().query).toBe('nuclear');
    expect(sentVariables().filter.and).toContainEqual({ id: { in: ['a1'] } });
    // And nothing matches the text on the graph any more.
    expect(sentVariables().filter.and.some((clause: any) => clause.name !== undefined)).toBe(false);
  });

  // The tag is what made this possible (GEO-2876). Without it the tagged set — a few hundred claims
  // in a corpus of hundreds of thousands — never reached a ranked page: "trump" answered with five
  // entities named "Trump" and no claims at all.
  it('asks the endpoint for the tag and the Claim type', async () => {
    respondWithSearch([['a1']]);
    respondWithPages([[node('a1', 'One')]]);
    const { result } = renderClaims({ ...NO_TAGGED_CLAIM_FILTERS, search: 'nuclear' });
    await waitFor(() => expect(result.current.claims).toHaveLength(1));

    expect(sentSearchArgs().tagIds).toEqual([TAG]);
    expect(sentSearchArgs().typeIds).toEqual(['96f859efa1ca4b229372c86ad58b694b']);
  });

  /**
   * A search that matched nothing and no search at all are opposite answers, and only one of them
   * narrows. `id: { in: [] }` returns nothing, which is what "no matches" should show; leaving the
   * clause out would show the whole tag under a query that matched none of it.
   */
  it('asks for no claims at all when the search matched none', async () => {
    respondWithSearch([[]], 0);
    respondWithPages([[]]);
    const { result } = renderClaims({ ...NO_TAGGED_CLAIM_FILTERS, search: 'nothingmatchesthis' });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.claims).toHaveLength(0);
  });

  // Topics and spaces are still the graph's to answer, over the ids the search returned — which is
  // the whole reason the search resolves to ids rather than filtering the page in the client.
  it('keeps narrowing by topic over the search results', async () => {
    respondWithSearch([['a1', 'a2']]);
    respondWithPages([[node('a1', 'One', { topics: [{ id: TOPIC, name: 'Nuclear' }] })]]);
    const { result } = renderClaims({ ...NO_TAGGED_CLAIM_FILTERS, search: 'power', topicIds: [TOPIC] });
    await waitFor(() => expect(result.current.claims).toHaveLength(1));

    const and = sentVariables().filter.and;
    expect(and).toContainEqual({ id: { in: ['a1', 'a2'] } });
    expect(and).toContainEqual({
      relations: { some: { typeId: { is: '806d52bc27e94c9193c057978b093351' }, toEntityId: { is: TOPIC } } },
    });
  });

  /**
   * Relevance is the reason for the move, and the graph cannot supply it: `entitiesConnection` is
   * ordered `RANKING_SCORE_DESC`, which describes how prominent a claim is rather than how well it
   * answers what was typed. So the endpoint's order is imposed on each page it returned.
   */
  it('lists a page in the endpoint order rather than the graph ranking', async () => {
    respondWithSearch([['a2', 'a1']]);
    // The graph hands them back the other way round, which is what ranking score does.
    respondWithPages([[node('a1', 'Less relevant', { rankingScore: '99' }), node('a2', 'Most relevant')]]);
    const { result } = renderClaims({ ...NO_TAGGED_CLAIM_FILTERS, search: 'power' });
    await waitFor(() => expect(result.current.claims).toHaveLength(2));

    expect(result.current.claims.map(claim => claim.entity.id)).toEqual(['a2', 'a1']);
  });

  /**
   * The endpoint caps a page at 100 rows however large a limit is asked for, so a broad search has
   * more than it returns — paging it is asking for the next offset, not for a graph cursor. The
   * cursor belongs to a query that does not run while a search does.
   */
  it('pages the search rather than the cursor', async () => {
    respondWithSearch([['a1'], ['a2']], 2);
    respondWithPages([[node('a1', 'One')], [node('a2', 'Two')]]);
    const { result } = renderClaims({ ...NO_TAGGED_CLAIM_FILTERS, search: 'power' });
    await waitFor(() => expect(result.current.claims).toHaveLength(1));
    expect(result.current.hasNextPage).toBe(true);

    result.current.fetchNextPage();

    await waitFor(() => expect(result.current.claims).toHaveLength(2));
    // The second request was another offset into the same search.
    expect(sentSearchArgs(1).offset).toBe(1);
  });

  // An entity is returned once per space it is tagged in, and the endpoint pages over those rows —
  // so a claim tagged in two spaces can close one page and open the next. Hydrated twice, it would
  // be drawn twice.
  it('does not list a claim twice when it spans a page boundary', async () => {
    respondWithSearch([['a1'], ['a1', 'a2']], 3);
    // Each graph page holds both rows; which of them comes back is the id filter's answer.
    respondWithPages([
      [node('a1', 'One'), node('a2', 'Two')],
      [node('a1', 'One'), node('a2', 'Two')],
    ]);
    const { result } = renderClaims({ ...NO_TAGGED_CLAIM_FILTERS, search: 'power' });
    await waitFor(() => expect(result.current.claims).toHaveLength(1));

    result.current.fetchNextPage();

    await waitFor(() => expect(result.current.claims).toHaveLength(2));
    expect(result.current.claims.map(claim => claim.entity.id)).toEqual(['a1', 'a2']);
  });

  /**
   * The rows are built from the ids, so the text lookup is part of the load rather than something
   * beside it. Reported settled too early, a caller shows its empty state under a query that is
   * still being answered.
   */
  it('is still loading while the text lookup is out', async () => {
    searchMock.mockImplementation(() => Effect.never);
    respondWithPages([[node('a1', 'One')]]);
    const { result } = renderClaims({ ...NO_TAGGED_CLAIM_FILTERS, search: 'power' });

    await waitFor(() => expect(result.current.isLoading).toBe(true));
    expect(result.current.claims).toHaveLength(0);
  });

  /**
   * Space narrowing is the graph's alone now, and that is not a shortcut — `/search` has no param
   * that restricts to a *set* of spaces. `additional_space_ids` widens the canonical scope rather
   * than narrowing it (the same query answers 81 either way) and `scope=SPACE_SINGLE` takes one
   * space, which for an allowlist would be a request per space per keystroke.
   *
   * So the composition GEO-2789 needs lives here: the picked spaces still reach the tag relation in
   * the filter these ids narrow.
   */
  it('keeps narrowing by space over the search results', async () => {
    respondWithSearch([['a1']]);
    respondWithPages([[node('a1', 'One')]]);
    const { result } = renderClaims({ ...NO_TAGGED_CLAIM_FILTERS, search: 'power', spaceIds: [SPACE] });
    await waitFor(() => expect(result.current.claims).toHaveLength(1));

    expect(sentVariables().filter.and).toContainEqual({
      relations: {
        some: {
          typeId: { is: '257090341ba5406f94e4d4af90042fba' },
          toEntityId: { is: TAG },
          spaceId: { in: [SPACE] },
        },
      },
    });
    // And the space never went to the endpoint, which cannot narrow by it.
    expect(sentSearchArgs().additionalSpaceIds).toBeUndefined();
  });

  /**
   * The retry behind an error state has to reach whatever failed. While a search is running the
   * cursor query is not it — it is disabled — so refetching that asked nothing again and the error
   * stayed on screen through every press.
   */
  it('retries the text lookup rather than the idle cursor query', async () => {
    searchMock.mockImplementation(() => Effect.fail(new Error('search failed')));
    respondWithPages([[node('a1', 'One')]]);
    const { result } = renderClaims({ ...NO_TAGGED_CLAIM_FILTERS, search: 'power' });
    await waitFor(() => expect(result.current.error).toBeTruthy());
    const before = searchMock.mock.calls.length;

    respondWithSearch([['a1']]);
    result.current.refetch();

    await waitFor(() => expect(result.current.claims).toHaveLength(1));
    expect(searchMock.mock.calls.length).toBeGreaterThan(before);
  });

  /**
   * Both surfaces hand `isLoading` to `HubQueryState`, which replaces the whole list with a
   * skeleton. So it has to mean "the list is appearing", not "something is in flight": reported
   * while an appended page hydrated, every scroll blanked the rows the viewer was reading.
   */
  it('does not report a load while an appended page hydrates', async () => {
    respondWithSearch([['a1'], ['a2']], 2);
    respondThenHold([node('a1', 'One')]);
    const { result } = renderClaims({ ...NO_TAGGED_CLAIM_FILTERS, search: 'power' });
    await waitFor(() => expect(result.current.claims).toHaveLength(1));

    result.current.fetchNextPage();

    // The second page's rows are still out, and the first page's are still on screen.
    await waitFor(() => expect(result.current.isFetchingNextPage).toBe(true));
    expect(result.current.isLoading).toBe(false);
    expect(result.current.claims).toHaveLength(1);
  });

  /**
   * A page is not fetched until its rows are. Reported done when only the ids had returned, the
   * consumers' scroll sentinel re-armed while hydration was out and asked for the next page
   * immediately — turning a broad search into a pile of in-flight row queries.
   */
  it('is still fetching the next page until its rows arrive', async () => {
    respondWithSearch([['a1'], ['a2']], 2);
    respondThenHold([node('a1', 'One')]);
    const { result } = renderClaims({ ...NO_TAGGED_CLAIM_FILTERS, search: 'power' });
    await waitFor(() => expect(result.current.claims).toHaveLength(1));

    result.current.fetchNextPage();

    await waitFor(() => expect(result.current.isFetchingNextPage).toBe(true));
  });

  /**
   * Where the id lookup succeeded and a row page did not, retrying the id lookup returns the same
   * ids under the same key — the failed page stays exactly as it was, and the error outlives every
   * press of Try again. So the rows are invalidated by key.
   */
  it('recovers a failed row hydration on retry', async () => {
    respondWithSearch([['a1']]);
    graphqlMock.mockImplementation(() => Effect.fail(new Error('hydration failed')));
    const { result } = renderClaims({ ...NO_TAGGED_CLAIM_FILTERS, search: 'power' });
    await waitFor(() => expect(result.current.error).toBeTruthy());

    respondWithPages([[node('a1', 'One')]]);
    result.current.refetch();

    await waitFor(() => expect(result.current.claims).toHaveLength(1));
  });

  it('asks for nothing at all when the search is only whitespace', async () => {
    respondWithPages([[node('a1', 'One')]]);
    const { result } = renderClaims({ ...NO_TAGGED_CLAIM_FILTERS, search: '   ' });
    await waitFor(() => expect(result.current.claims).toHaveLength(1));

    expect(sentVariables().filter.and.some((clause: any) => clause.name !== undefined)).toBe(false);
  });

  // GEO-2798 review. `enabled: false` only stops react-query *fetching*; it keeps serving whatever
  // is cached under the key. Every consumer of this hook then reads a list that is no longer on
  // screen: the picker started a geo-chat batch about those ids from another tab, and a sentinel
  // reading a cached `hasNextPage` would page a query whose scope has not resolved — through
  // `fetchNextPage`, which is a manual call and ignores `enabled` entirely.
  it('hands back nothing once disabled, however warm the cache is', async () => {
    respondWithPages([[node('a1', 'One')], [node('a2', 'Two')]]);
    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => useTaggedClaims(TAG, NO_TAGGED_CLAIM_FILTERS, enabled),
      { wrapper, initialProps: { enabled: true } }
    );
    await waitFor(() => expect(result.current.claims).toHaveLength(1));
    expect(result.current.hasNextPage).toBe(true);

    rerender({ enabled: false });

    expect(result.current.claims).toEqual([]);
    expect(result.current.hasNextPage).toBe(false);
  });

  it('will not page while disabled, which is the call `enabled` cannot stop by itself', async () => {
    respondWithPages([[node('a1', 'One')], [node('a2', 'Two')]]);
    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => useTaggedClaims(TAG, NO_TAGGED_CLAIM_FILTERS, enabled),
      { wrapper, initialProps: { enabled: true } }
    );
    await waitFor(() => expect(result.current.claims).toHaveLength(1));
    const requestsWhileEnabled = graphqlMock.mock.calls.length;

    rerender({ enabled: false });
    await result.current.fetchNextPage();

    expect(graphqlMock.mock.calls.length).toBe(requestsWhileEnabled);
  });

  // GEO-2798 review. `null` and `[]` are different answers: unresolved narrows nothing, while a
  // viewer whose allowlist resolved to no space may see nothing. Collapsing them with `?? []` and
  // then testing the length showed that viewer the entire tag.
  it('narrows to nothing for a viewer whose eligible set resolved empty', async () => {
    respondWithPages([[]]);
    const { result } = renderClaims({ ...NO_TAGGED_CLAIM_FILTERS, eligibleSpaceIds: [] });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(tagClause(sentVariables().filter).spaceId).toEqual({ in: [] });
  });

  it('narrows by no space at all while the eligible set is still unresolved', async () => {
    respondWithPages([[node('a1', 'One')]]);
    const { result } = renderClaims({ ...NO_TAGGED_CLAIM_FILTERS, eligibleSpaceIds: null });
    await waitFor(() => expect(result.current.claims).toHaveLength(1));

    expect(tagClause(sentVariables().filter).spaceId).toBeUndefined();
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

    // On the tag relation, not the entity: an entity's `spaceIds` is every space it appears in,
    // which is a wider question than where a curator tagged it — and it is the tag relation's space
    // that `tagSpaceIds`, the space facet's grouping and the card's own space all speak.
    expect(tagClause(sentVariables().filter).spaceId).toEqual({ in: [SPACE, OTHER_SPACE] });
    expect(sentVariables().filter.spaceIds).toBeUndefined();

    rerender({ filters: { ...NO_TAGGED_CLAIM_FILTERS, spaceIds: [SPACE], eligibleSpaceIds: [SPACE, OTHER_SPACE] } });
    await waitFor(() => expect(graphqlMock.mock.calls.length).toBeGreaterThan(1));

    // The picked set is already inside the eligible one, so the narrower wins.
    expect(tagClause(sentVariables(graphqlMock.mock.calls.length - 1).filter).spaceId).toEqual({ in: [SPACE] });
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
        // Answers dashless, as the connection does, whatever spelling it was asked with.
        return Effect.succeed(
          decoder({
            entitiesConnection: {
              nodes: (variables as any).ids.map((id: string) => {
                const dashless = id.replace(/-/g, '');
                return { id: dashless, name: `Topic ${dashless}` };
              }),
            },
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
    // Dashed, as `groupedAggregates` answers — while the names come back from `entitiesConnection`
    // dashless. An unnormalized join matches nothing and every row reads "Topic", which is how this
    // first shipped.
    respondWithGroups([{ id: '5d050707-bc58-4011-9b1e-81ad3adb6244', count: 12 }]);
    const { result } = renderHook(() => useTaggedTopicFacet(TAG, NO_TAGGED_CLAIM_FILTERS, true), { wrapper });

    await waitFor(() => expect(result.current.topics).toHaveLength(1));
    // The aggregate answers in ids; a menu row needs a word, so a second request resolves them.
    //
    // And the id comes back out *dashless*, whatever spelling it went in as. These ids become the
    // viewer's selection, and the selection outlives the source that produced it: a dashed topic id
    // carried to the opponent tab reaches `carriesEveryTopic`, which compares with `Set.has`
    // against dashless relation targets — nothing matches, the list empties, and the reconciliation
    // effect then discards the selection as no longer offered.
    expect(result.current.topics[0]).toEqual({
      id: TOPIC,
      name: `Topic ${TOPIC}`,
      count: 12,
    });
  });

  // GEO-2798 review. `keepPreviousData` keeps the previous filter's counts on screen so the menu
  // does not blink, and the cost is that `isLoading` is already false while they are showing. A
  // caller reconciling its selection against them would prune the viewer's pick against a menu they
  // have moved on from — which is why `use-scoped-claims` excludes placeholder data from the
  // indexed path's settled flag, and why these two have to agree.
  it('is not settled while it is still showing the previous filter’s counts', async () => {
    respondWithGroups([{ id: '5d050707-bc58-4011-9b1e-81ad3adb6244', count: 12 }]);
    const { result, rerender } = renderHook(
      ({ filters }: { filters: TaggedClaimFilters }) => useTaggedTopicFacet(TAG, filters, true),
      { wrapper, initialProps: { filters: NO_TAGGED_CLAIM_FILTERS } }
    );
    await waitFor(() => expect(result.current.settled).toBe(true));

    // The next filter's counts never arrive, so the hook stays on the previous ones.
    graphqlMock.mockImplementation(() => Effect.never);
    rerender({ filters: { ...NO_TAGGED_CLAIM_FILTERS, search: 'nuclear' } });

    await waitFor(() => expect(result.current.settled).toBe(false));
    // Still drawn, which is the whole point of holding them — just not called an answer.
    expect(result.current.topics).toHaveLength(1);
  });

  /**
   * The counts are over the ids fetched so far, which for a broad search is a prefix of the result
   * set. Both surfaces read `settled` as permission to reconcile the viewer's selection against the
   * menu, and a topic whose claims sit on a later page is absent from a prefix — so a valid
   * selection was silently dropped.
   */
  it('does not call a facet settled while the search has pages left', async () => {
    // More matches than the pages fetched so far, which is what a broad query looks like.
    respondWithSearch([['a1']], 400);
    respondWithGroups([{ id: TOPIC, count: 3 }]);
    const { result } = renderHook(() => useTaggedTopicFacet(TAG, { ...NO_TAGGED_CLAIM_FILTERS, search: 'the' }, true), {
      wrapper,
    });

    await waitFor(() => expect(result.current.topics).toHaveLength(1));
    expect(result.current.settled).toBe(false);
  });

  it('counts topics over the topic selection, not around it', async () => {
    // The two menus are not symmetric, and that is the product's own rule. Spaces are OR, so the
    // space menu must not narrow by itself or every unpicked space would read zero. Topics are AND
    // and co-occurrence (GEO-2696): the menu answers "what else do the claims I have narrowed to
    // carry", so the selection *is* applied — and each picked topic comes back with its current
    // count, which is what lets it be un-picked.
    respondWithSearch([['a1']]);
    respondWithGroups([{ id: TOPIC, count: 12 }]);
    const { result } = renderHook(
      () => useTaggedTopicFacet(TAG, { ...NO_TAGGED_CLAIM_FILTERS, topicIds: [TOPIC], search: 'x' }, true),
      { wrapper }
    );
    await waitFor(() => expect(result.current.topics).toHaveLength(1));

    // This hook's own counts requests, identified by the topic it was narrowed to. Hooks from
    // earlier cases in this file stay mounted and refetch into the same mock, so neither an index
    // nor a total describes this one.
    const counts = graphqlMock.mock.calls
      .map(call => call[0].variables as Record<string, any>)
      .filter(
        variables =>
          variables.groupBy?.includes('TO_ENTITY_ID') && JSON.stringify(variables.fromEntity?.and ?? []).includes(TOPIC)
      );
    const fromEntity = counts.at(-1)!.fromEntity;
    // The counts describe the search's results, which is what riding the same filter buys: the
    // ids narrow the facet exactly as they narrow the list.
    expect(fromEntity.and).toContainEqual({ id: { in: ['a1'] } });
    // And never asked over an empty id list. Counted before the search answered, the first request
    // asks for the topics of the claims in `[]` — an answer that is always "none", spent
    // immediately before the real one and read by the menu in between.
    //
    // Asserted as a property rather than a request count: hooks from earlier cases in this file
    // are still mounted and refetch into the same mock, so counting calls measures them too.
    // And never asked over an empty id list. Counted before the search answered, the first request
    // asks for the topics of the claims in `[]` — an answer that is always "none", spent
    // immediately before the real one and read by the menu in between.
    expect(counts.some(variables => JSON.stringify(variables.fromEntity).includes('"in":[]'))).toBe(false);
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
    expect(tagClause(sentVariables().fromEntity).spaceId).toEqual({ in: [SPACE, OTHER_SPACE] });
    expect(result.current.spaces[0]).toEqual({ id: SPACE, count: 5 });
  });

  it('groups the space menu on the tag relation, so a space is counted for what is tagged in it', async () => {
    respondWithGroups([{ id: SPACE, count: 5 }]);
    const { result } = renderHook(() => useTaggedSpaceFacet(TAG, NO_TAGGED_CLAIM_FILTERS, true), { wrapper });
    await waitFor(() => expect(result.current.spaces).toHaveLength(1));

    expect(sentVariables().groupBy).toEqual(['SPACE_ID']);
    expect(sentVariables().typeId).toBe('257090341ba5406f94e4d4af90042fba');
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
