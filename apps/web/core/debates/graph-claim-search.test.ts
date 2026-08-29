import * as Effect from 'effect/Effect';
import { type Mock, beforeEach, describe, expect, it, vi } from 'vitest';

import { CLAIM_TYPE_ID, TOPICS_PROPERTY_ID } from '~/core/claims/ontology';
import { getResultsPage } from '~/core/io/queries';

import { fetchClaimPickerEntities } from './claim-picker-page';
import { GRAPH_CLAIM_SEARCH_PAGE_SIZE, fetchGraphClaimSearch } from './graph-claim-search';

vi.mock('~/core/io/queries', () => ({ getResultsPage: vi.fn() }));
vi.mock('./claim-picker-page', () => ({ fetchClaimPickerEntities: vi.fn() }));

const searchMock = getResultsPage as unknown as Mock;
const hydrateMock = fetchClaimPickerEntities as unknown as Mock;

const SPACE = '019fedae72b67ab2927adf044d57c566';

function entity(id: string, topicIds: string[] = []) {
  return {
    id,
    name: `Claim ${id}`,
    description: null,
    spaces: [SPACE],
    values: [],
    relations: topicIds.map(topicId => ({
      type: { id: TOPICS_PROPERTY_ID },
      toEntity: { id: topicId, name: topicId },
    })),
  };
}

function respondWith(ids: string[], total = ids.length) {
  searchMock.mockImplementation(() =>
    Effect.succeed({ results: ids.map(id => ({ id })), total, rawCount: ids.length, serverCount: ids.length })
  );
  hydrateMock.mockImplementation((requested: string[]) => Promise.resolve(requested.map(id => entity(id))));
}

describe('fetchGraphClaimSearch', () => {
  beforeEach(() => {
    searchMock.mockReset();
    hydrateMock.mockReset();
  });

  // The ranking walk cannot answer a search — a substring filter over it measured at ten seconds —
  // so this goes to the indexed endpoint, narrowed to claims.
  it('searches the indexed endpoint for claims', async () => {
    respondWith(['claim-1']);

    await fetchGraphClaimSearch({ search: 'caffeine', spaceIds: null }, 0);

    expect(searchMock.mock.calls.at(-1)?.[0]).toMatchObject({
      query: 'caffeine',
      typeIds: [CLAIM_TYPE_ID],
      limit: GRAPH_CLAIM_SEARCH_PAGE_SIZE,
      offset: 0,
    });
  });

  // The endpoint takes one `space_id`, so a wider set is left to the caller's own gates.
  it('scopes to a single space only when the viewer has narrowed to one', async () => {
    respondWith([]);

    await fetchGraphClaimSearch({ search: 'x', spaceIds: [SPACE] }, 0);
    expect(searchMock.mock.calls.at(-1)?.[0]?.spaceId).toBe(SPACE);

    await fetchGraphClaimSearch({ search: 'x', spaceIds: [SPACE, 'other'] }, 0);
    expect(searchMock.mock.calls.at(-1)?.[0]?.spaceId).toBeUndefined();
  });

  // Matches, not claims — so the ids go through the picker's projection and come back
  // indistinguishable from the ranking walk's rows.
  it('hydrates the matches through the picker’s projection', async () => {
    respondWith(['claim-1', 'claim-2']);

    const page = await fetchGraphClaimSearch({ search: 'x', spaceIds: null }, 0);

    expect(hydrateMock.mock.calls.at(-1)?.[0]).toEqual(['claim-1', 'claim-2']);
    expect(page.claims.map(claim => claim.id)).toEqual(['claim-1', 'claim-2']);
  });

  it('never returns a claim the caller is already showing', async () => {
    respondWith(['claim-1', 'claim-2']);

    const page = await fetchGraphClaimSearch({ search: 'x', spaceIds: null, excludeIds: ['claim-1'] }, 0);

    expect(hydrateMock.mock.calls.at(-1)?.[0]).toEqual(['claim-2']);
    expect(page.claims.map(claim => claim.id)).toEqual(['claim-2']);
  });

  // `/search` has no topic parameter, and the topics are already on the hydrated entities.
  it('applies the topic filter after hydrating, since the endpoint has no topic parameter', async () => {
    searchMock.mockImplementation(() =>
      Effect.succeed({ results: [{ id: 'claim-1' }, { id: 'claim-2' }], total: 2, rawCount: 2, serverCount: 2 })
    );
    hydrateMock.mockImplementation(() => Promise.resolve([entity('claim-1', ['topic-a']), entity('claim-2')]));

    const page = await fetchGraphClaimSearch({ search: 'x', spaceIds: null, topicIds: ['topic-a'] }, 0);

    expect(page.claims.map(claim => claim.id)).toEqual(['claim-1']);
  });

  // Exhaustion is judged against how many matches were asked for, not how many claims came back:
  // grouping and the caller's gates both shrink a page, and reading either as "the end" would stop
  // the list early.
  it('pages on the match count rather than the rows that survived', async () => {
    respondWith(['claim-1'], 90);

    const page = await fetchGraphClaimSearch({ search: 'x', spaceIds: null, excludeIds: ['claim-1'] }, 0);

    expect(page.claims).toHaveLength(0);
    expect(page.hasNextPage).toBe(true);
    expect(page.nextOffset).toBe(GRAPH_CLAIM_SEARCH_PAGE_SIZE);
  });

  it('stops once the offset has covered the matches', async () => {
    respondWith(['claim-1'], GRAPH_CLAIM_SEARCH_PAGE_SIZE);

    const page = await fetchGraphClaimSearch({ search: 'x', spaceIds: null }, 0);

    expect(page.hasNextPage).toBe(false);
    expect(page.nextOffset).toBeNull();
  });

  it('does not hydrate when nothing matched', async () => {
    respondWith([]);

    const page = await fetchGraphClaimSearch({ search: 'x', spaceIds: null }, 0);

    expect(hydrateMock).not.toHaveBeenCalled();
    expect(page.claims).toEqual([]);
  });
});
