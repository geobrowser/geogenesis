import { describe, expect, it } from 'vitest';

import type { EducationCard, EmploymentCard } from './normalize-history';
import { collectSkills, currentRoles } from './profile-summary';

const NOTHING = { relations: [], values: [] };

const employmentCard = (
  org: string,
  roles: { name: string; status?: 'current' | 'former'; end?: string | null; skills?: string[] }[]
): EmploymentCard =>
  ({
    organization: { id: `org-${org}`, name: org },
    avatarUrl: null,
    edges: [{ relationId: `edge-${org}`, stintId: `stint-${org}`, spaceId: null, subtree: NOTHING }],
    entries: roles.map(role => ({
      relationId: `rel-${role.name}`,
      spaceId: null,
      tenureId: `tenure-${role.name}`,
      edge: { relationId: `edge-${org}`, stintId: `stint-${org}`, spaceId: null, subtree: NOTHING },
      subtree: NOTHING,
      subject: { id: `title-${role.name}`, name: role.name },
      startDate: '2022-06-01Z',
      endDate: role.end ?? null,
      description: null,
      isLegacy: false,
      status: role.status ?? 'current',
      employmentType: null,
      skills: (role.skills ?? []).map(name => ({ id: `skill-${name}`, name })),
      location: null,
      locationType: null,
    })),
  }) as unknown as EmploymentCard;

const educationCard = (
  school: string,
  degree: { name: string; status?: 'studying' | 'completed'; fields?: string[]; skills?: string[] }
): EducationCard =>
  ({
    organization: { id: `org-${school}`, name: school },
    avatarUrl: null,
    edges: [{ relationId: `edge-${school}`, stintId: `stint-${school}`, spaceId: null, subtree: NOTHING }],
    entries: [
      {
        relationId: `rel-${degree.name}`,
        spaceId: null,
        tenureId: `tenure-${degree.name}`,
        edge: { relationId: `edge-${school}`, stintId: `stint-${school}`, spaceId: null, subtree: NOTHING },
        subtree: NOTHING,
        subject: { id: `degree-${degree.name}`, name: degree.name },
        startDate: '2022-08-01Z',
        endDate: degree.status === 'completed' ? '2024-06-01Z' : null,
        description: null,
        isLegacy: false,
        status: degree.status ?? null,
        fields: (degree.fields ?? []).map(name => ({ id: `field-${name}`, name })),
        skills: (degree.skills ?? []).map(name => ({ id: `skill-${name}`, name })),
        grade: null,
      },
    ],
  }) as unknown as EducationCard;

describe('currentRoles', () => {
  // The reference account holds two jobs and a PhD at once. Picking one would
  // mean inventing a rule about which job is the real one.
  it('lists every current job and degree', () => {
    const roles = currentRoles(
      [
        employmentCard('Geo', [{ name: 'Head of Product' }]),
        employmentCard('EE Solutions', [{ name: 'Product manager' }]),
      ],
      [educationCard('Cincinnati', { name: 'Doctor of Philosophy' })]
    );

    expect(roles.map(r => `${r.subject} at ${r.organization}`)).toEqual([
      'Head of Product at Geo',
      'Product manager at EE Solutions',
      'Doctor of Philosophy at Cincinnati',
    ]);
  });

  it('leaves out anything that has ended', () => {
    const roles = currentRoles(
      [
        employmentCard('Geo', [
          { name: 'Head of Product' },
          { name: 'Product manager', status: 'former', end: '2026-07-01Z' },
        ]),
      ],
      [educationCard('Purdue', { name: 'Bachelor of Science', status: 'completed' })]
    );

    expect(roles.map(r => r.subject)).toEqual(['Head of Product']);
  });

  // A finished role often has no end date recorded; the status is what settles
  // it. Reading the gap as "still there" puts old jobs in the headline.
  it('trusts the status over a missing end date', () => {
    const roles = currentRoles([employmentCard('Geo', [{ name: 'Engineer', status: 'former' }])], []);

    expect(roles).toEqual([]);
  });

  it('says nothing for an account with no current anything', () => {
    expect(currentRoles([], [])).toEqual([]);
  });
});

describe('collectSkills', () => {
  it('draws from work and education together', () => {
    const skills = collectSkills(
      [employmentCard('Geo', [{ name: 'Head of Product', skills: ['Market research', 'Product life-cycle'] }])],
      [educationCard('Purdue', { name: 'B.Sc.', fields: ['Computer Science'], skills: ['Quantitative research'] })]
    );

    expect(skills).toEqual(['Market research', 'Product life-cycle', 'Quantitative research', 'Computer Science']);
  });

  // Two roles claim Market research on the reference account.
  it('counts a skill once however many rows claim it', () => {
    const skills = collectSkills(
      [
        employmentCard('Geo', [{ name: 'Head of Product', skills: ['Market research'] }]),
        employmentCard('Deloitte', [{ name: 'Analyst', skills: ['market research', 'Business analysis'] }]),
      ],
      []
    );

    expect(skills).toEqual(['Market research', 'Business analysis']);
  });

  // Without this a bachelor's contributes nothing to a list of what someone knows.
  it('counts a field of study as a skill', () => {
    const skills = collectSkills([], [educationCard('Purdue', { name: 'B.Sc.', fields: ['Mechanical Engineering'] })]);

    expect(skills).toEqual(['Mechanical Engineering']);
  });

  it('ignores an unnamed skill rather than rendering a blank chip', () => {
    const card = employmentCard('Geo', [{ name: 'Engineer', skills: ['Real'] }]);
    card.entries[0]!.skills.push({ id: 'skill-none', name: null });

    expect(collectSkills([card], [])).toEqual(['Real']);
  });
});
