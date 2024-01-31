import { Action, Entity, OmitStrict, ProposedVersion, Space, Triple, Value } from '~/core/types';

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

export type SubstreamNetworkAction = OmitStrict<NetworkTriple, 'space' | 'isProtected'> &
  NetworkValue & {
    actionType: 'createTriple' | 'deleteTriple';
    // @TODO: This should be a reference
    entityValue: string | null;
  };

export type NetworkEntity = Entity & {
  entityOf: ({ space: Space } & NetworkTriple)[];
};

export type SubstreamNetworkEntity = OmitStrict<Entity, 'triples'> & {
  // versionsByEntityId: { nodes: { tripleVersions: { nodes: { triple: NetworkTriple }[] } }[] };
  triplesByEntityId: { nodes: NetworkTriple[] };
};

export type SubstreamProposedVersion = OmitStrict<ProposedVersion, 'createdBy'> & {
  actions: { nodes: SubstreamNetworkAction[] };

  // The NetworkVersion does not have a name or avatar associated
  // with the createdBy field
  createdById: string;
};

export type SubstreamVersion = {
  id: string;
  name: string | null;
  description: string | null;
  createdById: string; // wallet address
  createdAt: number;
  createdAtBlock: string;
  spaceId: string;
  actions: { nodes: SubstreamNetworkAction[] };
  entity: {
    id: string;
    name: string;
  };
  tripleVersions: { nodes: { triple: NetworkTriple }[] };
};

export type SubstreamProposal = {
  id: string;
  createdById: string;
  createdAt: number;
  createdAtBlock: string;
  name: string | null;
  description: string | null;
  spaceId: string;
  startTime: number;
  endTime: number;
  status: 'APPROVED';
  proposedVersions: { nodes: SubstreamProposedVersion[] };
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

export function extractActionValue(networkAction: SubstreamNetworkAction): Value {
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
        id: networkAction.entityValue,
        name: null,
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

function substreamTripleHasEmptyValue(networkTriple: NetworkTriple | SubstreamNetworkAction): boolean {
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

function networkTripleHasEmptyAttribute(networkTriple: NetworkTriple | SubstreamNetworkAction): boolean {
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

export function fromNetworkActions(
  networkActions: SubstreamNetworkAction[] | NetworkAction[],
  spaceId: string
): Action[] {
  try {
    const newActions = networkActions
      // @TODO: Remove this once we have correct types for substreams triples value types.
      // Right now they are set as lowercase in the substream db, but uppercase in the subgraph.
      .map(
        networkAction =>
          ({
            ...networkAction,
            valueType: networkAction.valueType.toUpperCase() as NetworkValue['valueType'],
          }) as SubstreamNetworkAction
      )
      .map(networkAction => {
        // There's an edge-case bug where the value can be null even though it should be an object.
        // Right now we're not doing any triple validation, but once we do we will no longer be indexing
        // empty triples. This is likely a result of very old data that does not map to the expected
        // type for value types.
        if (substreamTripleHasEmptyValue(networkAction) || networkTripleHasEmptyAttribute(networkAction)) {
          return null;
        }

        const value = extractActionValue(networkAction);

        switch (networkAction.actionType) {
          case 'createTriple': {
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

          case 'deleteTriple': {
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
  } catch (e) {
    console.log('cannot map network actions', e);
    return [];
  }
}
