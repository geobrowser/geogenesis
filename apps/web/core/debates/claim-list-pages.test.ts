import { describe, expect, it } from 'vitest';

import { CLAIM_TYPE_ID } from '~/core/claims/ontology';

import {
  type ClaimListOption,
  catalogOptions,
  claimListCounts,
  decodeClaimListPage,
  decodeSpaceScores,
  groupClaimListOptions,
  placeClaimListSections,
  searchClaimListGroups,
} from './claim-list-pages';
import { DEBATE_AGENDA_TYPE_ID } from './ontology';

const CURATORS = '3be38bb922bc80c6a6503fbbba28d2b0';
const POLITICS = '4582fbbee28a16589154f7e36f1ee3c5';
const OTHER_TYPE = '11111111111111111111111111111111';

const DEBATED = '41e851610e13a19441c4d980f2f2ce6b';
const UNPUBLISHABLE = '701a8b0000000000000000000000000a';
let itemId = 0;
const item = (spaceId: string, typeIds = [CLAIM_TYPE_ID], tagSpaceIds = [DEBATED], id = `c${++itemId}`) => ({
  spaceId,
  toEntity: { id, typeIds, tagRelations: tagSpaceIds.map(tagSpace => ({ spaceId: tagSpace })) },
});

describe('catalogOptions', () => {
  it('counts only the blocks and claims in the space the tag sits in', () => {
    const options = catalogOptions({
      relationsConnection: {
        pageInfo: null,
        nodes: [
          {
            spaceId: CURATORS,
            fromEntity: {
              id: 'page-1',
              name: 'U.S. politics highlights',
              blocks: [
                { spaceId: CURATORS, toEntity: { items: [item(CURATORS), item(CURATORS), item(POLITICS)] } },
                // A text block: nothing collected.
                { spaceId: CURATORS, toEntity: { items: [] } },
                // Collects something, but no claims.
                { spaceId: CURATORS, toEntity: { items: [item(CURATORS, [OTHER_TYPE])] } },
                // Another space's copy of the page.
                { spaceId: POLITICS, toEntity: { items: [item(POLITICS)] } },
              ],
            },
          },
        ],
      },
    });
    expect(options).toHaveLength(1);
    expect(options[0]).toMatchObject({ entityId: 'page1', spaceId: CURATORS, name: 'U.S. politics highlights' });
    // The two claims in the tag's space, in the one block that holds any.
    expect(options[0]!.themes.map(claims => claims.length)).toEqual([2]);
    expect(options[0]!.themes[0]![0]!.tagSpaceIds).toEqual([DEBATED]);
  });

  it('leaves out a daily Debate agenda, which Today’s claims stands for', () => {
    expect(
      catalogOptions({
        relationsConnection: {
          pageInfo: null,
          nodes: [
            {
              spaceId: CURATORS,
              fromEntity: {
                id: 'agenda-1',
                name: 'Debate agenda 30 Oct',
                typeIds: [DEBATE_AGENDA_TYPE_ID],
                blocks: [{ spaceId: CURATORS, toEntity: { items: [item(CURATORS)] } }],
              },
            },
          ],
        },
      })
    ).toEqual([]);
  });

  it('leaves out a page with no claims in that space', () => {
    expect(
      catalogOptions({
        relationsConnection: {
          pageInfo: null,
          nodes: [{ spaceId: CURATORS, fromEntity: { id: 'p', name: 'Empty', blocks: [] } }],
        },
      })
    ).toEqual([]);
  });
});

describe('groupClaimListOptions', () => {
  const option = (entityId: string, spaceId: string, name: string): ClaimListOption => ({
    entityId,
    spaceId,
    name,
    themes: [],
  });
  const scores = new Map([
    [CURATORS, 0.08],
    [POLITICS, 0.8],
  ]);
  const NAMES: Record<string, string> = {
    [CURATORS]: 'Geo Curator Program',
    [POLITICS]: 'US Politics',
    unscored: 'Aardvarks',
  };
  const names = (spaceId: string) => NAMES[spaceId];

  it('orders spaces by score, unscored last, and pages A to Z inside each', () => {
    const groups = groupClaimListOptions(
      {
        options: [
          option('a', CURATORS, 'Spicy debates'),
          option('b', CURATORS, 'AI highlights'),
          option('c', 'unscored', 'Zoo'),
          option('d', POLITICS, 'U.S. politics highlights'),
        ],
        scores,
      },
      names
    );
    expect(groups.map(group => group.spaceName)).toEqual(['US Politics', 'Geo Curator Program', 'Aardvarks']);
    expect(groups[1]!.options.map(row => row.name)).toEqual(['AI highlights', 'Spicy debates']);
  });

  it('offers a page tagged in two spaces once, under the higher-ranked one', () => {
    const groups = groupClaimListOptions(
      {
        options: [
          option('page', CURATORS, 'U.S. politics highlights'),
          option('page', POLITICS, 'U.S. politics highlights'),
        ],
        scores,
      },
      names
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]!.spaceId).toBe(POLITICS);
  });
});

describe('searchClaimListGroups', () => {
  const groups = [
    {
      spaceId: POLITICS,
      spaceName: 'US Politics',
      options: [{ entityId: 'p', spaceId: POLITICS, name: 'U.S. politics highlights', themes: [] }],
    },
    {
      spaceId: CURATORS,
      spaceName: 'Geo Curator Program',
      options: [
        { entityId: 'a', spaceId: CURATORS, name: 'AI highlights', themes: [] },
        { entityId: 's', spaceId: CURATORS, name: 'Spicy debates', themes: [] },
      ],
    },
  ];

  it('narrows by name, keeping the grouping and dropping empty spaces', () => {
    const found = searchClaimListGroups(groups, '  HIGH ');
    expect(found.map(group => group.options.map(row => row.entityId))).toEqual([['p'], ['a']]);
    expect(searchClaimListGroups(groups, 'spicy').map(group => group.spaceId)).toEqual([CURATORS]);
  });

  it('returns everything for an empty search', () => {
    expect(searchClaimListGroups(groups, ' ')).toBe(groups);
  });
});

describe('decodeSpaceScores', () => {
  it('reads each score as a number and leaves unscored spaces out', () => {
    const scores = decodeSpaceScores({
      spaceScores: [{ spaceId: CURATORS, score: '0.0858993459200001' }, { spaceId: POLITICS, score: null }, null],
    });
    expect(scores.get(CURATORS)).toBe(0.0858993459200001);
    expect(scores.has(POLITICS)).toBe(false);
  });
});

describe('decodeClaimListPage', () => {
  const claim = (id: string, position: string | null, typeIds = [CLAIM_TYPE_ID], tagSpaceIds: string[] = []) => ({
    position,
    toEntity: {
      id,
      name: ` Claim ${id} `,
      description: null,
      typeIds,
      tagRelations: tagSpaceIds.map(spaceId => ({ spaceId })),
    },
  });

  it('orders themes and claims by position and keeps only claims', () => {
    const page = decodeClaimListPage(
      {
        entity: {
          id: 'page',
          name: 'AI highlights',
          blocks: [
            { position: 'b', toEntity: { id: 'work', name: 'Work', items: [claim('2', 'a1'), claim('1', 'a0')] } },
            { position: 'a', toEntity: { id: 'privacy', name: 'Privacy', items: [claim('3', 'a0')] } },
            { position: 'c', toEntity: { id: 'intro', name: 'Intro', items: [] } },
            {
              position: 'd',
              toEntity: { id: 'links', name: 'Links', items: [claim('x', 'a0', [OTHER_TYPE])] },
            },
            { position: null, toEntity: { id: 'last', name: 'Last', items: [claim('4', null), claim('4', null)] } },
          ],
        },
      },
      CURATORS
    );
    expect(page?.sections.map(section => section.name)).toEqual(['Privacy', 'Work', 'Last']);
    expect(page?.sections[1]!.claims.map(row => row.id)).toEqual(['1', '2']);
    expect(page?.sections[1]!.claims[0]!.name).toBe('Claim 1');
    // A claim collected twice in one theme is shown once.
    expect(page?.spaceId).toBe(CURATORS);
  });

  it('is null for a deleted page', () => {
    expect(decodeClaimListPage({ entity: null }, CURATORS)).toBeNull();
  });
});

describe('placing a list’s claims', () => {
  const claim = (id: string, tagSpaceIds: string[]) => ({ id, name: id, description: null, tagSpaceIds });
  const page = {
    entityId: 'page',
    spaceId: CURATORS,
    name: 'AI highlights',
    sections: [
      {
        id: 'work',
        name: 'Work',
        claims: [
          claim('elsewhere', [DEBATED]),
          claim('both', [DEBATED, CURATORS]),
          claim('untagged', []),
          claim('stuck', [UNPUBLISHABLE]),
          claim('elsewhere', [DEBATED]),
        ],
      },
      { id: 'dead', name: 'Dead end', claims: [claim('stuck-too', [UNPUBLISHABLE])] },
    ],
  };
  const publishable = new Set([DEBATED, CURATORS]);

  it('draws each claim where it can be debated, the page’s space first, once per theme', () => {
    const sections = placeClaimListSections(page, publishable);
    expect(sections.map(section => section.id)).toEqual(['work']);
    expect(sections[0]!.claims.map(row => [row.id, row.spaceId])).toEqual([
      ['elsewhere', DEBATED],
      ['both', CURATORS],
    ]);
  });

  it('counts for the picker exactly what the tab draws', () => {
    const counts = claimListCounts(
      { spaceId: CURATORS, themes: page.sections.map(section => section.claims) },
      publishable
    );
    expect(counts).toEqual({ themeCount: 1, claimCount: 2 });
  });

  it('places by tag alone while publishability is unknown, but never an untagged claim', () => {
    const sections = placeClaimListSections(page, null);
    expect(sections.map(section => section.claims.map(row => row.id))).toEqual([
      ['elsewhere', 'both', 'stuck'],
      ['stuck-too'],
    ]);
  });
});
