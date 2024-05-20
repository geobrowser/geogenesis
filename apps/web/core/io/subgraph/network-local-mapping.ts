import { SYSTEM_IDS } from '@geogenesis/ids';
import { ProposalStatus, ProposalType } from '@geogenesis/sdk';

import { PLACEHOLDER_SPACE_IMAGE } from '~/core/constants';
import {
  Action,
  Entity,
  OmitStrict,
  ProposedVersion,
  Space,
  SpaceConfigEntity,
  Triple,
  Value,
  Vote,
} from '~/core/types';
import { Entity as EntityModule } from '~/core/utils/entity';

type NetworkNumberValue = { valueType: 'NUMBER'; numberValue: string };

type NetworkTextValue = { valueType: 'TEXT'; textValue: string };

type NetworkImageValue = { valueType: 'IMAGE'; entityValue: { id: string; name: string | null } };

// Right now we can end up with a null entityValue until we handle triple validation on the subgraph
type NetworkEntityValue = { valueType: 'ENTITY'; entityValue: { id: string; name: string | null } };

type NetworkDateValue = { valueType: 'DATE'; textValue: string };

type NetworkUrlValue = { valueType: 'URL'; textValue: string };

type NetworkCollectionValue = { valueType: 'COLLECTION'; collectionValue: { id: string } };

type NetworkValue =
  | NetworkNumberValue
  | NetworkTextValue
  | NetworkEntityValue
  | NetworkImageValue
  | NetworkDateValue
  | NetworkUrlValue
  | NetworkCollectionValue;

export type SubstreamTriple = NetworkValue & {
  entity: { id: string; name: string | null };
  attribute: { id: string; name: string | null };
  space: Space;
};

type CreatedBy = {
  id: string;
  geoProfiles: { nodes: SubstreamEntity[] };
  onchainProfiles: { nodes: { homeSpaceId: string; id: string }[] };
};

export type SubstreamAction = OmitStrict<SubstreamTriple, 'space'> &
  NetworkValue & {
    id: string;
    actionType: 'SET_TRIPLE' | 'DELETE_TRIPLE';
    // @TODO: This should be a reference
    entityValue: string | null;
  };

export type SubstreamEntity = OmitStrict<Entity, 'triples'> & {
  triplesByEntityId: { nodes: SubstreamTriple[] };
};

export type SubstreamSpace = { id: string; metadata: { nodes: SubstreamEntity[] } };

export type SubstreamProposedVersion = OmitStrict<ProposedVersion, 'createdBy' | 'space'> & {
  actions: { nodes: SubstreamAction[] };

  createdBy: CreatedBy;
  space: SubstreamSpace;
};

export type SubstreamVersion = {
  id: string;
  name: string | null;
  description: string | null;
  createdBy: CreatedBy;
  createdAt: number;
  createdAtBlock: string;
  space: SubstreamSpace;
  tripleVersions: { nodes: { triple: SubstreamTriple }[] };
  entity: {
    id: string;
    name: string;
  };
};

export type SubstreamProposal = {
  id: string;
  type: ProposalType;
  onchainProposalId: string;
  createdBy: CreatedBy;
  createdAt: number;
  createdAtBlock: string;
  name: string | null;
  description: string | null;
  space: SubstreamSpace;
  startTime: number;
  endTime: number;
  status: ProposalStatus;
  proposalVotes: { nodes: Vote[]; totalCount: number };
  proposedVersions: { nodes: SubstreamProposedVersion[] };
};

export function extractValue(networkTriple: SubstreamTriple | SubstreamAction): Value {
  switch (networkTriple.valueType) {
    case 'TEXT':
      return { type: 'string', value: networkTriple.textValue };
    case 'IMAGE':
      return { type: 'image', value: networkTriple.entityValue.id };
    case 'NUMBER':
      return { type: 'number', value: networkTriple.numberValue };
    case 'ENTITY':
      return {
        type: 'entity',
        id: networkTriple.entityValue.id,
        name: networkTriple.entityValue.name,
      };
    case 'DATE':
      return { type: 'date', value: networkTriple.textValue };
    case 'URL':
      return { type: 'url', value: networkTriple.textValue };
    case 'COLLECTION':
      return { type: 'collection', value: networkTriple.collectionValue.id };
  }
}

export function extractActionValue(networkAction: SubstreamAction): Value {
  switch (networkAction.valueType) {
    case 'TEXT':
      return { type: 'string', value: networkAction.textValue };
    case 'IMAGE':
      return { type: 'image', value: networkAction.entityValue.id };
    case 'NUMBER':
      return { type: 'number', value: networkAction.numberValue };
    case 'ENTITY':
      return {
        type: 'entity',
        id: networkAction.entityValue,
        name: null,
      };
    case 'DATE':
      return { type: 'date', value: networkAction.textValue };
    case 'URL':
      return { type: 'url', value: networkAction.textValue };
    case 'COLLECTION':
      return { type: 'collection', value: networkAction.collectionValue.id };
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

function networkTripleHasEmptyValue(networkTriple: SubstreamTriple | SubstreamAction): boolean {
  switch (networkTriple.valueType) {
    case 'TEXT':
      return !networkTriple.textValue;
    case 'NUMBER':
      return !networkTriple.numberValue;
    case 'ENTITY':
      return !networkTriple.entityValue;
    case 'IMAGE':
      return !networkTriple.entityValue;
    case 'DATE':
      return !networkTriple.textValue;
    case 'URL':
      return !networkTriple.textValue;
    case 'COLLECTION':
      return !networkTriple.collectionValue;
  }
}

function substreamTripleHasEmptyValue(networkTriple: SubstreamAction): boolean {
  switch (networkTriple.valueType) {
    case 'TEXT':
      return !networkTriple.textValue;
    case 'NUMBER':
      return !networkTriple.numberValue;
    case 'ENTITY':
      return !networkTriple.entityValue;
    case 'IMAGE':
      return !networkTriple.entityValue;
    case 'DATE':
      return !networkTriple.textValue;
    case 'URL':
      return !networkTriple.textValue;
    case 'COLLECTION':
      return !networkTriple.collectionValue;
  }
}

function networkTripleHasEmptyAttribute(networkTriple: SubstreamAction | SubstreamTriple): boolean {
  return !networkTriple.attribute || !networkTriple.attribute.id;
}

export function fromNetworkTriples(networkTriples: SubstreamTriple[]): Triple[] {
  return networkTriples
    .map((networkTriple, i) => {
      // There's an edge-case bug where the value can be null even though it should be an object.
      // Right now we're not doing any triple validation, but once we do we will no longer be indexing
      // empty triples.
      if (networkTripleHasEmptyValue(networkTriple) || networkTripleHasEmptyAttribute(networkTriple)) {
        return null;
      }

      return {
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
          case 'SET_TRIPLE': {
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

          case 'DELETE_TRIPLE': {
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

export function getSpaceConfigFromMetadata(spaceId: string, metadata: SubstreamEntity | undefined) {
  const spaceConfigTriples = fromNetworkTriples(metadata?.triplesByEntityId.nodes ?? []);

  const spaceConfigWithImage: SpaceConfigEntity = metadata
    ? {
        id: spaceId,
        name: metadata.name,
        description: null,
        image:
          EntityModule.avatar(spaceConfigTriples) ?? EntityModule.cover(spaceConfigTriples) ?? PLACEHOLDER_SPACE_IMAGE,
        triples: spaceConfigTriples,
        types: EntityModule.types(spaceConfigTriples),
        nameTripleSpaces: EntityModule.nameTriples(spaceConfigTriples).map(t => t.space),
      }
    : {
        id: spaceId,
        name: null,
        description: null,
        image: PLACEHOLDER_SPACE_IMAGE,
        triples: [],
        types: [],
        nameTripleSpaces: [],
      };

  return spaceConfigWithImage;
}
