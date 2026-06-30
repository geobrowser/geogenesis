import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { describe, expect, it } from 'vitest';

import type { EntityDiff } from '~/core/utils/diff';

import { entityDiffToRankingEntry, getPendingProposerSpaceIds } from './ranking-pending-proposal-entries';

function makeDiff(overrides: Partial<EntityDiff>): EntityDiff {
  return {
    entityId: 'entity-1',
    name: 'New restaurant',
    values: [],
    relations: [],
    blocks: [],
    ...overrides,
  };
}

describe('entityDiffToRankingEntry', () => {
  it('pulls the name and description out of a proposal diff', () => {
    const diff = makeDiff({
      name: '  Joe’s Pizza  ',
      values: [
        {
          propertyId: SystemIds.DESCRIPTION_PROPERTY,
          spaceId: 'space-a',
          type: 'TEXT',
          before: null,
          after: '  Best slice in town  ',
          diff: [],
        },
      ],
    });

    expect(entityDiffToRankingEntry(diff)).toEqual({
      entityId: 'entity-1',
      name: 'Joe’s Pizza',
      description: 'Best slice in town',
      image: null,
    });
  });

  it('falls back to "Untitled" and a null description when the diff is empty', () => {
    expect(entityDiffToRankingEntry(makeDiff({ name: null }))).toEqual({
      entityId: 'entity-1',
      name: 'Untitled',
      description: null,
      image: null,
    });
  });
});

describe('getPendingProposerSpaceIds', () => {
  it('returns the submitters as proposers', () => {
    expect(getPendingProposerSpaceIds(['author-a', 'author-b']).sort()).toEqual(['author-a', 'author-b']);
  });

  it('merges extra proposers (e.g. the current user) and de-dupes', () => {
    expect(getPendingProposerSpaceIds(['author-a', 'author-b'], ['author-a', 'me']).sort()).toEqual([
      'author-a',
      'author-b',
      'me',
    ]);
  });

  it('drops empty ids', () => {
    expect(getPendingProposerSpaceIds(['author-a', ''], ['']).sort()).toEqual(['author-a']);
  });
});
