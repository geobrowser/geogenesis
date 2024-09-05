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
        // @TODO: Fix runtime error when decoding in table
        value: networkTriple?.entityValue?.id ?? '',
        name: networkTriple?.entityValue?.name ?? null,
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
  const entity = metadata ? EntityDto(metadata) : null;

  const spaceConfigWithImage: SpaceConfigEntity = entity
    ? {
        ...entity,
        spaceId: spaceId,
        image: Entities.avatar(entity.relationsOut) ?? Entities.cover(entity.relationsOut) ?? PLACEHOLDER_SPACE_IMAGE,
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
