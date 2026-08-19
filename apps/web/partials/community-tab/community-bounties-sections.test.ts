import { describe, expect, it } from 'vitest';

import { viewAllHref } from './community-bounties-sections';

const spaceId = 'space-1';
const skills = ['Pharmacology', 'Writing'];
const skillIds = new Map([
  ['Pharmacology', 'skill-pharma'],
  ['Writing', 'skill-writing'],
]);

describe('viewAllHref', () => {
  it('deep-links into the space bounty board with the section statuses and the Featured scope', () => {
    expect(
      viewAllHref(
        spaceId,
        'available',
        { scope: 'featured', difficulties: new Set(['Easy', 'Medium', 'Hard']), selectedSkills: null },
        skills,
        skillIds
      )
    ).toBe('/space/space-1/bounties?scope=featured&status=todo');
    expect(
      viewAllHref(
        spaceId,
        'completed',
        { scope: 'all', difficulties: new Set(['Easy', 'Medium', 'Hard']), selectedSkills: null },
        skills,
        skillIds
      )
    ).toBe('/space/space-1/bounties?status=done');
    expect(
      viewAllHref(
        spaceId,
        'in-progress',
        { scope: 'all', difficulties: new Set(['Easy', 'Medium', 'Hard']), selectedSkills: null },
        skills,
        skillIds
      )
    ).toBe('/space/space-1/bounties?status=in-progress');
  });

  it('carries a single selected difficulty and skill (the board filters are single-select)', () => {
    expect(
      viewAllHref(
        spaceId,
        'available',
        { scope: 'all', difficulties: new Set(['Hard']), selectedSkills: new Set(['Writing']) },
        skills,
        skillIds
      )
    ).toBe('/space/space-1/bounties?status=todo&difficulty=hard&skill=skill-writing');
    // Multiple selections are not representable on the board — drop them rather than guess.
    expect(
      viewAllHref(
        spaceId,
        'available',
        { scope: 'all', difficulties: new Set(['Easy', 'Hard']), selectedSkills: new Set(skills) },
        skills,
        skillIds
      )
    ).toBe('/space/space-1/bounties?status=todo');
  });
});
