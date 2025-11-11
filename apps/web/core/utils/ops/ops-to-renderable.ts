import { Id, Op } from '@graphprotocol/grc-20';

import { ID } from '~/core/id';
import { Relation, Value, ValueOptions } from '~/core/v2.types';

type Options = {
  spaceId: string;
  entityName?: string | null;
};

/**
 * Converts stored GRC-20 operations to Value and Relation arrays.
 */
export function convertOpsToRenderables(ops: Op[], options: Options): { values: Value[]; relations: Relation[] } {
  const { spaceId, entityName } = options;
  const values: Value[] = [];
  const relations: Relation[] = [];

  for (const op of ops) {
    if (op.type === 'UPDATE_ENTITY' && op.entity) {
      const entityValues = op.entity.values || [];

      for (const val of entityValues) {
        values.push({
          id: ID.createValueId({
            entityId: Id(op.entity.id),
            propertyId: Id(val.property),
            spaceId,
          }),
          entity: {
            id: Id(op.entity.id),
            name: entityName ?? null,
          },
          property: {
            id: Id(val.property),
            name: null,
            dataType: 'TEXT',
          },
          spaceId,
          value: val.value,
          options: val.options ? (val.options as ValueOptions) : null,
        });
      }
    } else if (op.type === 'CREATE_RELATION' && op.relation) {
      relations.push({
        id: ID.createEntityId(),
        entityId: ID.createEntityId(),
        spaceId,
        renderableType: 'RELATION',
        type: {
          id: Id(op.relation.type),
          name: null,
        },
        fromEntity: {
          id: Id(op.relation.fromEntity),
          name: entityName ?? null,
        },
        toEntity: {
          id: Id(op.relation.toEntity),
          name: null,
          value: Id(op.relation.toEntity),
        },
        position: op.relation.position ?? undefined,
        verified: op.relation.verified ?? undefined,
        toSpaceId: op.relation.toSpace ? Id(op.relation.toSpace) : undefined,
      });
    }
  }

  return { values, relations };
}
