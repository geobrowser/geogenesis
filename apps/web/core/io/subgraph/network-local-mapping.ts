import { Account, Action, Entity, OmitStrict, ProposedVersion, Space, Triple, Value } from '~/core/types';

export type NetworkSpace = {
  id: string;
  isRootSpace: boolean;
  admins: Account[];
  editors: Account[];
  editorControllers: Account[];
  entity?: {
    id: string;
    entityOf: { id: string; stringValue: string; attribute: { id: string } }[];
  };
  createdAtBlock: string;
};

type NetworkNumberValue = { valueType: 'NUMBER'; numberValue: string };

type NetworkStringValue = { valueType: 'STRING'; stringValue: string };

type NetworkImageValue = { valueType: 'IMAGE'; stringValue: string };

// Right now we can end up with a null entityValue until we handle triple validation on the subgraph
type NetworkEntityValue = { valueType: 'ENTITY'; entityValue: { id: string; name: string | null } };

type NetworkDateValue = { valueType: 'DATE'; stringValue: string };

type NetworkUrlValue = { valueType: 'URL'; stringValue: string };

type NetworkValue =
  | NetworkNumberValue
  | NetworkStringValue
  | NetworkEntityValue
  | NetworkImageValue
  | NetworkDateValue
  | NetworkUrlValue;

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

export type SubstreamNetworkEntity = Entity & {
  triplesByEntityId: { nodes: NetworkTriple[] };
};

export type NetworkProposedVersion = OmitStrict<ProposedVersion, 'createdBy'> & {
  actions: NetworkAction[];

  // The NetworkVersion does not have a name or avatar associated
  // with the createdBy field
  createdBy: {
    id: string;
  };
  entity: {
    id: string;
    name: string;
  };
};

export type NetworkProposal = {
  id: string;
  createdBy: {
    id: string;
  };
  createdAt: number;
  createdAtBlock: string;
  name: string | null;
  description: string | null;
  space: string;
  status: 'APPROVED';
  proposedVersions: NetworkProposedVersion[];
};

export function extractValue(networkTriple: NetworkTriple | NetworkAction): Value {
  switch (networkTriple.valueType) {
    case 'STRING':
      return { type: 'string', id: networkTriple.valueId, value: networkTriple.stringValue };
    case 'IMAGE':
      return { type: 'image', id: networkTriple.valueId, value: networkTriple.stringValue };
    case 'NUMBER':
      return { type: 'number', id: networkTriple.valueId, value: networkTriple.numberValue };
    case 'ENTITY':
      return {
        type: 'entity',
        id: networkTriple.entityValue.id,
        name: networkTriple.entityValue.name,
      };
    case 'DATE':
      return { type: 'date', id: networkTriple.valueId, value: networkTriple.stringValue };
    case 'URL':
      return { type: 'url', id: networkTriple.valueId, value: networkTriple.stringValue };
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
    case 'ENTITY':
      return {
        type: 'entity',
        id: networkAction.entityValue?.id ?? null,
        name: networkAction.entityValue?.name ?? null,
      };
    case 'DATE':
      return { type: 'date', id: networkAction.valueId, value: networkAction.stringValue };
    case 'URL':
      return { type: 'url', id: networkAction.valueId, value: networkAction.stringValue };
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
    case 'DATE':
      return !networkTriple.stringValue;
    case 'URL':
      return !networkTriple.stringValue;
  }
}

function networkTripleHasEmptyAttribute(networkTriple: NetworkTriple | NetworkAction): boolean {
  return !networkTriple.attribute || !networkTriple.attribute.id;
}

export function fromNetworkTriples(networkTriples: NetworkTriple[]): Triple[] {
  return (
    networkTriples
      // @TODO: Remove this once we have correct types for substreams triples value types.
      // Right now they are set as lowercase in the substream db, but uppercase in the subgraph.
      .map(
        networkTriple =>
          ({
            ...networkTriple,
            valueType: networkTriple.valueType.toUpperCase() as NetworkValue['valueType'],
          }) as NetworkTriple
      )
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
      .flatMap(triple => (triple ? [triple] : []))
  );
}

export function fromSubstreamsTriples(networkTriples: NetworkTriple[]): Triple[] {
  return [];
}

export function fromNetworkActions(networkActions: NetworkAction[], spaceId: string): Action[] {
  const newActions = networkActions
    .map(networkAction => {
      // There's an edge-case bug where the value can be null even though it should be an object.
      // Right now we're not doing any triple validation, but once we do we will no longer be indexing
      // empty triples. This is likely a result of very old data that does not map to the expected
      // type for value types.
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
