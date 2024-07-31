import { SYSTEM_IDS } from '@geogenesis/sdk';

import { PLACEHOLDER_SPACE_IMAGE } from '../constants';
import { SpaceConfigEntity, Value } from '../types';
import { Entities } from '../utils/entity';
import { SubstreamEntity, SubstreamImageValueTriple, SubstreamTriple, SubstreamType } from './schema';

function getImageUrlFromImageEntity(triples: readonly SubstreamImageValueTriple[]): string | null {
  const triple = triples.find(t => t.attributeId === SYSTEM_IDS.IMAGE_URL_ATTRIBUTE);
  return triple?.valueType === 'URL' ? triple.textValue : null;
}

function isImageEntity(types: readonly SubstreamType[]): boolean {
  return types.some(t => t.id === SYSTEM_IDS.IMAGE);
}

function extractValue(networkTriple: SubstreamTriple): Value {
  switch (networkTriple.valueType) {
    case 'TEXT':
      return { type: 'TEXT', value: networkTriple.textValue };
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
          // image: getImageUrlFromImageEntity(networkTriple.entityValue.triples.nodes) ?? '',
          image: '',
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
  }
}

export function TripleDto(triple: SubstreamTriple) {
  return {
    entityId: triple.entity.id,
    entityName: triple.entity.name,
    attributeId: triple.attribute.id,
    attributeName: triple.attribute.name,
    value: extractValue(triple),
    space: triple.space.id,
  };
}

export function SpaceMetadataDto(spaceId: string, metadata: SubstreamEntity | undefined | null) {
  const spaceConfigTriples = (metadata?.triples.nodes ?? []).map(TripleDto);

  const spaceConfigWithImage: SpaceConfigEntity = metadata
    ? {
        id: metadata.id,
        spaceId: spaceId,
        name: metadata.name,
        description: null,
        image: Entities.avatar(spaceConfigTriples) ?? Entities.cover(spaceConfigTriples) ?? PLACEHOLDER_SPACE_IMAGE,
        triples: spaceConfigTriples,
        types: Entities.types(spaceConfigTriples),
        nameTripleSpaces: Entities.nameTriples(spaceConfigTriples).map(t => t.space),
        relationsOut: metadata.relationsByFromEntityId.nodes.map(t => t), // remove readonly,
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
        relationsOut: [],
      };

  return spaceConfigWithImage;
}
