import { Triple, Value } from '~/core/types';

import { SubstreamTriple } from '../schema';

export function extractValue(networkTriple: SubstreamTriple): Value {
  switch (networkTriple.valueType) {
    case 'TEXT':
      return { type: 'TEXT', value: networkTriple.textValue };
    case 'CHECKBOX':
      return { type: 'CHECKBOX', value: networkTriple.booleanValue ? '1' : '0' };
    case 'TIME':
      return { type: 'TIME', value: networkTriple.textValue };
    case 'URL':
      return { type: 'URL', value: networkTriple.textValue };
    case 'NUMBER':
      return { type: 'NUMBER', value: networkTriple.textValue };
    case 'POINT':
      return { type: 'TEXT', value: networkTriple.textValue };
  }
}

export function TripleDto(triple: SubstreamTriple): Triple {
  const entity = triple.version;
  const attribute = triple.attributeVersion;

  return {
    entityId: entity.entityId,
    entityName: entity.name,
    attributeId: attribute.entityId,
    attributeName: attribute.name,
    value: extractValue(triple),
    space: triple.spaceId,
  };
}
