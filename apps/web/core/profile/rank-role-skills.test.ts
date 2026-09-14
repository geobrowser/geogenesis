import { describe, expect, it } from 'vitest';

import { type RoleSkill, normalizeRoleSkills, suggestSkills } from './rank-role-skills';

const raw = (name: string, isRequired: boolean | null, rank: string | null) => ({
  isRequired,
  skill: { id: `skill-${name}`, name },
  rank,
});

const skill = (name: string, isRequired: boolean, rank: number): RoleSkill => ({
  id: `skill-${name}`,
  name,
  isRequired,
  rank,
});

describe('normalizeRoleSkills', () => {
  // The graph stores rank as an integer and GraphQL hands back a BigInt, which
  // arrives as a string. Sorting those directly is lexicographic — right for 1–4
  // by luck, wrong the moment the scale grows past 9.
  it('reads the rank as a number rather than the string it arrives as', () => {
    const [read] = normalizeRoleSkills([raw('Debug software', true, '3')]);

    expect(read.rank).toBe(3);
    expect(typeof read.rank).toBe('number');
  });

  it('sorts a skill with no scope below everything that has one', () => {
    const skills = normalizeRoleSkills([raw('Unscoped', true, null), raw('Transversal', true, '1')]);

    expect(suggestSkills(skills, []).map(entry => entry.name)).toEqual(['Transversal', 'Unscoped']);
  });

  it('treats a missing required flag as not required', () => {
    const [read] = normalizeRoleSkills([raw('Debug software', null, '3')]);

    expect(read.isRequired).toBe(false);
  });

  it('drops a relation whose skill did not resolve', () => {
    expect(normalizeRoleSkills([{ isRequired: true, skill: null, rank: '3' }])).toEqual([]);
  });
});

describe('suggestSkills', () => {
  // What ranking is for. `Computer programming` is essential to Software
  // developer and transversal, so it says almost nothing about the job — in live
  // data `troubleshoot` is essential to 236 occupations.
  it('puts the distinctive skills ahead of the ubiquitous ones', () => {
    const suggestions = suggestSkills(
      [
        skill('Computer programming', true, 1),
        skill('Use software libraries', true, 3),
        skill('Troubleshoot', true, 2),
      ],
      []
    );

    expect(suggestions.map(entry => entry.name)).toEqual([
      'Use software libraries',
      'Troubleshoot',
      'Computer programming',
    ]);
  });

  // Rank alone would put an optional occupation-specific skill above an
  // essential one, which is a worse answer than either rule gives on its own.
  it('keeps every essential skill ahead of every optional one', () => {
    const suggestions = suggestSkills([skill('Optional niche', false, 4), skill('Essential broad', true, 2)], []);

    expect(suggestions.map(entry => entry.name)).toEqual(['Essential broad', 'Optional niche']);
  });

  // Roles exist with as few as eight essential skills, so filtering to essential
  // ones alone leaves some showing two suggestions and a gap.
  it('backfills from the optional skills when the essential ones run out', () => {
    const suggestions = suggestSkills(
      [skill('Essential', true, 3), skill('Optional A', false, 4), skill('Optional B', false, 2)],
      []
    );

    expect(suggestions.map(entry => entry.name)).toEqual(['Essential', 'Optional A', 'Optional B']);
  });

  it('does not suggest a skill already on the draft', () => {
    const suggestions = suggestSkills([skill('Kept', true, 3), skill('Picked', true, 4)], ['skill-Picked']);

    expect(suggestions.map(entry => entry.name)).toEqual(['Kept']);
  });

  it('offers five at most', () => {
    const skills = Array.from({ length: 12 }, (_, index) => skill(`Skill ${index}`, true, 3));

    expect(suggestSkills(skills, [])).toHaveLength(5);
  });

  // A title somebody typed in themselves has nothing hanging off it. That is an
  // empty list, not a worse one.
  it('suggests nothing for a role with no skills', () => {
    expect(suggestSkills([], [])).toEqual([]);
  });
});
