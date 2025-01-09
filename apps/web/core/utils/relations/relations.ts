import { GraphUrl, Relation, SYSTEM_IDS } from '@geogenesis/sdk';

import { EntityId } from '~/core/io/schema';
import { Triple } from '~/core/types';

interface OpsToTriplesArgs {
  relationId?: EntityId;
  toId: string;
  fromId: string;
  spaceId: string;
  typeOfId: string;
}

export function createRelationshipTriples(args: OpsToTriplesArgs): Triple[] {
  const { fromId, toId, spaceId, typeOfId } = args;

  const { relation } = Relation.make({
    fromId,
    toId,
    relationTypeId: typeOfId,
  });

  const entityId = args.relationId ?? relation.id;

  return [
    {
      space: spaceId,
      attributeId: SYSTEM_IDS.TYPES_ATTRIBUTE,
      attributeName: 'Types',
      entityId: entityId,
      entityName: null,
      value: {
        type: 'URL',
        value: GraphUrl.fromEntityId(SYSTEM_IDS.RELATION_TYPE),
      },
    },
    {
      space: spaceId,
      attributeId: SYSTEM_IDS.RELATION_FROM_ATTRIBUTE,
      attributeName: 'From Entity',
      entityId: entityId,
      entityName: null,
      value: {
        type: 'URL',
        value: GraphUrl.fromEntityId(relation.fromEntity),
      },
    },
    {
      space: spaceId,
      attributeId: SYSTEM_IDS.RELATION_TO_ATTRIBUTE,
      attributeName: 'To Entity',
      entityId: entityId,
      entityName: null,
      value: {
        type: 'URL',
        value: GraphUrl.fromEntityId(relation.toEntity),
      },
    },
    {
      space: spaceId,
      attributeId: SYSTEM_IDS.RELATION_INDEX,
      attributeName: 'Index',
      entityId: entityId,
      entityName: null,
      value: {
        type: 'TEXT',
        value: relation.index,
      },
    },
    {
      space: spaceId,
      attributeId: SYSTEM_IDS.RELATION_TYPE_ATTRIBUTE,
      attributeName: 'Relation type',
      entityId: entityId,
      entityName: null,
      value: {
        type: 'URL',
        value: GraphUrl.fromEntityId(relation.type),
      },
    },
  ];
}
