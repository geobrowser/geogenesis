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

  it('carries the selected difficulties and skills (by id); a selection covering everything carries nothing', () => {
    expect(
      viewAllHref(
        spaceId,
        'available',
        { scope: 'all', difficulties: new Set(['Hard']), selectedSkills: new Set(['Writing']) },
        skills,
        skillIds
      )
    ).toBe('/space/space-1/bounties?status=todo&difficulty=hard&skill=skill-writing');
    expect(
      viewAllHref(
        spaceId,
        'available',
        { scope: 'all', difficulties: new Set(['Hard', 'Easy']), selectedSkills: new Set(skills) },
        skills,
        skillIds
      )
    ).toBe('/space/space-1/bounties?status=todo&difficulty=easy%2Chard');
    expect(
      viewAllHref(
        spaceId,
        'available',
        { scope: 'all', difficulties: new Set(), selectedSkills: new Set(['Pharmacology', 'Writing']) },
        skills,
        skillIds
      )
    ).toBe('/space/space-1/bounties?status=todo');
  });
});
