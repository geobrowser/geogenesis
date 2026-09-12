import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { describe, expect, it } from 'vitest';

import type { Relation } from '~/core/types';

import {
  ACADEMIC_FIELDS_PROPERTY,
  DEGREE_INFORMATION_TYPE,
  DEGREE_PROPERTY,
  DEGREE_TYPE,
  DESCRIPTION_PROPERTY,
  EDUCATION_PROPERTY,
  EDUCATION_RECORD_TYPE,
  EDUCATION_STATUS_COMPLETED,
  EDUCATION_STATUS_PROPERTY,
  EMPLOYER_TYPE,
  EMPLOYMENT_PROPERTY,
  EMPLOYMENT_RECORD_TYPE,
  EMPLOYMENT_STATUS_CURRENT,
  EMPLOYMENT_STATUS_FORMER,
  EMPLOYMENT_STATUS_PROPERTY,
  END_DATE_PROPERTY,
  GRADE_PROPERTY,
  JOB_TYPE,
  LOCATION_PROPERTY,
  LOCATION_TYPE_PROPERTY,
  ROLES_PROPERTY,
  ROLE_INFORMATION_TYPE,
  SKILLS_PROPERTY,
  START_DATE_PROPERTY,
} from './history-ontology';
import { type EducationDraft, type PositionDraft, stageEducation, stagePosition } from './stage-history';

const context = { personEntityId: 'person-1', spaceId: 'space-1' };

const picked = (id: string, name: string) => ({ id, name, isNew: false });
const created = (id: string, name: string) => ({ id, name, isNew: true });

const position = (overrides: Partial<PositionDraft> = {}): PositionDraft => ({
  company: picked('coinbase', 'Coinbase'),
  title: picked('analyst', 'Data Analyst'),
  employmentType: null,
  skills: [],
  location: null,
  locationType: null,
  startDate: '2019-03-01Z',
  endDate: '2021-01-01Z',
  status: 'former',
  description: '',
  ...overrides,
});

const education = (overrides: Partial<EducationDraft> = {}): EducationDraft => ({
  school: picked('northumbria', 'Northumbria University'),
  degree: picked('phd', 'Ph.D.'),
  fields: [picked('finance', 'Finance')],
  skills: [],
  grade: '',
  startDate: '2022-09-01Z',
  endDate: null,
  status: 'studying',
  description: '',
  ...overrides,
});

const byType = (relations: Relation[], typeId: string) => relations.filter(r => r.type.id === typeId);
const oneOf = (relations: Relation[], typeId: string) => {
  const matches = byType(relations, typeId);
  expect(matches).toHaveLength(1);
  return matches[0];
};

describe('stagePosition', () => {
  it('links person → company → role → status, each level hanging off the one above', () => {
    const { relations } = stagePosition(position(), context);

    const employment = oneOf(relations, EMPLOYMENT_PROPERTY);
    expect(employment.fromEntity.id).toBe('person-1');
    expect(employment.toEntity.id).toBe('coinbase');

    // The Roles edge hangs off the Employment relation's own entity — the stint —
    // not off the company and not off the person.
    const roles = oneOf(relations, ROLES_PROPERTY);
    expect(roles.fromEntity.id).toBe(employment.entityId);
    expect(roles.toEntity.id).toBe('analyst');

    // Status belongs to the tenure, so one company can hold a role left in 2021
    // and a role held now.
    const status = oneOf(relations, EMPLOYMENT_STATUS_PROPERTY);
    expect(status.fromEntity.id).toBe(roles.entityId);
    expect(status.toEntity.id).toBe(EMPLOYMENT_STATUS_FORMER);
  });

  it('puts the dates on the tenure rather than the stint', () => {
    const { values, relations } = stagePosition(position(), context);
    const roles = oneOf(relations, ROLES_PROPERTY);

    const start = values.find(value => value.property.id === START_DATE_PROPERTY);
    const end = values.find(value => value.property.id === END_DATE_PROPERTY);

    expect(start).toMatchObject({ entity: { id: roles.entityId }, value: '2019-03-01Z' });
    expect(end).toMatchObject({ entity: { id: roles.entityId }, value: '2021-01-01Z' });
    expect(start?.property.dataType).toBe('DATE');
  });

  // The promotion case: the company edge already exists, so this costs a relation,
  // an entity and its dates rather than the full six rows.
  it('reuses an existing stint when adding a second role at the same company', () => {
    const { relations } = stagePosition(position({ existingStintId: 'stint-1' }), context);

    expect(byType(relations, EMPLOYMENT_PROPERTY)).toHaveLength(0);
    expect(oneOf(relations, ROLES_PROPERTY).fromEntity.id).toBe('stint-1');
  });

  it('leaves End date unwritten for a role still held', () => {
    const { values } = stagePosition(position({ endDate: null, status: 'current' }), context);

    expect(values.find(value => value.property.id === END_DATE_PROPERTY)).toBeUndefined();
  });

  it('marks a role still held as Current', () => {
    const { relations } = stagePosition(position({ status: 'current' }), context);

    expect(oneOf(relations, EMPLOYMENT_STATUS_PROPERTY).toEntity.id).toBe(EMPLOYMENT_STATUS_CURRENT);
  });

  it('omits an empty description rather than writing a blank value', () => {
    const { values } = stagePosition(position({ description: '   ' }), context);

    expect(values.find(value => value.property.id === DESCRIPTION_PROPERTY)).toBeUndefined();
  });

  // `SelectEntity` mints the id and hands it back; nothing exists behind it until
  // a name is written, and an unnamed target renders as a blank row.
  it('names and types a company the user typed rather than picked', () => {
    const { values, relations } = stagePosition(
      position({ company: created('new-co', 'Fathom'), title: created('new-title', 'Staff Engineer') }),
      context
    );

    expect(values).toContainEqual(expect.objectContaining({ entity: { id: 'new-co', name: null }, value: 'Fathom' }));

    const types = byType(relations, SystemIds.TYPES_PROPERTY);
    expect(types.map(relation => [relation.fromEntity.id, relation.toEntity.id])).toEqual(
      expect.arrayContaining([
        ['new-co', EMPLOYER_TYPE],
        ['new-title', JOB_TYPE],
      ])
    );
  });

  it('names and types nothing for entities that already existed', () => {
    const { values, relations } = stagePosition(position(), context);

    expect(values.filter(value => value.property.id === SystemIds.NAME_PROPERTY)).toHaveLength(0);

    // The two relation entities are the exception, and neither is about a picked
    // entity: both are minted here, so nothing else is going to type them.
    const types = byType(relations, SystemIds.TYPES_PROPERTY);
    expect(types.map(relation => relation.toEntity.id).sort()).toEqual(
      [EMPLOYMENT_RECORD_TYPE, ROLE_INFORMATION_TYPE].sort()
    );
  });

  // `Roles` declares `Role information` as its relation entity type. An untyped
  // tenure is reachable only by walking in from the person who holds it.
  it('types the tenure as Role information', () => {
    const { relations } = stagePosition(position(), context);

    const roles = relations.find(relation => relation.type.id === ROLES_PROPERTY);
    const tenureType = byType(relations, SystemIds.TYPES_PROPERTY).find(
      relation => relation.toEntity.id === ROLE_INFORMATION_TYPE
    );

    expect(tenureType?.fromEntity.id).toBe(roles?.entityId);
  });

  // Beside the dates, for the same reason: a job moves city and goes remote
  // without becoming a different job, and the role it is a promotion from may
  // have been neither.
  it('puts location and location type on the tenure', () => {
    const { relations } = stagePosition(
      position({
        location: picked('city-sf', 'San Francisco'),
        locationType: { id: 'loc-remote', name: 'Remote' },
      }),
      context
    );

    const roles = oneOf(relations, ROLES_PROPERTY);

    expect(oneOf(relations, LOCATION_PROPERTY)).toMatchObject({
      fromEntity: { id: roles.entityId },
      toEntity: { id: 'city-sf' },
    });
    expect(oneOf(relations, LOCATION_TYPE_PROPERTY)).toMatchObject({
      fromEntity: { id: roles.entityId },
      toEntity: { id: 'loc-remote' },
    });
  });

  // Optional on LinkedIn and optional here. A dangling relation to nothing is
  // worse than an unanswered question.
  it('writes neither when they are left unanswered', () => {
    const { relations } = stagePosition(position(), context);

    expect(byType(relations, LOCATION_PROPERTY)).toHaveLength(0);
    expect(byType(relations, LOCATION_TYPE_PROPERTY)).toHaveLength(0);
  });

  // A city the graph has not heard of still has to be a place rather than a
  // string, or the next person typing it makes a second one.
  it('names and types a city the user typed rather than picked', () => {
    const { values } = stagePosition(position({ location: created('new-city', 'Cincinnati') }), context);

    expect(values).toContainEqual(
      expect.objectContaining({ entity: { id: 'new-city', name: null }, value: 'Cincinnati' })
    );
  });

  // Each level says what it is. Untyped, a relation entity is reachable only by
  // walking in from the person holding it.
  it('types the employment record as well as the tenure', () => {
    const { relations } = stagePosition(position(), context);

    const employment = oneOf(relations, EMPLOYMENT_PROPERTY);
    const roles = oneOf(relations, ROLES_PROPERTY);
    const types = byType(relations, SystemIds.TYPES_PROPERTY);

    expect(types.find(t => t.toEntity.id === EMPLOYMENT_RECORD_TYPE)?.fromEntity.id).toBe(employment.entityId);
    expect(types.find(t => t.toEntity.id === ROLE_INFORMATION_TYPE)?.fromEntity.id).toBe(roles.entityId);
  });

  // A promotion reuses the stint, which is already typed, so typing it again
  // would write a second identical Types relation onto it.
  it('does not retype an employment record it did not create', () => {
    const { relations } = stagePosition(position({ existingStintId: 'stint-1' }), context);

    expect(byType(relations, SystemIds.TYPES_PROPERTY).map(t => t.toEntity.id)).toEqual([ROLE_INFORMATION_TYPE]);
  });

  it('gives every row the space being published to', () => {
    const { values, relations } = stagePosition(position({ company: created('new-co', 'Fathom') }), context);

    for (const row of [...values, ...relations]) expect(row.spaceId).toBe('space-1');
  });
});

describe('stageEducation', () => {
  it('links person → school → degree, with fields and status on the enrolment', () => {
    const { relations } = stageEducation(education({ status: 'completed' }), context);

    const record = oneOf(relations, EDUCATION_PROPERTY);
    expect(record.fromEntity.id).toBe('person-1');

    const degree = oneOf(relations, DEGREE_PROPERTY);
    expect(degree.fromEntity.id).toBe(record.entityId);

    const field = oneOf(relations, ACADEMIC_FIELDS_PROPERTY);
    expect(field.fromEntity.id).toBe(degree.entityId);
    expect(field.toEntity.id).toBe('finance');

    expect(oneOf(relations, EDUCATION_STATUS_PROPERTY).toEntity.id).toBe(EDUCATION_STATUS_COMPLETED);
  });

  // A joint honours degree needs more than one, which is why it is a relation.
  it('can carry more than one academic field', () => {
    const { relations } = stageEducation(
      education({ fields: [picked('finance', 'Finance'), picked('econ', 'Economics')] }),
      context
    );

    expect(byType(relations, ACADEMIC_FIELDS_PROPERTY).map(r => r.toEntity.id)).toEqual(['finance', 'econ']);
  });

  // The graph has Completed and Incomplete and nothing for in-progress. Inventing
  // one would be worse than leaving it unsaid; the empty End date carries it.
  it('writes no status at all for still studying', () => {
    const { relations } = stageEducation(education({ status: 'studying' }), context);

    expect(byType(relations, EDUCATION_STATUS_PROPERTY)).toHaveLength(0);
  });

  // Same reason a job title is typed: an untyped degree never turns up in the
  // scoped search that would stop the next person creating a second one.
  it('types the education record and the enrolment', () => {
    const { relations } = stageEducation(education(), context);

    const record = oneOf(relations, EDUCATION_PROPERTY);
    const degree = oneOf(relations, DEGREE_PROPERTY);
    const types = byType(relations, SystemIds.TYPES_PROPERTY);

    expect(types.find(t => t.toEntity.id === EDUCATION_RECORD_TYPE)?.fromEntity.id).toBe(record.entityId);
    expect(types.find(t => t.toEntity.id === DEGREE_INFORMATION_TYPE)?.fromEntity.id).toBe(degree.entityId);
  });

  // Decimal, so it sorts and filters as a number rather than as the string
  // somebody would otherwise type into the description.
  it('writes a grade on the enrolment as a decimal', () => {
    const { values, relations } = stageEducation(education({ grade: '3.8' }), context);
    const degree = oneOf(relations, DEGREE_PROPERTY);

    const grade = values.find(value => value.property.id === GRADE_PROPERTY);
    expect(grade).toMatchObject({ entity: { id: degree.entityId }, value: '3.8' });
    expect(grade?.property.dataType).toBe('DECIMAL');
  });

  // A classification or a pass has nowhere to go under a numeric property, and
  // storing it as text there would break every reader that expects a number.
  it('leaves a grade that is not a number unwritten', () => {
    for (const grade of ['', '  ', 'First class honours', 'Pass']) {
      const { values } = stageEducation(education({ grade }), context);
      expect(values.find(value => value.property.id === GRADE_PROPERTY)).toBeUndefined();
    }
  });

  it('hangs skills off the enrolment, beside the dates', () => {
    const { relations } = stageEducation(education({ skills: [picked('stats', 'Statistics')] }), context);

    const degree = oneOf(relations, DEGREE_PROPERTY);
    expect(oneOf(relations, SKILLS_PROPERTY)).toMatchObject({
      fromEntity: { id: degree.entityId },
      toEntity: { id: 'stats' },
    });
  });

  it('names and types a degree the user typed rather than picked', () => {
    const { values, relations } = stageEducation(education({ degree: created('new-degree', 'MPhil') }), context);

    expect(values).toContainEqual(
      expect.objectContaining({ entity: { id: 'new-degree', name: null }, value: 'MPhil' })
    );
    expect(
      byType(relations, SystemIds.TYPES_PROPERTY).some(
        relation => relation.fromEntity.id === 'new-degree' && relation.toEntity.id === DEGREE_TYPE
      )
    ).toBe(true);
  });

  it('creates an Academic field others can then find', () => {
    const { values, relations } = stageEducation(
      education({ fields: [created('new-field', 'Computer Science')] }),
      context
    );

    expect(values).toContainEqual(
      expect.objectContaining({ entity: { id: 'new-field', name: null }, value: 'Computer Science' })
    );
    expect(byType(relations, SystemIds.TYPES_PROPERTY).map(r => r.toEntity.id)).toContain(
      SystemIds.ACADEMIC_FIELD_TYPE
    );
  });

  it('reuses an existing record when adding a second degree at the same school', () => {
    const { relations } = stageEducation(education({ existingStintId: 'record-1' }), context);

    expect(byType(relations, EDUCATION_PROPERTY)).toHaveLength(0);
    expect(oneOf(relations, DEGREE_PROPERTY).fromEntity.id).toBe('record-1');
  });
});

describe('row identity', () => {
  // Every row in one edit has to be distinct, or the store collapses two of them
  // and the position publishes with a level missing.
  it('gives every relation in a position its own id and entity', () => {
    const { relations } = stagePosition(
      position({ company: created('new-co', 'Fathom'), title: created('new-title', 'Staff Engineer') }),
      context
    );

    const ids = relations.map(relation => relation.id);
    const entityIds = relations.map(relation => relation.entityId);

    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(entityIds).size).toBe(entityIds.length);
  });

  it('gives every value in an education record its own id', () => {
    const { values } = stageEducation(
      education({ description: 'Thesis on market microstructure.', endDate: '2026-06-01Z' }),
      context
    );

    const ids = values.map(value => value.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
