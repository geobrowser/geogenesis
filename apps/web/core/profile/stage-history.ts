import { Position, SystemIds } from '@geoprotocol/geo-sdk/lite';

import { ID } from '~/core/id';
import type { Relation, Value } from '~/core/types';

import {
  ACADEMIC_FIELDS_PROPERTY,
  ACADEMIC_FIELD_TYPE,
  COMPANY_TYPE,
  DEGREE_PROPERTY,
  DESCRIPTION_PROPERTY,
  EDUCATION_PROPERTY,
  EDUCATION_STATUS_OPTION,
  EDUCATION_STATUS_PROPERTY,
  EMPLOYMENT_PROPERTY,
  EMPLOYMENT_STATUS_OPTION,
  EMPLOYMENT_STATUS_PROPERTY,
  END_DATE_PROPERTY,
  type EducationStatus,
  type EmploymentStatus,
  JOB_TYPE,
  ROLES_PROPERTY,
  START_DATE_PROPERTY,
} from './history-ontology';

/** An entity the sheet picked, or one it is about to mint. */
export type EntityChoice = { id: string; name: string | null; isNew: boolean };

export type PositionDraft = {
  company: EntityChoice;
  title: EntityChoice;
  startDate: string | null;
  endDate: string | null;
  status: EmploymentStatus;
  description: string;
  /**
   * Set when adding a second role at a company already on the profile. The
   * Employment edge and its stint already exist, so this write is one relation,
   * one entity and its dates rather than the full six rows.
   */
  existingStintId?: string;
};

export type EducationDraft = {
  school: EntityChoice;
  degree: EntityChoice;
  fields: EntityChoice[];
  startDate: string | null;
  endDate: string | null;
  status: EducationStatus;
  description: string;
  existingStintId?: string;
};

export type StagedRows = { values: Value[]; relations: Relation[] };

type Context = { personEntityId: string; spaceId: string };

function relationRow(params: {
  spaceId: string;
  typeId: string;
  typeName: string;
  fromId: string;
  fromName?: string | null;
  to: { id: string; name: string | null };
  /** The relation's own entity — the level the next tier hangs off. */
  entityId?: string;
}): Relation {
  return {
    id: ID.createEntityId(),
    entityId: params.entityId ?? ID.createEntityId(),
    spaceId: params.spaceId,
    position: Position.generate(),
    renderableType: 'RELATION',
    verified: false,
    type: { id: params.typeId, name: params.typeName },
    fromEntity: { id: params.fromId, name: params.fromName ?? null },
    toEntity: { id: params.to.id, name: params.to.name, value: params.to.id },
  };
}

function valueRow(params: {
  spaceId: string;
  entityId: string;
  propertyId: string;
  propertyName: string;
  dataType: 'TEXT' | 'DATE';
  value: string;
}): Value {
  return {
    id: ID.createValueId({ entityId: params.entityId, propertyId: params.propertyId, spaceId: params.spaceId }),
    entity: { id: params.entityId, name: null },
    property: {
      id: params.propertyId,
      name: params.propertyName,
      dataType: params.dataType,
      renderableType: params.dataType === 'DATE' ? 'DATE' : 'TEXT',
    },
    spaceId: params.spaceId,
    value: params.value,
  };
}

/**
 * A company, job title, school or field the user typed rather than picked.
 *
 * `SelectEntity` mints the id and hands it back; nothing exists behind it until
 * someone writes a name. Without this the relation points at an entity with no
 * name, which renders as a blank row that cannot be searched for afterwards.
 */
function newEntityRows(choice: EntityChoice, spaceId: string, typeId?: string): StagedRows {
  if (!choice.isNew || !choice.name) return { values: [], relations: [] };

  const values = [
    valueRow({
      spaceId,
      entityId: choice.id,
      propertyId: SystemIds.NAME_PROPERTY,
      propertyName: 'Name',
      dataType: 'TEXT',
      value: choice.name,
    }),
  ];

  // Typed where the type is known and verified. An untyped entity still works as
  // a target, but never turns up in the scoped search that would stop the next
  // person creating a second one just like it.
  const relations = typeId
    ? [
        relationRow({
          spaceId,
          typeId: SystemIds.TYPES_PROPERTY,
          typeName: 'Types',
          fromId: choice.id,
          fromName: choice.name,
          to: { id: typeId, name: null },
        }),
      ]
    : [];

  return { values, relations };
}

function datesAndDescription(params: {
  spaceId: string;
  tenureId: string;
  startDate: string | null;
  endDate: string | null;
  description: string;
}): Value[] {
  const values: Value[] = [];
  const { spaceId, tenureId } = params;

  if (params.startDate) {
    values.push(
      valueRow({
        spaceId,
        entityId: tenureId,
        propertyId: START_DATE_PROPERTY,
        propertyName: 'Start date',
        dataType: 'DATE',
        value: params.startDate,
      })
    );
  }

  if (params.endDate) {
    values.push(
      valueRow({
        spaceId,
        entityId: tenureId,
        propertyId: END_DATE_PROPERTY,
        propertyName: 'End date',
        dataType: 'DATE',
        value: params.endDate,
      })
    );
  }

  const description = params.description.trim();
  if (description !== '') {
    values.push(
      valueRow({
        spaceId,
        entityId: tenureId,
        propertyId: DESCRIPTION_PROPERTY,
        propertyName: 'Description',
        dataType: 'TEXT',
        value: description,
      })
    );
  }

  return values;
}

function merge(...parts: StagedRows[]): StagedRows {
  return {
    values: parts.flatMap(part => part.values),
    relations: parts.flatMap(part => part.relations),
  };
}

/**
 * One position, as one edit.
 *
 * Six rows for a first job at a company — the Employment edge, the Roles edge,
 * the status edge, and the tenure's dates — and roughly half that for a
 * promotion, where the company edge already exists. They publish together or not
 * at all: a stint with no role under it renders as a company you are somehow
 * attached to with nothing to say about it, which is worse than no entry.
 */
export function stagePosition(draft: PositionDraft, { personEntityId, spaceId }: Context): StagedRows {
  const company = newEntityRows(draft.company, spaceId, COMPANY_TYPE);
  const title = newEntityRows(draft.title, spaceId, JOB_TYPE);

  let stintId = draft.existingStintId;
  const employment: StagedRows = { values: [], relations: [] };

  if (!stintId) {
    stintId = ID.createEntityId();
    employment.relations.push(
      relationRow({
        spaceId,
        typeId: EMPLOYMENT_PROPERTY,
        typeName: 'Employment',
        fromId: personEntityId,
        to: draft.company,
        entityId: stintId,
      })
    );
  }

  const tenureId = ID.createEntityId();
  const roles = relationRow({
    spaceId,
    typeId: ROLES_PROPERTY,
    typeName: 'Roles',
    fromId: stintId,
    to: draft.title,
    entityId: tenureId,
  });

  const status = relationRow({
    spaceId,
    typeId: EMPLOYMENT_STATUS_PROPERTY,
    typeName: 'Employment status',
    fromId: tenureId,
    to: { id: EMPLOYMENT_STATUS_OPTION[draft.status], name: draft.status === 'current' ? 'Current' : 'Former' },
  });

  return merge(company, title, employment, {
    relations: [roles, status],
    values: datesAndDescription({
      spaceId,
      tenureId,
      startDate: draft.startDate,
      endDate: draft.endDate,
      description: draft.description,
    }),
  });
}

/**
 * One education record, as one edit. A level heavier than a position, because
 * `Academic fields` is a relation and can repeat for a joint honours degree.
 */
export function stageEducation(draft: EducationDraft, { personEntityId, spaceId }: Context): StagedRows {
  const school = newEntityRows(draft.school, spaceId);
  const degree = newEntityRows(draft.degree, spaceId);

  let recordId = draft.existingStintId;
  const education: StagedRows = { values: [], relations: [] };

  if (!recordId) {
    recordId = ID.createEntityId();
    education.relations.push(
      relationRow({
        spaceId,
        typeId: EDUCATION_PROPERTY,
        typeName: 'Education',
        fromId: personEntityId,
        to: draft.school,
        entityId: recordId,
      })
    );
  }

  const enrolmentId = ID.createEntityId();
  const degreeEdge = relationRow({
    spaceId,
    typeId: DEGREE_PROPERTY,
    typeName: 'Degree',
    fromId: recordId,
    to: draft.degree,
    entityId: enrolmentId,
  });

  const fieldRows = draft.fields.map(field => newEntityRows(field, spaceId, ACADEMIC_FIELD_TYPE));

  const fieldEdges = draft.fields.map(field =>
    relationRow({
      spaceId,
      typeId: ACADEMIC_FIELDS_PROPERTY,
      typeName: 'Academic fields',
      fromId: enrolmentId,
      to: field,
    })
  );

  // Still studying writes no status at all. The graph has Completed and
  // Incomplete and nothing for in-progress, and inventing one would be worse
  // than leaving it unsaid — the empty End date is what carries the meaning.
  const statusOptionId = EDUCATION_STATUS_OPTION[draft.status];
  const statusEdge = statusOptionId
    ? [
        relationRow({
          spaceId,
          typeId: EDUCATION_STATUS_PROPERTY,
          typeName: 'Education status',
          fromId: enrolmentId,
          to: { id: statusOptionId, name: draft.status === 'completed' ? 'Completed' : 'Incomplete' },
        }),
      ]
    : [];

  return merge(school, degree, ...fieldRows, education, {
    relations: [degreeEdge, ...fieldEdges, ...statusEdge],
    values: datesAndDescription({
      spaceId,
      tenureId: enrolmentId,
      startDate: draft.startDate,
      endDate: draft.endDate,
      description: draft.description,
    }),
  });
}
