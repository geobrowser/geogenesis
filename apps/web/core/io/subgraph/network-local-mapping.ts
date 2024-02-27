import { Action, Entity, OmitStrict, ProposedVersion, Space, Triple, Value, Vote } from '~/core/types';

type NetworkNumberValue = { valueType: 'number'; numberValue: string };

type NetworkStringValue = { valueType: 'string'; stringValue: string };

type NetworkImageValue = { valueType: 'image'; stringValue: string };

// Right now we can end up with a null entityValue until we handle triple validation on the subgraph
type NetworkEntityValue = { valueType: 'entity'; entityValue: { id: string; name: string | null } };

type NetworkDateValue = { valueType: 'date'; stringValue: string };

type NetworkUrlValue = { valueType: 'url'; stringValue: string };

type NetworkValue =
  | NetworkNumberValue
  | NetworkStringValue
  | NetworkEntityValue
  | NetworkImageValue
  | NetworkDateValue
  | NetworkUrlValue;

export type SubstreamTriple = NetworkValue & {
  id: string;
  entity: { id: string; name: string | null };
  attribute: { id: string; name: string | null };
  valueId: string;
  isProtected: boolean;
  space: Space;
};

export type SubstreamAction = OmitStrict<SubstreamTriple, 'space' | 'isProtected'> &
  NetworkValue & {
    actionType: 'createTriple' | 'deleteTriple';
    // @TODO: This should be a reference
    entityValue: string | null;
  };

export type SubstreamEntity = OmitStrict<Entity, 'triples'> & {
  // versionsByEntityId: { nodes: { tripleVersions: { nodes: { triple: NetworkTriple }[] } }[] };
  triplesByEntityId: { nodes: SubstreamTriple[] };
};

export type SubstreamProposedVersion = OmitStrict<ProposedVersion, 'createdBy'> & {
  actions: { nodes: SubstreamAction[] };

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
  actions: { nodes: SubstreamAction[] };
  entity: {
    id: string;
    name: string;
  };
  tripleVersions: { nodes: { triple: SubstreamTriple }[] };
};

export type SubstreamProposal = {
  id: string;
  onchainProposalId: string;
  createdById: string;
  createdAt: number;
  createdAtBlock: string;
  name: string | null;
  description: string | null;
  spaceId: string;
  startTime: number;
  endTime: number;
  status: 'APPROVED';
  proposalVotes: { nodes: Vote[]; totalCount: number };
  proposedVersions: { nodes: SubstreamProposedVersion[] };
};

export function extractValue(networkTriple: SubstreamTriple | SubstreamAction): Value {
  switch (networkTriple.valueType) {
    case 'string':
      return { type: 'string', id: networkTriple.valueId, value: networkTriple.stringValue };
    case 'image':
      return { type: 'image', id: networkTriple.valueId, value: networkTriple.stringValue };
    case 'number':
      return { type: 'number', id: networkTriple.valueId, value: networkTriple.numberValue };
    case 'entity':
      return {
        type: 'entity',
        id: networkTriple.entityValue.id,
        name: networkTriple.entityValue.name,
      };
    case 'date':
      return { type: 'date', id: networkTriple.valueId, value: networkTriple.stringValue };
    case 'url':
      return { type: 'url', id: networkTriple.valueId, value: networkTriple.stringValue };
  }
}

export function extractActionValue(networkAction: SubstreamAction): Value {
  switch (networkAction.valueType) {
    case 'string':
      return { type: 'string', id: networkAction.valueId, value: networkAction.stringValue };
    case 'image':
      return { type: 'image', id: networkAction.valueId, value: networkAction.stringValue };
    case 'number':
      return { type: 'number', id: networkAction.valueId, value: networkAction.numberValue };
    case 'entity':
      return {
        type: 'entity',
        id: networkAction.entityValue,
        name: null,
      };
    case 'date':
      return { type: 'date', id: networkAction.valueId, value: networkAction.stringValue };
    case 'url':
      return { type: 'url', id: networkAction.valueId, value: networkAction.stringValue };
  }

  console.log('networkAction', networkAction);
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

function networkTripleHasEmptyValue(networkTriple: SubstreamTriple | SubstreamAction): boolean {
  switch (networkTriple.valueType) {
    case 'string':
      return !networkTriple.stringValue;
    case 'number':
      return !networkTriple.numberValue;
    case 'entity':
      return !networkTriple.entityValue;
    case 'image':
      return !networkTriple.stringValue;
    case 'date':
      return !networkTriple.stringValue;
    case 'url':
      return !networkTriple.stringValue;
  }
}

function substreamTripleHasEmptyValue(networkTriple: SubstreamAction): boolean {
  switch (networkTriple.valueType) {
    case 'string':
      return !networkTriple.stringValue;
    case 'number':
      return !networkTriple.numberValue;
    case 'entity':
      return !networkTriple.entityValue;
    case 'image':
      return !networkTriple.stringValue;
    case 'date':
      return !networkTriple.stringValue;
    case 'url':
      return !networkTriple.stringValue;
  }
}

function networkTripleHasEmptyAttribute(networkTriple: SubstreamAction | SubstreamTriple): boolean {
  return !networkTriple.attribute || !networkTriple.attribute.id;
}

export function fromNetworkTriples(networkTriples: SubstreamTriple[]): Triple[] {
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

export function fromNetworkActions(networkActions: SubstreamAction[], spaceId: string): Action[] {
  try {
    const newActions = networkActions
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
