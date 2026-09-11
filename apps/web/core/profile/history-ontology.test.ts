import { describe, expect, it } from 'vitest';

import {
  ACADEMIC_FIELDS_PROPERTY,
  ACADEMIC_FIELD_TYPE,
  DEGREE_PROPERTY,
  DESCRIPTION_PROPERTY,
  EDUCATION_PROPERTY,
  EDUCATION_STATUS_OPTION,
  EDUCATION_STATUS_PROPERTY,
  EMPLOYER_TYPE,
  EMPLOYMENT_PROPERTY,
  EMPLOYMENT_STATUS_OPTION,
  EMPLOYMENT_STATUS_PROPERTY,
  END_DATE_PROPERTY,
  ROLES_PROPERTY,
  START_DATE_PROPERTY,
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
  ])('%s resolves to the id the graph has', (_name, actual, expected) => {
    expect(actual).toBe(expected);
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
