import { SYSTEM_IDS } from '@geogenesis/ids';
import { Op, ProposalStatus, ProposalType } from '@geogenesis/sdk';

import { PLACEHOLDER_SPACE_IMAGE } from '~/core/constants';
import {
  AppOp,
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
type NetworkImageValue = { valueType: 'IMAGE'; entityValue: { id: string; } };
type NetworkEntityValue = { valueType: 'ENTITY'; entityValue: { id: string; name: string | null } };
type NetworkTimeValue = { valueType: 'TIME'; textValue: string };
type NetworkUrlValue = { valueType: 'URL'; textValue: string };
type NetworkCollectionValue = { valueType: 'COLLECTION'; collectionValue: { id: string } };

type NetworkValue =
  | NetworkNumberValue
  | NetworkTextValue
  | NetworkEntityValue
  | NetworkImageValue
  | NetworkTimeValue
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

export type SubstreamOp = OmitStrict<SubstreamTriple, 'space'> &
  NetworkValue & {
    id: string;
    type: 'SET_TRIPLE' | 'DELETE_TRIPLE';
    // @TODO: This should be a reference
    entityValue: string | null;
  };

export type SubstreamEntity = OmitStrict<Entity, 'triples'> & {
  triplesByEntityId: { nodes: SubstreamTriple[] };
};

export type SubstreamSpace = { id: string; metadata: { nodes: SubstreamEntity[] } };

export type SubstreamProposedVersion = OmitStrict<ProposedVersion, 'createdBy' | 'space'> & {
  actions: { nodes: SubstreamOp[] };

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

export function extractValue(networkTriple: SubstreamTriple | SubstreamOp): Value {
  switch (networkTriple.valueType) {
    case 'TEXT':
      return { type: 'TEXT', value: networkTriple.textValue };
    case 'IMAGE':
      return { type: 'IMAGE', value: networkTriple.entityValue.id };
    case 'NUMBER':
      return { type: 'NUMBER', value: networkTriple.numberValue };
    case 'ENTITY':
      return {
        type: 'ENTITY',
        id: networkTriple.entityValue.id,
        name: networkTriple.entityValue.name,
      };
    case 'TIME':
      return { type: 'TIME', value: networkTriple.textValue };
    case 'URL':
      return { type: 'URL', value: networkTriple.textValue };
    case 'COLLECTION':
      return { type: 'COLLECTION', value: networkTriple.collectionValue.id };
  }
}

export function extractActionValue(networkAction: SubstreamOp): Value {
  switch (networkAction.valueType) {
    case 'TEXT':
      return { type: 'TEXT', value: networkAction.textValue };
    case 'IMAGE':
      return { type: 'IMAGE', value: networkAction.entityValue.id };
    case 'NUMBER':
      return { type: 'NUMBER', value: networkAction.numberValue };
    case 'ENTITY':
      return {
        type: 'ENTITY',
        id: networkAction.entityValue,
        name: null,
      };
    case 'TIME':
      return { type: 'TIME', value: networkAction.textValue };
    case 'URL':
      return { type: 'URL', value: networkAction.textValue };
    case 'COLLECTION':
      return { type: 'COLLECTION', value: networkAction.collectionValue.id };
  }
}

function networkTripleHasEmptyValue(networkTriple: SubstreamTriple | SubstreamOp): boolean {
  switch (networkTriple.valueType) {
    case 'TEXT':
      return !networkTriple.textValue;
    case 'NUMBER':
      return !networkTriple.numberValue;
    case 'ENTITY':
      return !networkTriple.entityValue;
    case 'IMAGE':
      return !networkTriple.entityValue;
    case 'TIME':
      return !networkTriple.textValue;
    case 'URL':
      return !networkTriple.textValue;
    case 'COLLECTION':
      return !networkTriple.collectionValue;
  }
}

function substreamTripleHasEmptyValue(networkTriple: SubstreamOp): boolean {
  switch (networkTriple.valueType) {
    case 'TEXT':
      return !networkTriple.textValue;
    case 'NUMBER':
      return !networkTriple.numberValue;
    case 'ENTITY':
      return !networkTriple.entityValue;
    case 'IMAGE':
      return !networkTriple.entityValue;
    case 'TIME':
      return !networkTriple.textValue;
    case 'URL':
      return !networkTriple.textValue;
    case 'COLLECTION':
      return !networkTriple.collectionValue;
  }
}

function networkTripleHasEmptyAttribute(networkTriple: SubstreamOp | SubstreamTriple): boolean {
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

export function fromNetworkOps(networkOps: SubstreamOp[], spaceId: string): AppOp[] {
  try {
    const newActions = networkOps
      .map(networkOp => {
        // There's an edge-case bug where the value can be null even though it should be an object.
        // Right now we're not doing any triple validation, but once we do we will no longer be indexing
        // empty triples. This is likely a result of very old data that does not map to the expected
        // type for value types.
        if (substreamTripleHasEmptyValue(networkOp) || networkTripleHasEmptyAttribute(networkOp)) {
          return null;
        }

        const value = extractActionValue(networkOp);

        switch (networkOp.type) {
          case 'SET_TRIPLE': {
            const op: AppOp = {
              type: 'SET_TRIPLE',
              id: networkOp.id,
              entityId: networkOp.entity.id,
              entityName: networkOp.entity.name,
              attributeId: networkOp.attribute.id,
              attributeName: networkOp.attribute.name,
              value,            
            };

            return op;
          }

          case 'DELETE_TRIPLE': {
            const op: AppOp = {
              type: 'DELETE_TRIPLE',
              id: networkOp.id,
              entityId: networkOp.entity.id,
              entityName: networkOp.entity.name,
              attributeId: networkOp.attribute.id,
              attributeName: networkOp.attribute.name,
              value,            
            };

            return op;
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
