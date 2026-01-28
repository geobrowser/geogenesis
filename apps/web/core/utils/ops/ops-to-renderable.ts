import { Op } from '@geoprotocol/geo-sdk';

import { ID } from '~/core/id';
import { extractValueString } from '~/core/utils/value';
import { Relation, Value } from '~/core/v2.types';

type Options = {
  spaceId: string;
  entityName?: string | null;
};

/** Converts GRC-20 operations to Value and Relation arrays. */
export function convertOpsToRenderables(ops: Op[], options: Options): { values: Value[]; relations: Relation[] } {
  const { spaceId, entityName } = options;
  const values: Value[] = [];
  const relations: Relation[] = [];

  for (const op of ops) {
    if (op.type === 'createEntity') {
      const entityValues = op.values || [];
      for (const pv of entityValues) {
        values.push({
          id: ID.createValueId({
            entityId: String(op.id),
            propertyId: String(pv.property),
            spaceId,
          }),
          entity: {
            id: String(op.id),
            name: entityName ?? null,
          },
          property: {
            id: String(pv.property),
            name: null,
            dataType: 'TEXT',
          },
          spaceId,
          value: extractValueString(pv.value),
          options: null,
        });
      }
    } else if (op.type === 'updateEntity') {
      const entityValues = op.set || [];
      for (const pv of entityValues) {
        values.push({
          id: ID.createValueId({
            entityId: String(op.id),
            propertyId: String(pv.property),
            spaceId,
          }),
          entity: {
            id: String(op.id),
            name: entityName ?? null,
          },
          property: {
            id: String(pv.property),
            name: null,
            dataType: 'TEXT',
          },
          spaceId,
          value: extractValueString(pv.value),
          options: null,
        });
      }
    } else if (op.type === 'createRelation') {
      relations.push({
        id: String(op.id),
        entityId: op.entity ? String(op.entity) : ID.createEntityId(),
        spaceId,
        renderableType: 'RELATION',
        type: {
          id: String(op.relationType),
          name: null,
        },
        fromEntity: {
          id: String(op.from),
          name: entityName ?? null,
        },
        toEntity: {
          id: String(op.to),
          name: null,
          value: String(op.to),
        },
        position: op.position ?? undefined,
        verified: undefined,
        toSpaceId: op.toSpace ? String(op.toSpace) : undefined,
      });
    }
  }

  return { values, relations };
}
