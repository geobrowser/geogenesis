import { describe, expect, it } from 'vitest';

import type { EducationCard, EmploymentCard } from './normalize-history';
import { collectSkills, currentAffiliation, currentRoles } from './profile-summary';

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

  /**
   * Undated history is the norm, not the exception.
   *
   * 1,739 of the graph's 1,906 employment rows carry no date at all, and
   * `isOngoing` counts a row with no status as open — so admitting every undated
   * row would put a person's whole back catalogue under their name as things
   * they are doing now. Requiring a start date kept those out, and took with it
   * the rows that *say* they are current. Those are a statement, and the
   * headline promises "every current role and degree".
   */
  it('keeps an undated role that says it is current', () => {
    const card = employmentCard('Geo', [{ name: 'Head of Product' }]);
    card.entries[0].startDate = null;

    expect(currentRoles([card], [])).toHaveLength(1);
  });

  it('keeps a modern undated degree whose missing status means still studying', () => {
    const card = educationCard('Cincinnati', { name: 'Doctor of Philosophy' });
    card.entries[0].startDate = null;

    expect(currentRoles([], [card])).toHaveLength(1);
    expect(currentAffiliation([], [card])).toBe('Doctor of Philosophy at Cincinnati');
  });

  it('leaves out an ambiguous legacy degree with no dates or status', () => {
    const card = educationCard('Cincinnati', { name: 'Doctor of Philosophy' });
    card.entries[0].startDate = null;
    card.entries[0].isLegacy = true;

    expect(currentRoles([], [card])).toEqual([]);
    expect(currentAffiliation([], [card])).toBeNull();
  });

  it('leaves out a row that is undated and says nothing', () => {
    // Open by `isOngoing`, but only because nothing contradicts it. That is not
    // evidence of anything current, and there are 1,739 of them.
    const card = employmentCard('Geo', [{ name: 'Head of Product' }]);
    card.entries[0].startDate = null;
    card.entries[0].status = null;

    expect(currentRoles([card], [])).toEqual([]);
  });

  it('leaves out an undated row that has ended', () => {
    const card = employmentCard('Geo', [{ name: 'Head of Product', status: 'former' }]);
    card.entries[0].startDate = null;
    card.entries[0].endDate = null;

    // `former` is an explicit end even with no date to go with it.
    expect(currentRoles([card], [])).toEqual([]);
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

describe('currentAffiliation', () => {
  it('uses the first current affiliation in profile order', () => {
    expect(
      currentAffiliation(
        [
          employmentCard('Geo', [{ name: 'Head of Product' }]),
          employmentCard('EE Solutions', [{ name: 'Product manager' }]),
        ],
        [educationCard('Stanford', { name: 'PhD student', fields: ['Economics'], status: 'studying' })]
      )
    ).toBe('Head of Product at Geo');
  });

  it('falls back to a current degree and includes its field of study', () => {
    expect(
      currentAffiliation(
        [employmentCard('Geo', [{ name: 'Former role', status: 'former' }])],
        [educationCard('Stanford', { name: 'PhD student', fields: ['Economics'], status: 'studying' })]
      )
    ).toBe('PhD student, Economics at Stanford');
  });

  it('shows either half by itself without a dangling at', () => {
    const roleOnly = employmentCard('Geo', [{ name: 'Head of Product' }]);
    roleOnly.organization.name = null;
    expect(currentAffiliation([roleOnly], [])).toBe('Head of Product');

    const organizationOnly = employmentCard('Geo', [{ name: 'Head of Product' }]);
    organizationOnly.entries[0]!.subject.name = null;
    expect(currentAffiliation([organizationOnly], [])).toBe('Geo');
  });

  it('shows nothing when there is no current affiliation', () => {
    expect(currentAffiliation([employmentCard('Geo', [{ name: 'Engineer', status: 'former' }])], [])).toBeNull();
  });
});

describe('collectSkills', () => {
  it('draws from work and education together', () => {
    const skills = collectSkills(
      [employmentCard('Geo', [{ name: 'Head of Product', skills: ['Market research', 'Product life-cycle'] }])],
      [educationCard('Purdue', { name: 'B.Sc.', fields: ['Computer Science'], skills: ['Quantitative research'] })]
    );

    // Names *and* ids: a skill on a profile is a link to everyone else who has it.
    expect(skills).toEqual([
      { id: 'skill-Market research', name: 'Market research' },
      { id: 'skill-Product life-cycle', name: 'Product life-cycle' },
      { id: 'skill-Quantitative research', name: 'Quantitative research' },
      { id: 'field-Computer Science', name: 'Computer Science' },
    ]);
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

    // The first spelling and the first id win; the second row's differently
    // cased duplicate is the same skill.
    expect(skills).toEqual([
      { id: 'skill-Market research', name: 'Market research' },
      { id: 'skill-Business analysis', name: 'Business analysis' },
    ]);
  });

  // Without this a bachelor's contributes nothing to a list of what someone knows.
  it('counts a field of study as a skill', () => {
    const skills = collectSkills([], [educationCard('Purdue', { name: 'B.Sc.', fields: ['Mechanical Engineering'] })]);

    expect(skills).toEqual([{ id: 'field-Mechanical Engineering', name: 'Mechanical Engineering' }]);
  });

  it('ignores an unnamed skill rather than rendering a blank chip', () => {
    const card = employmentCard('Geo', [{ name: 'Engineer', skills: ['Real'] }]);
    card.entries[0]!.skills.push({ id: 'skill-none', name: null });

    expect(collectSkills([card], [])).toEqual([{ id: 'skill-Real', name: 'Real' }]);
  });

  it('takes the id from whichever row has one', () => {
    // A legacy field of study is a string on the relation with no entity behind
    // it. Met first, it must not deny the real entity's id to the chip — an id
    // of '' renders as plain text rather than a link.
    const legacy = educationCard('Purdue', { name: 'B.Sc.', fields: ['Finance'] });
    legacy.entries[0]!.fields = [{ id: '', name: 'Finance' }];

    const employment = employmentCard('Geo', [{ name: 'Analyst', skills: ['Finance'] }]);

    expect(collectSkills([], [legacy])).toEqual([{ id: '', name: 'Finance' }]);
    expect(collectSkills([employment], [legacy])).toEqual([{ id: 'skill-Finance', name: 'Finance' }]);
  });
});
