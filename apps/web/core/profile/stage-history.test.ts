import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { describe, expect, it } from 'vitest';

import type { Relation } from '~/core/types';

import {
  ACADEMIC_FIELDS_PROPERTY,
  COMPANY_TYPE,
  DEGREE_PROPERTY,
  DESCRIPTION_PROPERTY,
  EDUCATION_PROPERTY,
  EDUCATION_STATUS_COMPLETED,
  EDUCATION_STATUS_PROPERTY,
  EMPLOYMENT_PROPERTY,
  EMPLOYMENT_STATUS_CURRENT,
  EMPLOYMENT_STATUS_FORMER,
  EMPLOYMENT_STATUS_PROPERTY,
  END_DATE_PROPERTY,
  JOB_TYPE,
  ROLES_PROPERTY,
  START_DATE_PROPERTY,
} from './history-ontology';
import { type EducationDraft, type PositionDraft, stageEducation, stagePosition } from './stage-history';

const context = { personEntityId: 'person-1', spaceId: 'space-1' };

const picked = (id: string, name: string) => ({ id, name, isNew: false });
const created = (id: string, name: string) => ({ id, name, isNew: true });

const position = (overrides: Partial<PositionDraft> = {}): PositionDraft => ({
  company: picked('coinbase', 'Coinbase'),
  title: picked('analyst', 'Data Analyst'),
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
        ['new-co', COMPANY_TYPE],
        ['new-title', JOB_TYPE],
      ])
    );
  });

  it('writes nothing extra for an entity that already existed', () => {
    const { relations } = stagePosition(position(), context);

    expect(byType(relations, SystemIds.TYPES_PROPERTY)).toHaveLength(0);
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
