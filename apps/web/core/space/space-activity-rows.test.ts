import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { print } from 'graphql';
import { describe, expect, it, vi } from 'vitest';

import { CLAIM_TYPE_ID } from '~/core/claims/ontology';
import { TAG_PROPERTY_ID } from '~/core/constants';
import { DEBATE_TAG_ID, DEBATE_TYPE_ID } from '~/core/debates/ontology';
import { EXPLORE_ENTITY_NAME_PROPERTY_ID } from '~/core/explore/explore-constants';

import {
  decodeSpaceActivityRows,
  spaceActivityRowsDocument,
  spaceActivityRowsFilter,
  spaceActivityRowsVariables,
} from './space-activity-rows';

/**
 * Only the per-node decoder is faked. `buildExploreFeedRows` — which is what picks the display
 * space and orders nothing — runs for real, because that is the half this module is gluing.
 */
vi.mock('~/core/explore/explore-card-item', async importOriginal => {
  const actual = await importOriginal<typeof import('~/core/explore/explore-card-item')>();
  return {
    ...actual,
    decodeExploreCardEntity: (node: unknown) => (node === UNDECODABLE ? null : node),
  };
});

/** Stands in for a node the schema rejects; the faked decoder answers `null` for it. */
const UNDECODABLE = { __undecodable: true };

const SPACE = '41e851610e13a19441c4d980f2f2ce6b';
const OTHER_SPACE = 'aa11bb22cc33dd44ee55ff6677889900';

/** The shape `buildExploreFeedRows` reads, which is what the real decoder produces. */
function entity(id: string, spaces: string[]) {
  return {
    id,
    name: `Claim ${id}`,
    description: null,
    spaces,
    types: [{ id: CLAIM_TYPE_ID, name: 'Claim' }],
    values: [],
    relations: spaces.map((spaceId, index) => ({
      id: `${id}-r${index}`,
      entityId: `${id}-r${index}`,
      spaceId,
      type: { id: SystemIds.TYPES_PROPERTY, name: 'Types' },
      toEntity: { id: CLAIM_TYPE_ID, name: 'Claim', value: '' },
    })),
    commentCount: 0,
  };
}

describe('spaceActivityRowsDocument', () => {
  /**
   * The whole point of this module. Ordering by the ranking score directly is what reaches every
   * row rather than only the ones the ranked-feed connection has already scored — measured against
   * one space, 611 claims against 262.
   */
  it('orders by ranking score descending', () => {
    expect(print(spaceActivityRowsDocument)).toContain('RANKING_SCORE_DESC');
  });

  it('pages by cursor off entitiesConnection', () => {
    const printed = print(spaceActivityRowsDocument);

    expect(printed).toContain('entitiesConnection');
    expect(printed).toContain('$after: Cursor');
    expect(printed).toContain('hasNextPage');
    expect(printed).toContain('endCursor');
  });
});

describe('spaceActivityRowsVariables', () => {
  it('scopes the connection to this space and this one type', () => {
    const debates = spaceActivityRowsVariables({ spaceId: SPACE, kind: 'debates', first: 50, after: null });

    expect(debates).toMatchObject({
      first: 50,
      after: null,
      spaceIds: { in: [SPACE] },
      typeIds: { in: [DEBATE_TYPE_ID] },
      spaceIdsForLists: [SPACE],
    });
  });

  it('selects Claim for the claims kind', () => {
    const claims = spaceActivityRowsVariables({ spaceId: SPACE, kind: 'claims', first: 50, after: null });

    expect(claims).toMatchObject({ typeIds: { in: [CLAIM_TYPE_ID] } });
  });

  it('carries the cursor through', () => {
    const next = spaceActivityRowsVariables({ spaceId: SPACE, kind: 'claims', first: 50, after: 'cursor-2' });

    expect(next).toMatchObject({ after: 'cursor-2' });
  });
});

describe('spaceActivityRowsFilter', () => {
  // An entity with no name renders as "Untitled"; the explore feed requires the same thing.
  it('requires a name in this space, for both kinds', () => {
    for (const kind of ['debates', 'claims'] as const) {
      expect(spaceActivityRowsFilter(SPACE, kind)).toMatchObject({
        values: {
          some: {
            spaceId: { in: [SPACE] },
            propertyId: { is: EXPLORE_ENTITY_NAME_PROPERTY_ID },
          },
        },
      });
    }
  });

  /**
   * These surfaces are about debate activity, so a claim reaches them only once a curator has
   * tagged it (GEO-2835) — and the tag relation is scoped to this space as well as the entity,
   * because a relation carries its own space and an unscoped clause would accept a tag applied
   * from anywhere. The count beside the list applies the same clause, or the two are different
   * corpora.
   */
  it('requires the debate tag on claims, applied in this space', () => {
    expect(spaceActivityRowsFilter(SPACE, 'claims')).toMatchObject({
      relations: {
        some: {
          typeId: { is: TAG_PROPERTY_ID },
          toEntityId: { is: DEBATE_TAG_ID },
          spaceId: { in: [SPACE] },
        },
      },
    });
  });

  // A debate is published into the space by the acceptor and is not tagged by anyone.
  it('asks for no tag on debates', () => {
    expect(spaceActivityRowsFilter(SPACE, 'debates')).not.toHaveProperty('relations');
  });
});

describe('decodeSpaceActivityRows', () => {
  it('carries the page cursor through', () => {
    const page = decodeSpaceActivityRows(SPACE, {
      entitiesConnection: { pageInfo: { hasNextPage: true, endCursor: 'cursor-2' }, nodes: [] },
    });

    expect(page).toMatchObject({ hasNextPage: true, endCursor: 'cursor-2' });
  });

  // An exhausted list must report no cursor, or the sentinel asks forever.
  it('reports the end of the list', () => {
    const page = decodeSpaceActivityRows(SPACE, {
      entitiesConnection: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [] },
    });

    expect(page).toEqual({ rows: [], hasNextPage: false, endCursor: null });
  });

  // A connection that answered with nothing is the end of the list, not a crash.
  it('survives a connection that answered with nothing', () => {
    expect(decodeSpaceActivityRows(SPACE, {})).toEqual({ rows: [], hasNextPage: false, endCursor: null });
  });

  /**
   * The rows keep the order the connection returned them in — which is the ranking. Anything that
   * re-sorted here would be overruling `RANKING_SCORE_DESC` with something the reader cannot see.
   */
  it('preserves the connection’s order', () => {
    const page = decodeSpaceActivityRows(SPACE, {
      entitiesConnection: {
        pageInfo: { hasNextPage: false, endCursor: null },
        nodes: [entity('z', [SPACE]), entity('a', [SPACE])],
      },
    });

    expect(page.rows.map(row => row.entityId)).toEqual(['z', 'a']);
  });

  /**
   * A claim carried in more than one space would otherwise resolve its name, values and types
   * against whichever space the entity happened to list first. This list is one space's, so that is
   * the space a row has to render as.
   */
  it('renders every row as this space', () => {
    const page = decodeSpaceActivityRows(SPACE, {
      entitiesConnection: {
        pageInfo: { hasNextPage: false, endCursor: null },
        nodes: [entity('e1', [OTHER_SPACE, SPACE])],
      },
    });

    expect(page.rows.map(row => row.spaceId)).toEqual([SPACE]);
  });

  // A node the decoder cannot read is dropped rather than taking the page with it.
  it('drops a node that could not be decoded', () => {
    const page = decodeSpaceActivityRows(SPACE, {
      entitiesConnection: {
        pageInfo: { hasNextPage: false, endCursor: null },
        nodes: [entity('e1', [SPACE]), UNDECODABLE],
      },
    });

    expect(page.rows.map(row => row.entityId)).toEqual(['e1']);
  });
});
