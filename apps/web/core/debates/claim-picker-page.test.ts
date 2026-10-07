import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import * as Effect from 'effect/Effect';
import { print } from 'graphql';
import { type Mock, beforeEach, describe, expect, it, vi } from 'vitest';

import { CLAIM_IS_FACTUAL_PROPERTY_ID, CLAIM_TYPE_ID, TOPICS_PROPERTY_ID } from '~/core/claims/ontology';
import { graphql } from '~/core/io/graphql-client';
import { POSITION_VOTE_KINDS, POSITION_VOTE_TYPES } from '~/core/profile/profile-facts';

import {
  CLAIM_PICKER_VOTED_BY_PAGE_SIZE,
  claimPickerEntitiesQueryKey,
  claimPickerVotedByQueryKey,
  fetchClaimPickerEntities,
  fetchClaimPickerEntitiesVotedBy,
  pollWhileMissing,
} from './claim-picker-page';

vi.mock('~/core/io/graphql-client', () => ({
  graphql: vi.fn(),
}));

const graphqlMock = graphql as unknown as Mock;

describe('fetchClaimPickerEntities', () => {
  beforeEach(() => {
    graphqlMock.mockReset();
  });

  function respondWith(entitiesConnection: unknown) {
    graphqlMock.mockImplementation(({ decoder }) => Effect.succeed(decoder({ entitiesConnection })));
  }

  it('asks the server for only the fields the picker reads, for exactly the ids given', async () => {
    respondWith({ nodes: [] });

    await fetchClaimPickerEntities(['claim-1', 'claim-2']);

    expect(graphqlMock.mock.calls.at(-1)?.[0]?.variables).toEqual({
      claimTypeId: CLAIM_TYPE_ID,
      propertyIds: [SystemIds.NAME_PROPERTY, CLAIM_IS_FACTUAL_PROPERTY_ID],
      topicsPropertyId: TOPICS_PROPERTY_ID,
      ids: ['claim-1', 'claim-2'],
    });
  });

  it('does not ask at all for an empty list', async () => {
    await expect(fetchClaimPickerEntities([])).resolves.toEqual([]);
    expect(graphqlMock).not.toHaveBeenCalled();
  });

  // The picker's helpers were written against `Entity`; the narrow projection has to land in the
  // same shape or the home-space, response-kind and topic lookups silently see nothing.
  it('decodes nodes into the Entity subset the picker reads', async () => {
    respondWith({
      nodes: [
        {
          id: 'claim-1',
          name: 'Fast fashion is bad',
          description: 'A description',
          spaceIds: ['space-a', 'space-b'],
          valuesList: [
            { spaceId: 'space-a', propertyId: SystemIds.NAME_PROPERTY, text: 'Fast fashion is bad', boolean: null },
            { spaceId: 'space-a', propertyId: CLAIM_IS_FACTUAL_PROPERTY_ID, text: null, boolean: true },
            { spaceId: 'space-b', propertyId: CLAIM_IS_FACTUAL_PROPERTY_ID, text: null, boolean: false },
            // A value with nothing decodable in it is dropped, as `Entity` decoding drops it.
            { spaceId: 'space-b', propertyId: SystemIds.NAME_PROPERTY, text: null, boolean: null },
            null,
          ],
          relationsList: [
            { spaceId: 'space-a', toEntity: { id: 'topic-1', name: 'Fashion' } },
            { spaceId: 'space-b', toEntity: null },
            null,
          ],
        },
        null,
      ],
    });

    const entities = await fetchClaimPickerEntities(['claim-1']);

    expect(entities).toEqual([
      {
        id: 'claim-1',
        name: 'Fast fashion is bad',
        description: 'A description',
        spaces: ['space-a', 'space-b'],
        values: [
          { property: { id: SystemIds.NAME_PROPERTY }, spaceId: 'space-a', value: 'Fast fashion is bad' },
          // Booleans land as '1' / '0', which is what `getChecked` reads.
          { property: { id: CLAIM_IS_FACTUAL_PROPERTY_ID }, spaceId: 'space-a', value: '1' },
          { property: { id: CLAIM_IS_FACTUAL_PROPERTY_ID }, spaceId: 'space-b', value: '0' },
        ],
        // The space the topic was assigned in is carried through, not dropped. Topics are per-space,
        // so a caller scoped to one space cannot otherwise tell an assignment made there from one
        // made somewhere else — which is what let another space's topic into the picker's facet.
        relations: [
          { type: { id: TOPICS_PROPERTY_ID }, spaceId: 'space-a', toEntity: { id: 'topic-1', name: 'Fashion' } },
        ],
      },
    ]);
  });

  it('returns nothing when the connection is missing', async () => {
    respondWith(null);

    await expect(fetchClaimPickerEntities(['claim-1'])).resolves.toEqual([]);
  });
});

// The gateway reconciles and the debates mutations invalidate everything under `'debates'`; a
// knowledge-graph lookup under that root would refetch on every reconnect and, when the graph
// failed, be read as a broken socket.
it('keys the picker lookup outside the debates family', () => {
  expect(claimPickerEntitiesQueryKey(['claim-1'])[0]).not.toBe('debates');
});

/**
 * GEO-2656. The same projection, asked for by person so it does not wait on positions for its ids.
 */
describe('fetchClaimPickerEntitiesVotedBy', () => {
  beforeEach(() => {
    graphqlMock.mockReset();
  });

  const node = (id: string) => ({
    id,
    name: id,
    description: null,
    spaceIds: ['space-a'],
    valuesList: [],
    relationsList: [],
  });

  it('asks for held positions only, with the shared filters, and only claims', async () => {
    graphqlMock.mockImplementation(({ decoder }) =>
      Effect.succeed(decoder({ entitiesConnection: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [] } }))
    );

    await fetchClaimPickerEntitiesVotedBy('person-1');

    const call = graphqlMock.mock.calls.at(-1)?.[0];
    expect(call?.variables).toEqual({
      userId: 'person-1',
      kinds: [...POSITION_VOTE_KINDS],
      types: [...POSITION_VOTE_TYPES],
      claimTypeId: CLAIM_TYPE_ID,
      propertyIds: [SystemIds.NAME_PROPERTY, CLAIM_IS_FACTUAL_PROPERTY_ID],
      topicsPropertyId: TOPICS_PROPERTY_ID,
      first: CLAIM_PICKER_VOTED_BY_PAGE_SIZE,
      after: undefined,
    });
    // Without `votedByTypes` a retracted side still counts as a position (GEO-2962), and without the
    // type a vote on a non-claim would come back as a row.
    const source = print(call?.query);
    expect(source).toContain('votedBy: $userId');
    expect(source).toContain('votedByKinds: $kinds');
    expect(source).toContain('votedByTypes: $types');
    expect(source).toContain('typeId: $claimTypeId');
  });

  it('walks every page, decoding each into the picker’s projection', async () => {
    graphqlMock
      .mockImplementationOnce(({ decoder }) =>
        Effect.succeed(
          decoder({
            entitiesConnection: { pageInfo: { hasNextPage: true, endCursor: 'c1' }, nodes: [node('claim-1'), null] },
          })
        )
      )
      .mockImplementationOnce(({ decoder }) =>
        Effect.succeed(
          decoder({
            entitiesConnection: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [node('claim-2')] },
          })
        )
      );

    const entities = await fetchClaimPickerEntitiesVotedBy('person-1');

    expect(entities.map(entity => entity.id)).toEqual(['claim-1', 'claim-2']);
    expect(entities[0]).toEqual({
      id: 'claim-1',
      name: 'claim-1',
      description: null,
      spaces: ['space-a'],
      values: [],
      relations: [],
    });
    expect(graphqlMock.mock.calls[1]?.[0]?.variables.after).toBe('c1');
  });

  it('keys by person, outside the debates family, whichever way the id is spelled', () => {
    const key = claimPickerVotedByQueryKey('0199AAAA-bbbb-cccc-dddd-eeeeffff0000');
    expect(key[0]).not.toBe('debates');
    expect(key).toEqual(claimPickerVotedByQueryKey('0199aaaabbbbccccddddeeeeffff0000'));
  });
});

describe('pollWhileMissing (GEO-2870)', () => {
  const state = (data?: unknown[]) => ({ state: { data } });

  it('is off without an interval', () => {
    expect(pollWhileMissing(3, undefined)).toBe(false);
  });

  it('polls while the answer is missing ids or not there yet, and stops once all are found', () => {
    const interval = pollWhileMissing(3, 15_000);
    if (interval === false) throw new Error('expected an interval function');
    expect(interval(state())).toBe(15_000);
    expect(interval(state([{}, {}]))).toBe(15_000);
    expect(interval(state([{}, {}, {}]))).toBe(false);
  });
});
