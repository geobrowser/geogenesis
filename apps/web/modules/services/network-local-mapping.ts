import { Action, Entity, Space, Triple, Value } from '../types';

type NetworkNumberValue = { valueType: 'NUMBER'; numberValue: string };

type NetworkStringValue = { valueType: 'STRING'; stringValue: string };

type NetworkImageValue = { valueType: 'IMAGE'; stringValue: string };

// Right now we can end up with a null entityValue until we handle triple validation on the subgraph
type NetworkEntityValue = { valueType: 'ENTITY'; entityValue: { id: string; name: string | null } };

type NetworkValue = NetworkNumberValue | NetworkStringValue | NetworkEntityValue | NetworkImageValue;

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
    case 'IMAGE':
      return { type: 'image', id: networkTriple.valueId, value: networkTriple.stringValue };
    case 'NUMBER':
      return { type: 'number', id: networkTriple.valueId, value: networkTriple.numberValue };
    case 'ENTITY': {
      return {
        type: 'entity',
        id: networkTriple.entityValue.id,
        name: networkTriple.entityValue.name,
      };
    }
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

function networkTripleHasEmptyValue(networkTriple: NetworkTriple): boolean {
  switch (networkTriple.valueType) {
    case 'STRING':
      return !networkTriple.stringValue;
    case 'NUMBER':
      return !networkTriple.numberValue;
    case 'ENTITY':
      return !networkTriple.entityValue;
  }
}

function networkTripleHasEmptyAttribute(networkTriple: NetworkTriple): boolean {
  return !networkTriple.attribute || !networkTriple.attribute.id;
}

export function fromNetworkTriples(networkTriples: NetworkTriple[]): Triple[] {
  return networkTriples
    .map(networkTriple => {
      // There's an edge-case bug where the entityValue can be null even though it should be an object.
      // Right now we're not doing any triple validation, but once we do we will no longer be indexing
      // empty triples.
      if (networkTripleHasEmptyValue(networkTriple) || networkTripleHasEmptyAttribute(networkTriple)) {
        return null;
      }

      return {
        id: networkTriple.id,
        entityId: networkTriple.entity.id,
        entityName: networkTriple.entity.name,
        attributeId: networkTriple.attribute.id,
        attributeName: networkTriple.attribute.name,
        value: extractValue(networkTriple),
        space: networkTriple.space.id,
      };
    })
    .flatMap(triple => (triple ? [triple] : []));
}
