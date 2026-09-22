import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { print } from 'graphql';
import { describe, expect, it, vi } from 'vitest';

import { CLAIM_TYPE_ID, TOPICS_PROPERTY_ID } from '~/core/claims/ontology';
import { SCORE_SYSTEM_PROPERTY, TAG_PROPERTY_ID } from '~/core/constants';
import { DEBATE_TAG_ID, DEBATE_TYPE_ID } from '~/core/debates/ontology';
import { EXPLORE_ENTITY_NAME_PROPERTY_ID } from '~/core/explore/explore-constants';

import {
  NO_SPACE_ACTIVITY_FILTERS,
  SPACE_ACTIVITY_SORTS,
  decodeSpaceActivityRows,
  spaceActivityRowsByScoreDocument,
  spaceActivityRowsDocument,
  spaceActivityRowsDocumentFor,
  spaceActivityRowsFilter,
  spaceActivityRowsVariables,
  spaceTaggedClaimFilters,
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
   * The whole point of this module. Asking `entitiesConnection` for the ordering directly reaches
   * every row, where the ranked-feed connection returns only the ones it has already scored —
   * measured against one space, 611 claims against 262. The order itself is a variable, so the
   * sorts below are what pin which one each option sends.
   */
  it('takes its ordering as a variable, on entitiesConnection', () => {
    const printed = print(spaceActivityRowsDocument);

    expect(printed).toContain('entitiesConnection');
    expect(printed).toContain('$orderBy: [EntitiesOrderBy!]');
  });

  it.each([
    ['ranked', spaceActivityRowsDocument],
    ['scored', spaceActivityRowsByScoreDocument],
  ])('pages the %s connection by cursor', (_label, document) => {
    const printed = print(document);

    expect(printed).toContain('$after: Cursor');
    expect(printed).toContain('hasNextPage');
    expect(printed).toContain('endCursor');
  });
});

describe('spaceActivityRowsVariables', () => {
  it('scopes the connection to this space and this one type', () => {
    const debates = spaceActivityRowsVariables({
      spaceId: SPACE,
      kind: 'debates',
      sort: 'best',
      first: 50,
      after: null,
    });

    expect(debates).toMatchObject({
      first: 50,
      after: null,
      spaceIds: { in: [SPACE] },
      typeIds: { in: [DEBATE_TYPE_ID] },
      spaceIdsForLists: [SPACE],
    });
  });

  it('selects Claim for the claims kind', () => {
    const claims = spaceActivityRowsVariables({ spaceId: SPACE, kind: 'claims', sort: 'best', first: 50, after: null });

    expect(claims).toMatchObject({ typeIds: { in: [CLAIM_TYPE_ID] } });
  });

  it('carries the cursor through', () => {
    const next = spaceActivityRowsVariables({
      spaceId: SPACE,
      kind: 'claims',
      sort: 'best',
      first: 50,
      after: 'cursor-2',
    });

    expect(next).toMatchObject({ after: 'cursor-2' });
  });
});

describe('sorts', () => {
  /**
   * Best and New are two orderings of one connection; Top ranks by the integer `Score` property,
   * which `entitiesConnection` cannot order on, so it is a different connection. All three are
   * Explore's own, so a reader arriving from that dropdown finds the one they know.
   */
  it('offers Explore’s three', () => {
    expect([...SPACE_ACTIVITY_SORTS]).toEqual(['best', 'new', 'top']);
  });

  it('orders Best by ranking score and New by recency, on the same connection', () => {
    expect(
      spaceActivityRowsVariables({ spaceId: SPACE, kind: 'claims', sort: 'best', first: 50, after: null })
    ).toMatchObject({
      orderBy: ['RANKING_SCORE_DESC'],
    });
    expect(
      spaceActivityRowsVariables({ spaceId: SPACE, kind: 'claims', sort: 'new', first: 50, after: null })
    ).toMatchObject({
      orderBy: ['CREATED_AT_DESC'],
    });
    expect(spaceActivityRowsDocumentFor('best')).toBe(spaceActivityRowsDocument);
    expect(spaceActivityRowsDocumentFor('new')).toBe(spaceActivityRowsDocument);
  });

  it('sends Top to the by-property connection, scored descending', () => {
    const top = spaceActivityRowsVariables({ spaceId: SPACE, kind: 'claims', sort: 'top', first: 50, after: null });

    expect(spaceActivityRowsDocumentFor('top')).toBe(spaceActivityRowsByScoreDocument);
    expect(print(spaceActivityRowsByScoreDocument)).toContain('entitiesOrderedByPropertyConnection');
    expect(top).toMatchObject({
      propertyId: SCORE_SYSTEM_PROPERTY,
      dataType: 'integer',
      sortDirection: 'DESC',
      // Unscored claims are unioned in rather than dropped, so Top ranks the whole set — the same
      // argument Explore's Top sends, and the same reason Best keeps its unscored rows.
      includeWithoutValue: true,
    });
    expect(top).not.toHaveProperty('orderBy');
  });

  // The two connections take space and type in different shapes; sending one's to the other
  // silently drops the scoping and serves the whole graph.
  it('scopes both connections to this space and type, each in its own shape', () => {
    expect(
      spaceActivityRowsVariables({ spaceId: SPACE, kind: 'claims', sort: 'best', first: 50, after: null })
    ).toMatchObject({
      spaceIds: { in: [SPACE] },
      typeIds: { in: [CLAIM_TYPE_ID] },
    });
    expect(
      spaceActivityRowsVariables({ spaceId: SPACE, kind: 'claims', sort: 'top', first: 50, after: null })
    ).toMatchObject({
      spaceIds: [SPACE],
      typeIds: [CLAIM_TYPE_ID],
    });
  });

  it('carries the same filter whichever sort is asked for', () => {
    const filters = { topicIds: ['t1'], search: '', searchClaimIds: null };
    for (const sort of SPACE_ACTIVITY_SORTS) {
      const vars = spaceActivityRowsVariables({
        spaceId: SPACE,
        kind: 'claims',
        sort,
        first: 50,
        after: null,
        filters,
      });
      expect(vars.filter).toEqual(spaceActivityRowsFilter(SPACE, 'claims', filters));
    }
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
    const clauses = (spaceActivityRowsFilter(SPACE, 'claims') as { and: Record<string, any>[] }).and;

    expect(clauses).toContainEqual({
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
    expect(spaceActivityRowsFilter(SPACE, 'debates')).not.toHaveProperty('and');
  });

  // AND, not OR (GEO-2696): a claim has to carry every picked topic, which is what makes the
  // co-occurrence menu beside the list honest about what ticking another one will do.
  it('requires every picked topic, one clause each', () => {
    const filter = spaceActivityRowsFilter(SPACE, 'claims', {
      topicIds: ['t1', 't2'],
      search: '',
      searchClaimIds: null,
    });
    const clauses = (filter as { and: Record<string, any>[] }).and;

    const topicTargets = clauses
      .map(clause => clause.relations?.some)
      .filter(some => some?.typeId?.is === TOPICS_PROPERTY_ID)
      .map(some => some.toEntityId.is);

    expect(topicTargets).toEqual(['t1', 't2']);
  });

  /**
   * `null` and `[]` are opposite answers and only one of them narrows: nothing asked leaves the
   * list alone, nothing matched empties it. Collapsing the two shows the whole corpus for a search
   * that found nothing.
   */
  it('narrows by the ids a search matched, and not at all when none was asked', () => {
    const searched = spaceActivityRowsFilter(SPACE, 'claims', {
      topicIds: [],
      search: 'x',
      searchClaimIds: ['c1', 'c2'],
    });
    expect((searched as { and: Record<string, any>[] }).and).toContainEqual({ id: { in: ['c1', 'c2'] } });

    const empty = spaceActivityRowsFilter(SPACE, 'claims', { topicIds: [], search: 'x', searchClaimIds: [] });
    expect((empty as { and: Record<string, any>[] }).and).toContainEqual({ id: { in: [] } });

    const unsearched = spaceActivityRowsFilter(SPACE, 'claims', { topicIds: [], search: '', searchClaimIds: null });
    expect((unsearched as { and: Record<string, any>[] }).and.some(clause => 'id' in clause)).toBe(false);
  });
});

describe('spaceTaggedClaimFilters', () => {
  /**
   * The rows are narrowed by resolved ids, but the topic menu resolves its own from
   * `TaggedClaimFilters.search`. Left empty, the menu counted every tagged claim in the space while
   * the list showed a search's worth — and could then offer a topic whose intersection with the
   * matches was empty, which is the one thing a co-occurrence menu promises it will not do.
   */
  it('carries the search text through for the facet', () => {
    expect(spaceTaggedClaimFilters(SPACE, { topicIds: [], search: 'tariffs', searchClaimIds: ['c1'] })).toMatchObject({
      search: 'tariffs',
    });
  });

  it('names this space on both space fields', () => {
    expect(spaceTaggedClaimFilters(SPACE, NO_SPACE_ACTIVITY_FILTERS)).toMatchObject({
      spaceIds: [SPACE],
      eligibleSpaceIds: [SPACE],
    });
  });

  // The rows take ids, not text: `taggedEntityFilter` reads the third argument, never this field.
  it('leaves the row filter unchanged by the text', () => {
    const withText = spaceActivityRowsFilter(SPACE, 'claims', { topicIds: [], search: 'x', searchClaimIds: null });
    const without = spaceActivityRowsFilter(SPACE, 'claims', { topicIds: [], search: '', searchClaimIds: null });

    expect(withText).toEqual(without);
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
