import { describe, expect, it } from 'vitest';

import { availableBountyCta, collectSkillNames, skillIdsByName, toSpaceBounty } from './community-adapter';
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
    expect(toSpaceBounty(bounty)).toMatchObject({
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

describe('availableBountyCta', () => {
  const now = Date.parse('2026-09-01T00:00:00Z');

  it('blocks the same states the detail page blocks: ended, then spots filled', () => {
    expect(
      availableBountyCta({ deadline: '2026-08-01T00:00:00Z', maxContributors: null, allocatedCount: 0 }, now)
    ).toBe('ended');
    expect(availableBountyCta({ deadline: null, maxContributors: 2, allocatedCount: 2 }, now)).toBe('spots-filled');
    expect(availableBountyCta({ deadline: '2026-10-01T00:00:00Z', maxContributors: 2, allocatedCount: 1 }, now)).toBe(
      'apply'
    );
    expect(availableBountyCta({}, now)).toBe('apply');
  });
});
