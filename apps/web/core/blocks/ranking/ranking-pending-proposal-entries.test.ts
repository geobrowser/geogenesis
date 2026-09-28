import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { describe, expect, it } from 'vitest';

import type { EntityDiff } from '~/core/utils/diff';

import {
  MAX_PENDING_PROPOSERS,
  entityDiffToRankingEntry,
  getPendingProposerSpaceIds,
  selectRankingBlockPendingCandidates,
} from './ranking-pending-proposal-entries';

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
      spaceId: null,
    });
  });

  it('reads the name from the NAME value when the diff has no resolved name', () => {
    const diff = makeDiff({
      name: null,
      values: [
        {
          propertyId: SystemIds.NAME_PROPERTY,
          spaceId: 'space-a',
          type: 'TEXT',
          before: null,
          after: '  Raw name  ',
          diff: [],
        },
      ],
    });

    expect(entityDiffToRankingEntry(diff).name).toBe('Raw name');
  });

  it('falls back to "Untitled" and a null description when the diff is empty', () => {
    expect(entityDiffToRankingEntry(makeDiff({ name: null }))).toEqual({
      entityId: 'entity-1',
      name: 'Untitled',
      description: null,
      image: null,
      spaceId: null,
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

describe('selectRankingBlockPendingCandidates', () => {
  const empty = {
    ownRankingEntityIds: [],
    unresolvedMyRankingEntityIds: [],
    viewerOwnEntityIds: [],
    unresolvedViewerOwnEntityIds: [],
    submitterSpaceIds: [],
    priorityProposerSpaceIds: [],
  };

  it('asks nothing for a signed-out visitor, whatever the global leaderboard holds', () => {
    expect(
      selectRankingBlockPendingCandidates({
        ...empty,
        submitterSpaceIds: ['author-a', 'author-b'],
        priorityProposerSpaceIds: [null, null],
      })
    ).toEqual({ candidateEntityIds: [], proposerSpaceIds: [] });
  });

  it('searches only the viewer when their rendered rows are all named', () => {
    expect(
      selectRankingBlockPendingCandidates({
        ...empty,
        ownRankingEntityIds: ['e1', 'e2'],
        submitterSpaceIds: ['author-a'],
        priorityProposerSpaceIds: ['me', null],
      })
    ).toEqual({ candidateEntityIds: ['e1', 'e2'], proposerSpaceIds: ['me'] });
  });

  it('widens to submitters for unresolved rendered rows, keeping priority proposers first', () => {
    const submitters = Array.from({ length: 20 }, (_, i) => `author-${i}`);
    const { candidateEntityIds, proposerSpaceIds } = selectRankingBlockPendingCandidates({
      ...empty,
      ownRankingEntityIds: ['e1'],
      unresolvedMyRankingEntityIds: ['e1'],
      viewerOwnEntityIds: ['v1'],
      submitterSpaceIds: submitters,
      priorityProposerSpaceIds: ['me', 'shared-author'],
    });

    expect(candidateEntityIds).toEqual(['e1', 'v1']);
    expect(proposerSpaceIds).toHaveLength(MAX_PENDING_PROPOSERS);
    expect(proposerSpaceIds.slice(0, 3)).toEqual(['me', 'shared-author', 'author-0']);
  });

  it('widens to submitters for unresolved viewer-own rows', () => {
    expect(
      selectRankingBlockPendingCandidates({
        ...empty,
        viewerOwnEntityIds: ['v1'],
        unresolvedViewerOwnEntityIds: ['v1'],
        submitterSpaceIds: ['author-a'],
        priorityProposerSpaceIds: ['me'],
      }).proposerSpaceIds
    ).toEqual(['me', 'author-a']);
  });
});
