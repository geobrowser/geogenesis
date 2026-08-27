import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import * as Effect from 'effect/Effect';
import { type Mock, beforeEach, describe, expect, it, vi } from 'vitest';

import { CLAIM_IS_FACTUAL_PROPERTY_ID, CLAIM_TYPE_ID, TOPICS_PROPERTY_ID } from '~/core/claims/ontology';
import { graphql } from '~/core/io/graphql-client';

import { buildGraphClaimsFilter, fetchGraphClaims } from './graph-claims';

vi.mock('~/core/io/graphql-client', () => ({
  graphql: vi.fn(),
}));

const graphqlMock = graphql as unknown as Mock;

const SPACE = '019fedae72b67ab2927adf044d57c566';
const TOPIC = '806d52bc27e94c9193c057978b093351';

function node(id: string, name: string | null, overrides: Record<string, unknown> = {}) {
  return {
    id,
    name,
    description: null,
    spaceIds: [SPACE],
    valuesList: [],
    relationsList: [],
    ...overrides,
  };
}

function respondWith(nodes: unknown[], pageInfo = { hasNextPage: false, endCursor: 'cursor-1' }) {
  graphqlMock.mockImplementation(({ decoder }) =>
    Effect.succeed(decoder({ entitiesRankedForFeedConnection: { pageInfo, nodes } }))
  );
}

describe('buildGraphClaimsFilter', () => {
  // The ranked feed's fast path is an index walk; a filter that matches everything still costs a
  // predicate per row, so nothing is sent when there is nothing to narrow by.
  it('sends no filter when nothing is being narrowed', () => {
    expect(buildGraphClaimsFilter({ spaceIds: [SPACE] })).toBeNull();
    expect(buildGraphClaimsFilter({ spaceIds: [SPACE], topicId: null, search: '' })).toBeNull();
  });

  it('narrows to a topic through the claim’s Topics relation', () => {
    expect(buildGraphClaimsFilter({ spaceIds: null, topicId: 'topic-1' })).toEqual({
      relations: { some: { typeId: { is: TOPICS_PROPERTY_ID }, toEntityId: { is: 'topic-1' } } },
    });
  });

  it('searches claim names case-insensitively', () => {
    expect(buildGraphClaimsFilter({ spaceIds: null, search: 'Caffeine' })).toEqual({
      name: { includesInsensitive: 'Caffeine' },
    });
  });

  // Both at once is the case the old server query handled and the reason this is a builder rather
  // than a ternary: a topic and a search have to intersect, not replace each other.
  it('intersects a topic and a search rather than dropping one', () => {
    expect(buildGraphClaimsFilter({ spaceIds: null, topicId: 'topic-1', search: 'caffeine' })).toEqual({
      and: [
        { relations: { some: { typeId: { is: TOPICS_PROPERTY_ID }, toEntityId: { is: 'topic-1' } } } },
        { name: { includesInsensitive: 'caffeine' } },
      ],
    });
  });
});

describe('fetchGraphClaims', () => {
  beforeEach(() => {
    graphqlMock.mockReset();
  });

  it('asks for claims in the given spaces, with the fields the pickers read', async () => {
    respondWith([]);

    await fetchGraphClaims({ spaceIds: [SPACE], topicId: 'topic-1' }, null);

    expect(graphqlMock.mock.calls.at(-1)?.[0]?.variables).toMatchObject({
      claimTypeId: CLAIM_TYPE_ID,
      spaceIds: [SPACE],
      after: null,
      propertyIds: [SystemIds.NAME_PROPERTY, CLAIM_IS_FACTUAL_PROPERTY_ID],
      topicsPropertyId: TOPICS_PROPERTY_ID,
      filter: { relations: { some: { typeId: { is: TOPICS_PROPERTY_ID }, toEntityId: { is: 'topic-1' } } } },
    });
  });

  it('passes the cursor through so the list pages', async () => {
    respondWith([], { hasNextPage: true, endCursor: 'cursor-2' });

    const page = await fetchGraphClaims({ spaceIds: null }, 'cursor-1');

    expect(graphqlMock.mock.calls.at(-1)?.[0]?.variables?.after).toBe('cursor-1');
    expect(page).toMatchObject({ hasNextPage: true, endCursor: 'cursor-2' });
  });

  // The picker's own projection, so `claimHomeSpaceId` and `claimResponseKind` work on these rows
  // unchanged — the whole point of matching that shape rather than inventing another.
  it('decodes into the picker’s claim projection', async () => {
    respondWith([
      node('claim-1', 'Caffeine should be delayed after waking', {
        description: 'A claim',
        spaceIds: [SPACE, 'other-space'],
        valuesList: [
          { spaceId: SPACE, propertyId: SystemIds.NAME_PROPERTY, text: 'Caffeine should be delayed', boolean: null },
          { spaceId: SPACE, propertyId: CLAIM_IS_FACTUAL_PROPERTY_ID, text: null, boolean: true },
        ],
        relationsList: [{ toEntity: { id: 'topic-1', name: 'Morning routine' } }],
      }),
    ]);

    const page = await fetchGraphClaims({ spaceIds: [SPACE] }, null);

    expect(page.claims).toEqual([
      {
        id: 'claim-1',
        name: 'Caffeine should be delayed after waking',
        description: 'A claim',
        spaces: [SPACE, 'other-space'],
        values: [
          { property: { id: SystemIds.NAME_PROPERTY }, spaceId: SPACE, value: 'Caffeine should be delayed' },
          // Booleans land as '1' / '0', matching how `Entity` decodes them — `claimResponseKind`
          // reads this one through `getChecked`.
          { property: { id: CLAIM_IS_FACTUAL_PROPERTY_ID }, spaceId: SPACE, value: '1' },
        ],
        relations: [{ type: { id: TOPICS_PROPERTY_ID }, toEntity: { id: 'topic-1', name: 'Morning routine' } }],
      },
    ]);
  });

  it('survives a page with nulls in it', async () => {
    respondWith([null, node('claim-1', 'Fine', { valuesList: null, relationsList: [{ toEntity: null }, null] })]);

    const page = await fetchGraphClaims({ spaceIds: null }, null);

    expect(page.claims).toHaveLength(1);
    expect(page.claims[0]).toMatchObject({ id: 'claim-1', values: [], relations: [] });
  });

  it('reads an absent connection as an empty last page', async () => {
    graphqlMock.mockImplementation(({ decoder }) => Effect.succeed(decoder({ entitiesRankedForFeedConnection: null })));

    expect(await fetchGraphClaims({ spaceIds: null }, null)).toEqual({
      claims: [],
      endCursor: null,
      hasNextPage: false,
    });
  });
});
