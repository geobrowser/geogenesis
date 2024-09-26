import { SYSTEM_IDS, createRelationship } from '@geobrowser/gdk';

import { Triple } from '~/core/types';

export function indexValue(triple?: Triple): string | null {
  if (!triple) {
    return null;
  }

  const isIndexTriple = triple.attributeId === SYSTEM_IDS.RELATION_INDEX && triple.value.type === 'TEXT';

  return isIndexTriple ? triple.value.value : null;
}

export function fromValue(triple?: Triple): string | null {
  if (!triple) {
    return null;
  }

  const isCollectionIdValue =
    triple.attributeId === SYSTEM_IDS.RELATION_FROM_ATTRIBUTE && triple.value.type === 'ENTITY';

  return isCollectionIdValue ? triple.value.value : null;
}

export function toValue(triple?: Triple): string | null {
  if (!triple) {
    return null;
  }

  const isCollectionIdValue = triple.attributeId === SYSTEM_IDS.RELATION_TO_ATTRIBUTE && triple.value.type === 'ENTITY';

  return isCollectionIdValue ? triple.value.value : null;
}

interface OpsToTriplesArgs {
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

  return [
    {
      space: spaceId,
      attributeId: typeOp.triple.attribute,
      attributeName: 'Types',
      entityId: typeOp.triple.entity,
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
      entityId: fromOp.triple.entity,
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
      entityId: toOp.triple.entity,
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
      entityId: indexOp.triple.entity,
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
      entityId: typeOfOp.triple.entity,
      entityName: null,
      value: {
        type: 'ENTITY',
        name: args.typeOfName,
        value: typeOfOp.triple.value.value,
      },
    },
  ];
}
