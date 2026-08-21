import { describe, expect, it } from 'vitest';

import { collectSkillNames, skillIdsByName, toSpaceBounty } from './community-adapter';
import type { BoardBounty } from './types';

const bounty: BoardBounty = {
  id: 'b',
  spaceId: 's',
  name: 'Bounty',
  description: 'Desc',
  budget: 500,
  difficulty: 'Hard',
  difficultyId: null,
  status: 'To do',
  statusId: null,
  deadline: null,
  skills: [
    { id: 'skill-2', name: 'Writing' },
    { id: 'skill-1', name: 'Pharmacology' },
  ],
  maintainers: [],
  allocatedIds: ['p1'],
  interestedCount: 0,
  updatedAt: null,
  isFeatured: true,
  contributors: [{ entityId: 'p1', name: 'Alice', avatarUrl: null }],
};

describe('community adapter', () => {
  it('maps the board model to the community card shape', () => {
    expect(toSpaceBounty(bounty)).toEqual({
      id: 'b',
      spaceId: 's',
      name: 'Bounty',
      description: 'Desc',
      budget: 500,
      difficulty: 'Hard',
      skills: ['Writing', 'Pharmacology'],
      isFeatured: true,
      contributors: [{ entityId: 'p1', name: 'Alice', avatarUrl: null }],
    });
  });

  it('collects sorted skill names and a name→id map', () => {
    expect(collectSkillNames([bounty])).toEqual(['Pharmacology', 'Writing']);
    expect(skillIdsByName([bounty]).get('Writing')).toBe('skill-2');
  });
});
