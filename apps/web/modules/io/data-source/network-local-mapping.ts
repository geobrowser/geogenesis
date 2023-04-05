import { Action, Entity, OmitStrict, Space, Triple, Value, Version } from '~/modules/types';

type NetworkNumberValue = { valueType: 'NUMBER'; numberValue: string };

type NetworkStringValue = { valueType: 'STRING'; stringValue: string };

type NetworkImageValue = { valueType: 'IMAGE'; stringValue: string };

// Right now we can end up with a null entityValue until we handle triple validation on the subgraph
type NetworkEntityValue = { valueType: 'ENTITY'; entityValue: { id: string; name: string | null } };

type NetworkValue = NetworkNumberValue | NetworkStringValue | NetworkEntityValue | NetworkImageValue;

export type NetworkTriple = NetworkValue & {
  id: string;
  entity: { id: string; name: string | null };
  attribute: { id: string; name: string | null };
  valueId: string;
  isProtected: boolean;
  space: Space;
};

export type NetworkAction = OmitStrict<NetworkTriple, 'space' | 'isProtected'> &
  NetworkValue & {
    actionType: 'CREATE' | 'DELETE';
  };

export type NetworkEntity = Entity & {
  entityOf: ({ space: Space } & NetworkTriple)[];
};

export type NetworkVersion = OmitStrict<Version, 'createdBy'> & {
  actions: NetworkAction[];

  // The NetworkVersion does not have a name or avatar associated
  // with the createdBy field
  createdBy: {
    id: string;
  };
};

export function extractValue(networkTriple: NetworkTriple | NetworkAction): Value {
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

export function extractActionValue(networkAction: NetworkAction): Value {
  switch (networkAction.valueType) {
    case 'STRING':
      return { type: 'string', id: networkAction.valueId, value: networkAction.stringValue };
    case 'IMAGE':
      return { type: 'image', id: networkAction.valueId, value: networkAction.stringValue };
    case 'NUMBER':
      return { type: 'number', id: networkAction.valueId, value: networkAction.numberValue };
    case 'ENTITY': {
      return {
        type: 'entity',
        id: networkAction.entityValue?.id ?? null,
        name: networkAction.entityValue?.name ?? null,
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

function networkTripleHasEmptyValue(networkTriple: NetworkTriple | NetworkAction): boolean {
  switch (networkTriple.valueType) {
    case 'STRING':
      return !networkTriple.stringValue;
    case 'NUMBER':
      return !networkTriple.numberValue;
    case 'ENTITY':
      return !networkTriple.entityValue;
    case 'IMAGE':
      return !networkTriple.stringValue;
  }
}

function networkTripleHasEmptyAttribute(networkTriple: NetworkTriple | NetworkAction): boolean {
  return !networkTriple.attribute || !networkTriple.attribute.id;
}

export function fromNetworkTriples(networkTriples: NetworkTriple[]): Triple[] {
  return networkTriples
    .map(networkTriple => {
      // There's an edge-case bug where the value can be null even though it should be an object.
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

export function fromNetworkActions(networkActions: NetworkAction[], spaceId: string): Action[] {
  const newActions = networkActions
    .map(networkAction => {
      // There's an edge-case bug where the value can be null even though it should be an object.
      // Right now we're not doing any triple validation, but once we do we will no longer be indexing
      // empty triples.
      if (networkTripleHasEmptyValue(networkAction) || networkTripleHasEmptyAttribute(networkAction)) {
        return null;
      }

      const value = extractActionValue(networkAction);

      switch (networkAction.actionType) {
        case 'CREATE': {
          return {
            type: 'createTriple' as const,
            id: networkAction.id,
            entityId: networkAction.entity.id,
            entityName: networkAction.entity.name,
            attributeId: networkAction.attribute.id,
            attributeName: networkAction.attribute.name,
            value,
            space: spaceId,
          };
        }

        case 'DELETE': {
          return {
            type: 'deleteTriple' as const,
            id: networkAction.id,
            entityId: networkAction.entity.id,
            entityName: networkAction.entity.name,
            attributeId: networkAction.attribute.id,
            attributeName: networkAction.attribute.name,
            value,
            space: spaceId,
          };
        }
      }
    })
    .flatMap(action => (action ? [action] : []));

  return newActions;
}
