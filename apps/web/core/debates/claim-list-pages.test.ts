import { describe, expect, it } from 'vitest';

import { CLAIM_TYPE_ID } from '~/core/claims/ontology';

import {
  type ClaimListOption,
  catalogOptions,
  decodeClaimListPage,
  decodeSpaces,
  groupClaimListOptions,
  searchClaimListGroups,
} from './claim-list-pages';

const CURATORS = '3be38bb922bc80c6a6503fbbba28d2b0';
const POLITICS = '4582fbbee28a16589154f7e36f1ee3c5';
const OTHER_TYPE = '11111111111111111111111111111111';

const item = (spaceId: string, typeIds = [CLAIM_TYPE_ID]) => ({ spaceId, toEntity: { typeIds } });

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
    expect(options).toEqual([
      { entityId: 'page1', spaceId: CURATORS, name: 'U.S. politics highlights', themeCount: 1, claimCount: 2 },
    ]);
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
    themeCount: 1,
    claimCount: 1,
  });
  const spaces = new Map([
    [CURATORS, { name: 'Geo Curator Program', score: 0.08 }],
    [POLITICS, { name: 'US Politics', score: 0.8 }],
    ['unscored', { name: 'Aardvarks', score: null }],
  ]);

  it('orders spaces by score, unscored last, and pages A to Z inside each', () => {
    const groups = groupClaimListOptions(
      [
        option('a', CURATORS, 'Spicy debates'),
        option('b', CURATORS, 'AI highlights'),
        option('c', 'unscored', 'Zoo'),
        option('d', POLITICS, 'U.S. politics highlights'),
      ],
      spaces
    );
    expect(groups.map(group => group.spaceName)).toEqual(['US Politics', 'Geo Curator Program', 'Aardvarks']);
    expect(groups[1]!.options.map(row => row.name)).toEqual(['AI highlights', 'Spicy debates']);
  });

  it('offers a page tagged in two spaces once, under the higher-ranked one', () => {
    const groups = groupClaimListOptions(
      [option('page', CURATORS, 'U.S. politics highlights'), option('page', POLITICS, 'U.S. politics highlights')],
      spaces
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
      score: 0.8,
      options: [{ entityId: 'p', spaceId: POLITICS, name: 'U.S. politics highlights', themeCount: 1, claimCount: 1 }],
    },
    {
      spaceId: CURATORS,
      spaceName: 'Geo Curator Program',
      score: 0.08,
      options: [
        { entityId: 'a', spaceId: CURATORS, name: 'AI highlights', themeCount: 1, claimCount: 1 },
        { entityId: 's', spaceId: CURATORS, name: 'Spicy debates', themeCount: 1, claimCount: 1 },
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

describe('decodeSpaces', () => {
  it('pairs names with scores and keeps a scored space with no page', () => {
    const spaces = decodeSpaces({
      spaces: [
        { id: CURATORS, page: { name: 'Geo Curator Program' } },
        { id: POLITICS, page: null },
      ],
      spaceScores: [
        { spaceId: CURATORS, score: '0.0858993459200001' },
        { spaceId: 'extra', score: '0.5' },
        { spaceId: POLITICS, score: null },
      ],
    });
    expect(spaces.get(CURATORS)).toEqual({ name: 'Geo Curator Program', score: 0.0858993459200001 });
    expect(spaces.get(POLITICS)).toEqual({ name: 'Unnamed space', score: null });
    expect(spaces.get('extra')?.score).toBe(0.5);
  });
});

describe('decodeClaimListPage', () => {
  const claim = (id: string, position: string | null, typeIds = [CLAIM_TYPE_ID]) => ({
    position,
    toEntity: { id, name: ` Claim ${id} `, description: null, typeIds },
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
    expect(page?.sections[2]!.claims).toHaveLength(1);
    expect(page?.spaceId).toBe(CURATORS);
  });

  it('is null for a deleted page', () => {
    expect(decodeClaimListPage({ entity: null }, CURATORS)).toBeNull();
  });
});
