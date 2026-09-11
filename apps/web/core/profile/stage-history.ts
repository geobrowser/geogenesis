import { Position, SystemIds } from '@geoprotocol/geo-sdk/lite';

import { ID } from '~/core/id';
import type { Relation, Value } from '~/core/types';

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
  EMPLOYMENT_TYPE_PROPERTY,
  END_DATE_PROPERTY,
  type EducationStatus,
  type EmploymentStatus,
  JOB_TYPE,
  ROLES_PROPERTY,
  ROLE_INFORMATION_TYPE,
  SKILLS_PROPERTY,
  SKILL_TYPE,
  START_DATE_PROPERTY,
} from './history-ontology';

/** An entity the sheet picked, or one it is about to mint. */
export type EntityChoice = { id: string; name: string | null; isNew: boolean };

export type PositionDraft = {
  company: EntityChoice;
  title: EntityChoice;
  /** Full-time, Contract, and so on. Optional — LinkedIn leaves it unset too. */
  employmentType: { id: string; name: string } | null;
  /** Repeats, so it is a relation rather than a value. */
  skills: EntityChoice[];
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
export function stagePosition(
  draft: PositionDraft,
  { personEntityId, spaceId }: Context,
  /**
   * The stint to mint when this is a first role at the company. Supplied by the
   * caller so two roles added at the same new employer in one sitting share an
   * Employment edge rather than each opening their own.
   */
  newStintId: string = ID.createEntityId()
): StagedRows {
  const company = newEntityRows(draft.company, spaceId, EMPLOYER_TYPE);
  const title = newEntityRows(draft.title, spaceId, JOB_TYPE);

  let stintId = draft.existingStintId;
  const employment: StagedRows = { values: [], relations: [] };

  if (!stintId) {
    stintId = newStintId;
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

  // The tenure says what it is. `Roles` declares `Role information` as its
  // relation entity type, and an untyped tenure is reachable only by walking in
  // from the person holding it — which is exactly how the dates on it stayed
  // invisible to everything else.
  const tenureType = relationRow({
    spaceId,
    typeId: SystemIds.TYPES_PROPERTY,
    typeName: 'Types',
    fromId: tenureId,
    to: { id: ROLE_INFORMATION_TYPE, name: 'Role information' },
  });

  const status = relationRow({
    spaceId,
    typeId: EMPLOYMENT_STATUS_PROPERTY,
    typeName: 'Employment status',
    fromId: tenureId,
    to: { id: EMPLOYMENT_STATUS_OPTION[draft.status], name: draft.status === 'current' ? 'Current' : 'Former' },
  });

  // Both hang off the tenure, beside the dates: a promotion can be full-time
  // where the role before it was an internship, and the skills differ with it.
  const employmentType = draft.employmentType
    ? [
        relationRow({
          spaceId,
          typeId: EMPLOYMENT_TYPE_PROPERTY,
          typeName: 'Employment type',
          fromId: tenureId,
          to: draft.employmentType,
        }),
      ]
    : [];

  const skillRows = draft.skills.map(skill => newEntityRows(skill, spaceId, SKILL_TYPE));
  const skillEdges = draft.skills.map(skill =>
    relationRow({
      spaceId,
      typeId: SKILLS_PROPERTY,
      typeName: 'Skills',
      fromId: tenureId,
      to: skill,
    })
  );

  return merge(company, title, ...skillRows, employment, {
    relations: [roles, tenureType, status, ...employmentType, ...skillEdges],
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
export function stageEducation(
  draft: EducationDraft,
  { personEntityId, spaceId }: Context,
  newStintId: string = ID.createEntityId()
): StagedRows {
  const school = newEntityRows(draft.school, spaceId);
  const degree = newEntityRows(draft.degree, spaceId);

  let recordId = draft.existingStintId;
  const education: StagedRows = { values: [], relations: [] };

  if (!recordId) {
    recordId = newStintId;
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

/**
 * A saved row back into the sheet that wrote it.
 *
 * Editing reuses the add sheet, so a row has to be able to answer the same
 * questions it was filled in from. Everything here was picked from the graph, so
 * nothing is `isNew` — the entities all exist already.
 */
export function positionDraftFromEntry(
  organization: { id: string; name: string | null },
  entry: {
    subject: { id: string; name: string | null };
    employmentType: { id: string; name: string | null } | null;
    skills: { id: string; name: string | null }[];
    startDate: string | null;
    endDate: string | null;
    status: EmploymentStatus | null;
    description: string | null;
  }
): PositionDraft {
  return {
    company: { id: organization.id, name: organization.name, isNew: false },
    title: { id: entry.subject.id, name: entry.subject.name, isNew: false },
    // Kept as it stands even when it is not one of the eight the dropdown offers.
    // The select shows nothing for an id it does not know, but the draft still
    // carries it, so editing the dates of an older record does not quietly drop
    // an employment type somebody else recorded.
    employmentType: entry.employmentType
      ? { id: entry.employmentType.id, name: entry.employmentType.name ?? '' }
      : null,
    skills: entry.skills.map(skill => ({ id: skill.id, name: skill.name, isNew: false })),
    startDate: entry.startDate,
    endDate: entry.endDate,
    // An older row may carry no status at all. An open end date is what said
    // "current" before the status property existed, so it still does here.
    status: entry.status ?? (entry.endDate === null ? 'current' : 'former'),
    description: entry.description ?? '',
  };
}

export function educationDraftFromEntry(
  organization: { id: string; name: string | null },
  entry: {
    subject: { id: string; name: string | null };
    fields: { id: string; name: string | null }[];
    startDate: string | null;
    endDate: string | null;
    status: EducationStatus | null;
    description: string | null;
  }
): EducationDraft {
  return {
    school: { id: organization.id, name: organization.name, isNew: false },
    degree: { id: entry.subject.id, name: entry.subject.name, isNew: false },
    // The legacy field-of-study text is shown with no id behind it. There is no
    // entity to relate to, so it cannot come back into a draft — it stays where
    // it is, on the stint, until someone picks a real Academic field.
    fields: entry.fields.filter(field => field.id !== '').map(field => ({ ...field, isNew: false })),
    startDate: entry.startDate,
    endDate: entry.endDate,
    status: entry.status ?? (entry.endDate === null ? 'studying' : 'completed'),
    description: entry.description ?? '',
  };
}
