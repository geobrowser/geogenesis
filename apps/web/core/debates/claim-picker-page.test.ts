import * as Effect from 'effect/Effect';
import { type Mock, beforeEach, describe, expect, it, vi } from 'vitest';

import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { CLAIM_IS_FACTUAL_PROPERTY_ID, CLAIM_TYPE_ID, TOPICS_PROPERTY_ID } from '~/core/claims/ontology';
import { graphql } from '~/core/io/graphql-client';

import { fetchClaimPickerPage } from './claim-picker-page';

vi.mock('~/core/io/graphql-client', () => ({
  graphql: vi.fn(),
}));

const graphqlMock = graphql as unknown as Mock;

describe('fetchClaimPickerPage', () => {
  beforeEach(() => {
    graphqlMock.mockReset();
  });

  function respondWith(entitiesConnection: unknown) {
    graphqlMock.mockImplementation(({ decoder }) => Effect.succeed(decoder({ entitiesConnection })));
  }

  it('asks the server for only the fields the picker reads, scoped to the claim type', async () => {
    respondWith({ pageInfo: { endCursor: null, hasNextPage: false }, nodes: [] });

    await fetchClaimPickerPage({ search: '' });

    const variables = graphqlMock.mock.calls.at(-1)?.[0]?.variables;
    expect(variables).toMatchObject({
      claimTypeId: CLAIM_TYPE_ID,
      propertyIds: [SystemIds.NAME_PROPERTY, CLAIM_IS_FACTUAL_PROPERTY_ID],
      topicsPropertyId: TOPICS_PROPERTY_ID,
      first: 50,
    });
    expect(variables.filter).toBeUndefined();
  });

  it('maps the search term to the same case-insensitive substring the ORM used', async () => {
    respondWith({ pageInfo: { endCursor: 'c-2', hasNextPage: true }, nodes: [] });

    const page = await fetchClaimPickerPage({ search: 'fast fashion', after: 'c-1' });

    expect(graphqlMock.mock.calls.at(-1)?.[0]?.variables).toMatchObject({
      after: 'c-1',
      filter: { name: { includesInsensitive: 'fast fashion' } },
    });
    expect(page.endCursor).toBe('c-2');
    expect(page.hasNextPage).toBe(true);
  });

  // The picker's helpers were written against `Entity`; the narrow page has to land in the same
  // shape or the home-space, response-kind and topic lookups silently see nothing.
  it('decodes nodes into the Entity subset the picker reads', async () => {
    respondWith({
      pageInfo: { endCursor: null, hasNextPage: false },
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
            { toEntity: { id: 'topic-1', name: 'Fashion' } },
            { toEntity: null },
            null,
          ],
        },
        null,
      ],
    });

    const page = await fetchClaimPickerPage({ search: '' });

    expect(page.entities).toEqual([
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

  it('returns an empty page when the connection is missing', async () => {
    respondWith(null);

    const page = await fetchClaimPickerPage({ search: '' });

    expect(page).toEqual({ entities: [], endCursor: null, hasNextPage: false });
  });
});
