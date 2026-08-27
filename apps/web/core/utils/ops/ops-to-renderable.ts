import { Op } from '@geoprotocol/geo-sdk/lite';

import { ID } from '~/core/id';
import { Relation, Value } from '~/core/types';
import { toHexId } from '~/core/utils/hex-id';
import { extractValueString } from '~/core/utils/value';

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
            entityId: toHexId(op.id),
            propertyId: toHexId(pv.property),
            spaceId,
          }),
          entity: {
            id: toHexId(op.id),
            name: entityName ?? null,
          },
          property: {
            id: toHexId(pv.property),
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
            entityId: toHexId(op.id),
            propertyId: toHexId(pv.property),
            spaceId,
          }),
          entity: {
            id: toHexId(op.id),
            name: entityName ?? null,
          },
          property: {
            id: toHexId(pv.property),
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
        id: toHexId(op.id),
        entityId: op.entity ? toHexId(op.entity) : ID.createEntityId(),
        spaceId,
        renderableType: 'RELATION',
        type: {
          id: toHexId(op.relationType),
          name: null,
        },
        fromEntity: {
          id: toHexId(op.from),
          name: entityName ?? null,
        },
        toEntity: {
          id: toHexId(op.to),
          name: null,
          value: toHexId(op.to),
        },
        position: op.position ?? undefined,
        verified: undefined,
        toSpaceId: op.toSpace ? toHexId(op.toSpace) : undefined,
      });
    }
  }

  return { values, relations };
}
