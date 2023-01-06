import { Action, Entity, Space, Triple, Value } from '../types';

type NetworkNumberValue = { valueType: 'NUMBER'; numberValue: string };

type NetworkStringValue = { valueType: 'STRING'; stringValue: string };

type NetworkEntityValue = { valueType: 'ENTITY'; entityValue: { id: string; name: string | null } };

type NetworkValue = NetworkNumberValue | NetworkStringValue | NetworkEntityValue;

/**
 * Triple type returned by GraphQL
 */
export type NetworkTriple = NetworkValue & {
  id: string;
  entity: { id: string; name: string | null };
  attribute: { id: string; name: string | null };
  valueId: string;
  isProtected: boolean;
  space: Space;
};

export type NetworkEntity = Entity & {
  entityOf: ({ space: Space } & NetworkTriple)[];
};

export function extractValue(networkTriple: NetworkTriple): Value {
  switch (networkTriple.valueType) {
    case 'STRING':
      return { type: 'string', id: networkTriple.valueId, value: networkTriple.stringValue };
    case 'NUMBER':
      return { type: 'number', id: networkTriple.valueId, value: networkTriple.numberValue };
    case 'ENTITY':
      return { type: 'entity', id: networkTriple.entityValue.id, name: networkTriple.entityValue.name };
  }
}

export function getActionFromChangeStatus(action: Action) {
  switch (action.type) {
    case 'createTriple':
    case 'deleteTriple':
      return [action];

    case 'editTriple':
      return [action.before, action.after];
  }
}

export function fromNetworkTriple(networkTriple: NetworkTriple): Triple {
  return {
    id: networkTriple.id,
    entityId: networkTriple.entity.id,
    entityName: networkTriple.entity.name,
    attributeId: networkTriple.attribute.id,
    attributeName: networkTriple.attribute.name,
    value: extractValue(networkTriple),
    space: networkTriple.space.id,
  };
}
