import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import * as Effect from 'effect/Effect';
import { type Mock, beforeEach, describe, expect, it, vi } from 'vitest';

import { CLAIM_IS_FACTUAL_PROPERTY_ID, CLAIM_TYPE_ID, TOPICS_PROPERTY_ID } from '~/core/claims/ontology';
import { graphql } from '~/core/io/graphql-client';

import { claimPickerEntitiesQueryKey, fetchClaimPickerEntities } from './claim-picker-page';

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
          relationsList: [{ toEntity: { id: 'topic-1', name: 'Fashion' } }, { toEntity: null }, null],
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
        relations: [{ type: { id: TOPICS_PROPERTY_ID }, toEntity: { id: 'topic-1', name: 'Fashion' } }],
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
