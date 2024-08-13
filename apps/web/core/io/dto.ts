import { PLACEHOLDER_SPACE_IMAGE } from '../constants';
import { Value } from '../types';
import { Entities } from '../utils/entity';
import { EntityDto } from './dto/entities';
import { SpaceConfigEntity } from './dto/spaces';
import { EntityId, SubstreamEntity, SubstreamTriple } from './schema';

function extractValue(networkTriple: SubstreamTriple): Value {
  switch (networkTriple.valueType) {
    case 'TEXT':
      return { type: 'TEXT', value: networkTriple.textValue };
    case 'ENTITY': {
      return {
        type: 'ENTITY',
        value: networkTriple.entityValue.id,
        name: networkTriple.entityValue.name,
      };
    }
    case 'TIME':
      return { type: 'TIME', value: networkTriple.textValue };
    case 'URI':
      return { type: 'URI', value: networkTriple.textValue };
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

export function SpaceMetadataDto(spaceId: string, metadata: SubstreamEntity | undefined | null): SpaceConfigEntity {
  const spaceConfigTriples = (metadata?.triples.nodes ?? []).map(TripleDto);

  const spaceConfigWithImage: SpaceConfigEntity = metadata
    ? {
        spaceId: spaceId,
        image: Entities.avatar(spaceConfigTriples) ?? Entities.cover(spaceConfigTriples) ?? PLACEHOLDER_SPACE_IMAGE,
        ...EntityDto(metadata),
      }
    : {
        id: EntityId(''),
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
