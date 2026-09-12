import { describe, expect, it } from 'vitest';

import {
  ACADEMIC_FIELDS_PROPERTY,
  ACADEMIC_FIELD_TYPE,
  DEGREE_PROPERTY,
  DEGREE_TYPE,
  DESCRIPTION_PROPERTY,
  EDUCATION_PROPERTY,
  EDUCATION_STATUS_OPTION,
  EDUCATION_STATUS_PROPERTY,
  EMPLOYER_TYPE,
  EMPLOYMENT_PROPERTY,
  EMPLOYMENT_STATUS_OPTION,
  EMPLOYMENT_STATUS_PROPERTY,
  EMPLOYMENT_TYPE_OPTIONS,
  EMPLOYMENT_TYPE_PROPERTY,
  EMPLOYMENT_TYPE_TYPE,
  END_DATE_PROPERTY,
  INSTITUTION_TYPE,
  IS_REQUIRED_PROPERTY,
  JOB_TYPE,
  LEGACY_DEGREE_TYPE,
  LOCATION_PROPERTY,
  LOCATION_TYPE_OPTIONS,
  LOCATION_TYPE_PROPERTY,
  ROLES_PROPERTY,
  ROLE_INFORMATION_TYPE,
  SCOPE_RANK_PROPERTY,
  SKILLS_PROPERTY,
  SKILL_SCOPE_PROPERTY,
  SKILL_TYPE,
  START_DATE_PROPERTY,
  UNIVERSITY_TYPE,
  educationStatusFromOptionId,
  employmentStatusFromOptionId,
} from './history-ontology';

/**
 * Pins every id to the value read back from the graph on 2026-09-10. Several come
 * from the SDK under names that describe the first feature to use them rather
 * than what they are (`RANK_START_DATE_PROPERTY` is the general Start date), so
 * an upstream rename or repoint would otherwise land silently — as relations
 * written against an id nothing reads.
 */
describe('history ontology ids', () => {
  it.each([
    ['Employment', EMPLOYMENT_PROPERTY, 'a2fae35bac864a568b26e69643c68d9d'],
    ['Roles', ROLES_PROPERTY, '8fcfe5ef3d9147bd83223830a998d26b'],
    ['Employment status', EMPLOYMENT_STATUS_PROPERTY, '3415e3537e0542099bffe07755fa004f'],
    ['Education', EDUCATION_PROPERTY, 'dbb41bb9f76f4e5e866590086857fa22'],
    ['Degree', DEGREE_PROPERTY, '38344c504261406496db13504579e64f'],
    ['Education status', EDUCATION_STATUS_PROPERTY, 'afff0f059654466e865448d56585a41c'],
    ['Academic fields', ACADEMIC_FIELDS_PROPERTY, '11692db4ddf54a69bfa044fb6b12f401'],
    ['Academic field type', ACADEMIC_FIELD_TYPE, '9959eb50b0294a158557b39318cbb91b'],
    ['Start date', START_DATE_PROPERTY, 'eed03a040acd4a9e81e08272ed70a817'],
    ['End date', END_DATE_PROPERTY, 'b08b8f63dc1e41568b0819946f2b011c'],
    ['Description', DESCRIPTION_PROPERTY, '9b1f76ff9711404c861e59dc3fa7d037'],
    ['Employer type (Project)', EMPLOYER_TYPE, '484a18c5030a499cb0f2ef588ff16d50'],
    ['Employment type property', EMPLOYMENT_TYPE_PROPERTY, '53a98633a2db40be9f161a4c9da37970'],
    ['Employment type (type)', EMPLOYMENT_TYPE_TYPE, 'f503bfd283d74e1a9b30294fff9d2d7e'],
    ['Skills', SKILLS_PROPERTY, 'a38732e33a3d47f9a459fb369c287709'],
    ['Skill type', SKILL_TYPE, '9ca6ab1f3a114e49bbaf72e0c9a985cf'],
    // What `Roles` declares it points at, and what its relation entity is. The
    // picker searched `Job` until these were read off the property itself.
    ['Title type (Person role)', JOB_TYPE, 'e4e366e9d5554b6892bf7358e824afd2'],
    ['Role information', ROLE_INFORMATION_TYPE, '343952488d4a4bc088aae611b931ac0e'],
    ['Is required?', IS_REQUIRED_PROPERTY, '3d60051c488f4a5ebae67a8264ade8bd'],
    ['Skill scope', SKILL_SCOPE_PROPERTY, '7426f8535dc84776bd7abce1d069fa06'],
    ['Scope rank', SCOPE_RANK_PROPERTY, '3ae1e15935864c0f9425652125d03772'],
    // Seven properties are named `Location` and three `Location type`. These are
    // the ones the graph uses — 676 relations and 16, against nothing at all for
    // the rest — so the id matters more here than usual.
    ['Location', LOCATION_PROPERTY, '95d770021faf4f7cb7deb21a7d48cda0'],
    ['Location type', LOCATION_TYPE_PROPERTY, 'ceeb611101554764bea22818b21d3fbd'],
    ['Degree type', DEGREE_TYPE, 'bfd47a5430aa43e18b8b8b86735919a0'],
    // A second real type of the same name, carrying the degrees that predate the
    // declared one. Searching only the declared one hides all of them.
    ['Degree type (legacy)', LEGACY_DEGREE_TYPE, '65256c5462834981b502aceeb74bd08c'],
    ['University', UNIVERSITY_TYPE, '0235f3d2821947a481d39ccd68e2b821'],
    ['Institution', INSTITUTION_TYPE, '7f5433a40628498f9de6311cb14709a8'],
  ])('%s resolves to the id the graph has', (_name, actual, expected) => {
    expect(actual).toBe(expected);
  });

  // The reason the Title picker was wrong: `Job` is a real type with 32 entities
  // behind it, so scoping to it looked right and quietly hid the 2,905
  // occupations that `Roles` actually points at.
  it('does not search the type the SDK names Job', () => {
    expect(JOB_TYPE).not.toBe('5ab7946f82bc42899d02a5f13bd40935');
  });
});

describe('status options', () => {
  it('maps employment status both ways', () => {
    expect(employmentStatusFromOptionId(EMPLOYMENT_STATUS_OPTION.current)).toBe('current');
    expect(employmentStatusFromOptionId(EMPLOYMENT_STATUS_OPTION.former)).toBe('former');
  });

  it('maps the two education statuses that exist', () => {
    expect(educationStatusFromOptionId(EDUCATION_STATUS_OPTION.completed)).toBe('completed');
    expect(educationStatusFromOptionId(EDUCATION_STATUS_OPTION.incomplete)).toBe('incomplete');
  });

  // The graph has no "in progress" option. Still studying is expressed by writing
  // no status and leaving End date empty, so there is deliberately nothing to map.
  it('has no option id for still studying', () => {
    expect(EDUCATION_STATUS_OPTION).not.toHaveProperty('studying');
  });

  it('reads an unknown or absent option as no status', () => {
    expect(employmentStatusFromOptionId(undefined)).toBeNull();
    expect(employmentStatusFromOptionId('something-else')).toBeNull();
    expect(educationStatusFromOptionId(null)).toBeNull();
  });
});

describe('employment type options', () => {
  it('offers the eight LinkedIn types, in that order', () => {
    expect(EMPLOYMENT_TYPE_OPTIONS.map(option => option.name)).toEqual([
      'Full-time',
      'Part-time',
      'Self-employed',
      'Freelance',
      'Contract',
      'Internship',
      'Apprenticeship',
      'Seasonal',
    ]);
  });

  // Confirmed against the graph like the rest. Pinned because six other entities
  // named "Full-time" are typed the same way, so a wrong id here would look
  // plausible in the data and point at the wrong one.
  it('pins each option id', () => {
    expect(Object.fromEntries(EMPLOYMENT_TYPE_OPTIONS.map(o => [o.name, o.id]))).toEqual({
      'Full-time': 'f4a86b892f094d97894c4bfedd150c30',
      'Part-time': '5758c248068e44838da7e22109d9993f',
      'Self-employed': '00f2a3b854f949c7b9f8a1e46872cbcc',
      Freelance: '75839ffa17ef4d20b4e0621a4780030d',
      Contract: '80d15f0e3b4f4288b69a1bcb5c3e4a0b',
      Internship: '6eaed80c39b144f48e31dabf409a0722',
      Apprenticeship: '946a5333fa084b2aac0c8d89a97b431c',
      Seasonal: '1a0235d7f32e4cff83f9545f01bd96ba',
    });
  });

  it('gives every option a distinct id', () => {
    const ids = EMPLOYMENT_TYPE_OPTIONS.map(option => option.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('location type options', () => {
  // Onsite and Hybrid and Remote are one set: same space, and descriptions that
  // only make sense together ("Position combines remote and onsite work"). Only
  // the first and last have ever been used, so Hybrid is the one most likely to
  // be wrong if any of them is.
  it.each([
    ['Onsite', '19db5058ae4849e79fd698f46b6beae4'],
    ['Hybrid', '18022953fd99439e8feb55e50241dac0'],
    ['Remote', '8f5e23aa70394ea4b7946fa0a9878da7'],
  ])('%s resolves to the id the graph has', (name, id) => {
    expect(LOCATION_TYPE_OPTIONS.find(option => option.name === name)?.id).toBe(id);
  });

  // The graph spells it `Onsite`. Writing `On-site` would point at nothing.
  it('spells them the way the graph does', () => {
    expect(LOCATION_TYPE_OPTIONS.map(option => option.name)).toEqual(['Onsite', 'Hybrid', 'Remote']);
  });
});
