import { ProposalStatus, ProposalType, SYSTEM_IDS } from '@geogenesis/sdk';

import { PLACEHOLDER_SPACE_IMAGE } from '~/core/constants';
import {
  AppOp,
  CollectionItem,
  Entity,
  OmitStrict,
  ProposedVersion,
  Space,
  SpaceConfigEntity,
  Triple,
  Value,
  Vote,
} from '~/core/types';
import { Entities as EntityModule } from '~/core/utils/entity';

import { fetchEntity } from './fetch-entity';
import { NetworkSpaceResult } from './types';

interface SubstreamType {
  id: string;
}

type SubstreamImageValueTriple = {
  valueType: string;
  attributeId: string;
  textValue: string;
};

type Nameable = {
  name: string | null;
};

type Identifiable = {
  id: string;
};

type SubstreamCollectionItem = {
  collectionItemEntityId: string;
  index: string;
  entity: {
    id: string;
    name: string | null;
    types: { nodes: SubstreamType[] };
    triples: {
      nodes: SubstreamImageValueTriple[];
    };
  } | null;
};

type SubstreamNumberValue = { valueType: 'NUMBER'; numberValue: string };
type SubstreamTextValue = { valueType: 'TEXT'; textValue: string };
type SubstreamEntityValue = {
  valueType: 'ENTITY';
  entityValue: {
    id: string;
    name: string | null;
    types: {
      nodes: SubstreamType[];
    };
    // We only fetch the triples that matter for the compound types that
    // we might be rendering. e.g., an Entity might be of type "Image",
    // in which case we need the textValue of the IMAGE_URL attribute triple.
    triples: {
      nodes: SubstreamImageValueTriple[];
    };
  };
};
type SubstreamTimeValue = { valueType: 'TIME'; textValue: string };
type SubstreamUrlValue = { valueType: 'URL'; textValue: string };
type SubstreamCollectionValue = {
  valueType: 'COLLECTION';
  collectionValue: {
    id: string;
    collectionItems: {
      nodes: SubstreamCollectionItem[];
    };
  };
};

type SubstreamValue =
  | SubstreamNumberValue
  | SubstreamTextValue
  | SubstreamEntityValue
  | SubstreamTimeValue
  | SubstreamUrlValue
  | SubstreamCollectionValue;

export type SubstreamTriple = SubstreamValue & {
  entity: Identifiable & Nameable;
  attribute: Identifiable & Nameable;
  space: Space;
};

export type SubstreamTripleWithSpaceMetadata = SubstreamValue & {
  entity: Identifiable & Nameable;
  attribute: Identifiable & Nameable;
  space: Pick<NetworkSpaceResult, 'id' | 'spacesMetadata'>;
};

type CreatedBy = {
  id: string;
};

export type SubstreamOp = OmitStrict<SubstreamTriple, 'space'> &
  SubstreamValue & {
    id: string;
    type: 'SET_TRIPLE' | 'DELETE_TRIPLE';
    // @TODO: This should be a reference
    entityValue: string | null;
  };

export type SubstreamEntity = OmitStrict<Entity, 'triples' | 'types' | 'nameTripleSpaces'> & {
  triples: { nodes: SubstreamTriple[] };
  types: {
    nodes: { id: string; name: string | null }[];
  };
};

export type SubstreamEntityWithSpaceMetadata = OmitStrict<Entity, 'triples' | 'types' | 'nameTripleSpaces'> & {
  triples: { nodes: SubstreamTripleWithSpaceMetadata[] };
  types: {
    nodes: { id: string; name: string | null }[];
  };
};

export type SubstreamImage = {
  id: string;
  triples: {
    nodes: SubstreamImageValueTriple[];
  };
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
    types: { nodes: { id: string } };
  };
};

export type SubstreamProposal = {
  id: string;
  name: string | null;
  type: ProposalType;
  onchainProposalId: string;
  createdBy: CreatedBy;
  createdAt: number;
  createdAtBlock: string;
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
    case 'NUMBER':
      return { type: 'NUMBER', value: networkTriple.numberValue };
    case 'ENTITY': {
      // We render certain types of Entities differently as a triple value than others.
      // For example, for a "regular" Entity we render the name in a chip, but for an
      // "image" Entity we want to render a specific triple's value which contains the
      // image resource url.
      if (isImageEntity(networkTriple.entityValue.types.nodes)) {
        // Image values are stored in the data model as an entity with triple with
        // a "IMAGE_COMPOUND_TYPE_SOURCE_ATTRIBUTE" attribute. The value of this triple should
        // be a URL pointing to the resource location of the image contents,
        // usually an IPFS hash.
        return {
          type: 'IMAGE',
          value: networkTriple.entityValue.id,
          image: getImageUrlFromImageEntity(networkTriple.entityValue.triples.nodes) ?? '',
        };
      }

      return {
        type: 'ENTITY',
        value: networkTriple.entityValue.id,
        name: networkTriple.entityValue.name,
      };
    }
    case 'TIME':
      return { type: 'TIME', value: networkTriple.textValue };
    case 'URL':
      return { type: 'URL', value: networkTriple.textValue };
    case 'COLLECTION':
      return {
        type: 'COLLECTION',
        value: networkTriple.collectionValue.id,
        items: networkTriple.collectionValue.collectionItems.nodes.flatMap((c): CollectionItem[] => {
          // @TODO(migration) We can have a null entity if the value doesn't exist in the db at the
          // time of indexing the collection item
          if (!c.entity) {
            return [];
          }

          if (isImageEntity(c.entity.types.nodes)) {
            return [
              {
                id: c.collectionItemEntityId,
                collectionId: networkTriple.collectionValue.id,
                index: c.index,
                entity: {
                  id: c.entity.id,
                  name: c.entity.name,
                  types: flattenTypeIds(c.entity.types.nodes),
                },
                value: {
                  type: 'IMAGE',
                  value: getImageUrlFromImageEntity(c.entity.triples.nodes),
                },
              },
            ];
          }

          return [
            {
              id: c.collectionItemEntityId,
              collectionId: networkTriple.collectionValue.id,
              index: c.index,
              entity: {
                id: c.entity.id,
                name: c.entity.name,
                types: flattenTypeIds(c.entity.types.nodes),
              },
              value: {
                type: 'ENTITY',
                value: c.entity.name,
              },
            },
          ];
        }),
      };
  }
}

export function extractActionValue(networkAction: SubstreamOp): Value {
  switch (networkAction.valueType) {
    case 'TEXT':
      return { type: 'TEXT', value: networkAction.textValue };
    case 'NUMBER':
      return { type: 'NUMBER', value: networkAction.numberValue };
    case 'ENTITY': {
      // We render certain types of Entities differently as a triple value than others.
      // For example, for a "regular" Entity we render the name in a chip, but for an
      // "image" Entity we want to render a specific triple's value which contains the
      // image resource url.
      if (isImageEntity(networkAction.entityValue.types.nodes)) {
        // Image values are stored in the data model as an entity with triple with
        // a "IMAGE_COMPOUND_TYPE_SOURCE_ATTRIBUTE" attribute. The value of this triple should
        // be a URL pointing to the resource location of the image contents,
        // usually an IPFS hash.
        return {
          type: 'IMAGE',
          value: networkAction.entityValue.id,
          image: getImageUrlFromImageEntity(networkAction.entityValue.triples.nodes) ?? '',
        };
      }

      return {
        type: 'ENTITY',
        value: networkAction.entityValue.id,
        name: networkAction.entityValue.name,
      };
    }
    case 'TIME':
      return { type: 'TIME', value: networkAction.textValue };
    case 'URL':
      return { type: 'URL', value: networkAction.textValue };
    case 'COLLECTION':
      return { type: 'COLLECTION', value: networkAction.collectionValue.id, items: [] };
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
    .map(networkTriple => {
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

export function fromNetworkOps(networkOps: SubstreamOp[]): AppOp[] {
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
  const spaceConfigTriples = fromNetworkTriples(metadata?.triples.nodes ?? []);

  const spaceConfigWithImage: SpaceConfigEntity = metadata
    ? {
        id: metadata.id,
        spaceId: spaceId,
        name: metadata.name,
        description: null,
        image:
          EntityModule.avatar(spaceConfigTriples) ?? EntityModule.cover(spaceConfigTriples) ?? PLACEHOLDER_SPACE_IMAGE,
        triples: spaceConfigTriples,
        types: EntityModule.types(spaceConfigTriples),
        nameTripleSpaces: EntityModule.nameTriples(spaceConfigTriples).map(t => t.space),
      }
    : {
        id: '',
        spaceId: spaceId,
        name: null,
        description: null,
        image: PLACEHOLDER_SPACE_IMAGE,
        triples: [],
        types: [],
        nameTripleSpaces: [],
      };

  return spaceConfigWithImage;
}

function getImageUrlFromImageEntity(triples: SubstreamImageValueTriple[]): string | null {
  const triple = triples.find(t => t.attributeId === SYSTEM_IDS.IMAGE_URL_ATTRIBUTE);
  return triple?.valueType === 'URL' ? triple.textValue : null;
}

function isImageEntity(types: SubstreamType[]): boolean {
  return types.some(t => t.id === SYSTEM_IDS.IMAGE);
}

function flattenTypeIds(types: SubstreamType[]) {
  return types.map(t => t.id);
}

export function getCollectionItemsFromBlocksTriple(entity: Entity) {
  const blockIdsTriple =
    entity.triples.find(t => t.attributeId === SYSTEM_IDS.BLOCKS && t.value.type === 'COLLECTION') || null;

  const blockCollectionItems =
    blockIdsTriple && blockIdsTriple.value.type === 'COLLECTION' ? blockIdsTriple.value.items : [];

  return {
    blockIdsTriple,
    blockCollectionItems,
  };
}

export async function getBlocksCollectionData(entity: Entity) {
  const { blockCollectionItems, blockIdsTriple } = getCollectionItemsFromBlocksTriple(entity);
  const blockIds: string[] = blockCollectionItems.map(item => item.entity.id);

  const [blockTriples, collectionItemTriples] = await Promise.all([
    Promise.all(
      blockIds.map(blockId => {
        return fetchEntity({ id: blockId });
      })
    ),
    Promise.all(
      blockCollectionItems.map(item => {
        return fetchEntity({ id: item.id });
      })
    ),
  ]);

  return {
    blockIdsTriple,
    blockTriples,
    blockCollectionItems,
    collectionItemTriples,
  };
}
