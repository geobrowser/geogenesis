/**
 * Value[]/Relation[] builders for a Bounty entity, shared by the create and
 * edit forms (both funnel into `usePublish().makeProposal`, which publishes
 * into the bounty's DAO space — editors on the FAST path).
 *
 * Value ids are deterministic (`createValueId`), so re-writing a property is
 * an upsert. Relation ids are not, so single-valued relations (difficulty,
 * status) are replaced by tombstoning the existing row and adding a new one,
 * and multi-valued relations (skills, maintainers) are diffed. The Types and
 * Creator relations are only ever written on create.
 */
import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { createEntityId, createValueId } from '~/core/id/create-id';
import type { DataType, Relation, Value } from '~/core/types';

import {
  DIFFICULTIES,
  type DifficultyKey,
  WORKFLOW_STATUSES,
  type WorkflowStatusKey,
  difficultyIdForKey,
  statusIdForKey,
} from './labels';
import {
  BOUNTY_BUDGET_PROPERTY_ID,
  BOUNTY_CREATOR_PROPERTY_ID,
  BOUNTY_DEADLINE_PROPERTY_ID,
  BOUNTY_DIFFICULTY_PROPERTY_ID,
  BOUNTY_MAINTAINER_PROPERTY_ID,
  BOUNTY_MAX_CONTRIBUTORS_PROPERTY_ID,
  BOUNTY_MAX_SUBMISSIONS_PER_PERSON_PROPERTY_ID,
  BOUNTY_SKILLS_PROPERTY_ID,
  BOUNTY_TASK_STATUS_PROPERTY_ID,
  BOUNTY_TYPE_ID,
} from './ontology';

export type EntityPick = { id: string; name: string | null };

export type BountyFields = {
  spaceId: string;
  name: string;
  /** Plain-text description (the canonical Description property). The markdown body is edited on the entity page. */
  description: string;
  budget: number | null;
  difficulty: DifficultyKey | null;
  status: WorkflowStatusKey;
  /** ISO datetime, or null for no deadline. */
  deadline: string | null;
  maxContributors: number | null;
  maxSubmissionsPerPerson: number | null;
  skills: EntityPick[];
  maintainers: EntityPick[];
};

type EntityRef = { id: string; name: string | null };

function buildValue(args: {
  entityRef: EntityRef;
  spaceId: string;
  propertyId: string;
  propertyName: string;
  dataType: DataType;
  value: string;
}): Value {
  return {
    id: createValueId({ entityId: args.entityRef.id, propertyId: args.propertyId, spaceId: args.spaceId }),
    entity: args.entityRef,
    property: { id: args.propertyId, name: args.propertyName, dataType: args.dataType },
    value: args.value,
    spaceId: args.spaceId,
    isLocal: true,
  };
}

/** An `isDeleted` Value becomes an unset op on publish. */
function buildUnsetValue(args: {
  entityRef: EntityRef;
  spaceId: string;
  propertyId: string;
  propertyName: string;
  dataType: DataType;
}): Value {
  return { ...buildValue({ ...args, value: '' }), isDeleted: true };
}

function buildRelation(args: {
  entityRef: EntityRef;
  spaceId: string;
  typeId: string;
  typeName: string;
  to: EntityPick;
}): Relation {
  return {
    id: createEntityId(),
    entityId: createEntityId(),
    spaceId: args.spaceId,
    renderableType: 'RELATION',
    fromEntity: args.entityRef,
    toEntity: { id: args.to.id, name: args.to.name, value: args.to.id },
    type: { id: args.typeId, name: args.typeName },
    isLocal: true,
  };
}

const NUMERIC_FIELDS: ReadonlyArray<{
  key: 'budget' | 'maxContributors' | 'maxSubmissionsPerPerson';
  id: string;
  name: string;
}> = [
  { key: 'budget', id: BOUNTY_BUDGET_PROPERTY_ID, name: 'Bounty Budget' },
  { key: 'maxContributors', id: BOUNTY_MAX_CONTRIBUTORS_PROPERTY_ID, name: 'Max Contributors' },
  {
    key: 'maxSubmissionsPerPerson',
    id: BOUNTY_MAX_SUBMISSIONS_PER_PERSON_PROPERTY_ID,
    name: 'Max Submissions Per Person',
  },
];

/** Values shared by create and update: name, description, numeric fields, deadline. Empty ⇒ unset. */
function buildScalarValues(entityRef: EntityRef, fields: BountyFields): Value[] {
  const { spaceId } = fields;
  const values: Value[] = [
    buildValue({
      entityRef,
      spaceId,
      propertyId: SystemIds.NAME_PROPERTY,
      propertyName: 'Name',
      dataType: 'TEXT',
      value: fields.name,
    }),
  ];

  const descriptionArgs = {
    entityRef,
    spaceId,
    propertyId: SystemIds.DESCRIPTION_PROPERTY,
    propertyName: 'Description',
    dataType: 'TEXT' as const,
  };
  values.push(
    fields.description.trim()
      ? buildValue({ ...descriptionArgs, value: fields.description })
      : buildUnsetValue(descriptionArgs)
  );

  for (const field of NUMERIC_FIELDS) {
    const raw = fields[field.key];
    const args = { entityRef, spaceId, propertyId: field.id, propertyName: field.name, dataType: 'FLOAT' as const };
    values.push(
      raw != null && Number.isFinite(raw) ? buildValue({ ...args, value: String(raw) }) : buildUnsetValue(args)
    );
  }

  const deadlineArgs = {
    entityRef,
    spaceId,
    propertyId: BOUNTY_DEADLINE_PROPERTY_ID,
    propertyName: 'Submission Deadline',
    dataType: 'DATETIME' as const,
  };
  values.push(
    fields.deadline ? buildValue({ ...deadlineArgs, value: fields.deadline }) : buildUnsetValue(deadlineArgs)
  );

  return values;
}

function difficultyPick(key: DifficultyKey): EntityPick {
  return { id: difficultyIdForKey(key), name: DIFFICULTIES.find(d => d.key === key)!.label };
}

function statusPick(key: WorkflowStatusKey): EntityPick {
  return { id: statusIdForKey(key), name: WORKFLOW_STATUSES.find(s => s.key === key)!.label };
}

/** Mints a new Bounty: scalar values + Types/Difficulty/Status/Skills/Maintainers/Creator relations. */
export function buildCreateBountyOps(
  fields: BountyFields,
  creator: EntityPick | null
): { entityId: string; values: Value[]; relations: Relation[] } {
  const entityId = createEntityId();
  const entityRef: EntityRef = { id: entityId, name: fields.name };
  const { spaceId } = fields;

  const values = buildScalarValues(entityRef, fields);
  const relations: Relation[] = [
    buildRelation({
      entityRef,
      spaceId,
      typeId: SystemIds.TYPES_PROPERTY,
      typeName: 'Types',
      to: { id: BOUNTY_TYPE_ID, name: 'Bounty' },
    }),
    buildRelation({
      entityRef,
      spaceId,
      typeId: BOUNTY_TASK_STATUS_PROPERTY_ID,
      typeName: 'Workflow Status',
      to: statusPick(fields.status),
    }),
  ];

  if (fields.difficulty) {
    relations.push(
      buildRelation({
        entityRef,
        spaceId,
        typeId: BOUNTY_DIFFICULTY_PROPERTY_ID,
        typeName: 'Difficulty',
        to: difficultyPick(fields.difficulty),
      })
    );
  }
  for (const skill of fields.skills) {
    relations.push(
      buildRelation({ entityRef, spaceId, typeId: BOUNTY_SKILLS_PROPERTY_ID, typeName: 'Skills', to: skill })
    );
  }
  for (const person of fields.maintainers) {
    relations.push(
      buildRelation({ entityRef, spaceId, typeId: BOUNTY_MAINTAINER_PROPERTY_ID, typeName: 'Maintainer', to: person })
    );
  }
  if (creator) {
    relations.push(
      buildRelation({ entityRef, spaceId, typeId: BOUNTY_CREATOR_PROPERTY_ID, typeName: 'Creator', to: creator })
    );
  }

  return { entityId, values, relations };
}
