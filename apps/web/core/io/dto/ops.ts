import { AppOp, Value } from '~/core/types';

import { SubstreamOp } from '../schema';

export function extractValue(networkTriple: SubstreamOp): Value {
  switch (networkTriple.valueType) {
    case 'TEXT':
      return { type: 'TEXT', value: networkTriple.textValue };
    case 'ENTITY': {
      return {
        type: 'ENTITY',
        value: networkTriple.entityValue.id,
        name: networkTriple.entityValue.name,
      };
    }
    case 'TIME':
      return { type: 'TIME', value: networkTriple.textValue };
    case 'URI':
      return { type: 'URI', value: networkTriple.textValue };
  }
}

export function OpDto(op: SubstreamOp): AppOp {
  return {
    id: op.id,
    type: op.type,
    attributeId: op.attributeId,
    attributeName: op.attribute?.name ?? null,
    value: extractValue(op),
    entityId: op.entityId,
    entityName: op.entity?.name ?? null,
  };
}
