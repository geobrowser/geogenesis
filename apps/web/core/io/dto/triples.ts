import { Value } from '~/core/types';

import { SubstreamTriple } from '../schema';

export function extractValue(networkTriple: SubstreamTriple): Value {
  switch (networkTriple.valueType) {
    case 'TEXT':
      return { type: 'TEXT', value: networkTriple.textValue };
    case 'ENTITY': {
      const entityValue = networkTriple.entityValue.currentVersion.version;
      return {
        type: 'ENTITY',
        value: entityValue.id,
        name: entityValue.name,
      };
    }
    case 'TIME':
      return { type: 'TIME', value: networkTriple.textValue };
    case 'URI':
      return { type: 'URI', value: networkTriple.textValue };
  }
}

export function TripleDto(triple: SubstreamTriple) {
  const entity = triple.entity.currentVersion.version;
  const attribute = triple.attribute.currentVersion.version;

  return {
    entityId: entity.id,
    entityName: entity.name,
    attributeId: attribute.id,
    attributeName: attribute.name,
    value: extractValue(triple),
    space: triple.space.id,
  };
}
