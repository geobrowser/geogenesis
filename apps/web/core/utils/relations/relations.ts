import { createRelationship } from '@geogenesis/sdk';

import { EntityId } from '~/core/io/schema';
import { Triple } from '~/core/types';

interface OpsToTriplesArgs {
  relationId?: EntityId;
  toId: string;
  toIdName: string | null;
  fromId: string;
  spaceId: string;
  typeOfId: string;
  typeOfName: string | null;
}

export function createRelationshipTriples(args: OpsToTriplesArgs): Triple[] {
  const { fromId, toId, toIdName, spaceId, typeOfId } = args;

  const [typeOp, fromOp, toOp, indexOp, typeOfOp] = createRelationship({
    fromId,
    toId,
    relationTypeId: typeOfId,
  });

  const entityId = args.relationId ?? typeOp.triple.entity;

  return [
    {
      space: spaceId,
      attributeId: typeOp.triple.attribute,
      attributeName: 'Types',
      entityId: entityId,
      entityName: null,
      value: {
        type: 'ENTITY',
        name: 'Relation',
        value: typeOp.triple.value.value,
      },
    },
    {
      space: spaceId,
      attributeId: fromOp.triple.attribute,
      attributeName: 'From Entity',
      entityId: entityId,
      entityName: null,
      value: {
        type: 'ENTITY',
        name: null,
        value: fromOp.triple.value.value,
      },
    },
    {
      space: spaceId,
      attributeId: toOp.triple.attribute,
      attributeName: 'To Entity',
      entityId: entityId,
      entityName: null,
      value: {
        type: 'ENTITY',
        name: toIdName,
        value: toOp.triple.value.value,
      },
    },
    {
      space: spaceId,
      attributeId: indexOp.triple.attribute,
      attributeName: 'Index',
      entityId: entityId,
      entityName: null,
      value: {
        type: 'TEXT',
        value: indexOp.triple.value.value,
      },
    },
    {
      space: spaceId,
      attributeId: typeOfOp.triple.attribute,
      attributeName: 'Relation type',
      entityId: entityId,
      entityName: null,
      value: {
        type: 'ENTITY',
        name: args.typeOfName,
        value: typeOfOp.triple.value.value,
      },
    },
  ];
}
