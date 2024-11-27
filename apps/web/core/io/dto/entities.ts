import { SYSTEM_IDS } from '@geogenesis/sdk';

import { Relation, RenderableEntityType, Triple } from '~/core/types';
import { Entities } from '~/core/utils/entity';

import { EntityId, SubstreamEntity, SubstreamType } from '../schema';
import { TripleDto } from './triples';

export type Entity = {
  id: EntityId;
  name: string | null;
  description: string | null;
  nameTripleSpaces: string[];
  spaces: string[];
  types: { id: EntityId; name: string | null }[];
  relationsOut: Relation[];
  triples: Triple[];
};

export function EntityDto(substreamEntity: SubstreamEntity): Entity {
  const entity = substreamEntity.currentVersion.version;
  const networkTriples = entity.triples.nodes;
  const triples = networkTriples.map(TripleDto);
  const nameTriples = Entities.nameTriples(triples);
  const entityTypes = entity.versionTypes.nodes.map(t => {
    return {
      id: t.type.entityId,
      name: t.type.name,
    };
  });

  return {
    id: substreamEntity.id,
    name: entity.name,
    description: Entities.description(triples),
    nameTripleSpaces: nameTriples.map(t => t.space),
    spaces: entity.versionSpaces.nodes.map(node => node.spaceId),
    types: entityTypes,
    relationsOut: entity.relationsByFromVersionId.nodes.map(t => {
      const toEntityTriples = t.toVersion.triples.nodes.map(TripleDto);
      const toEntityTypes = t.toVersion.versionTypes.nodes.map(t => t.type);

      // If the entity is an image then we should already have the triples used to define
      // the image URI for that image. We need to parse the triples to find the correct
      // triple URI value representing the image URI.
      const imageEntityUrlValue =
        toEntityTriples.find(t => t.attributeId === SYSTEM_IDS.IMAGE_URL_ATTRIBUTE)?.value.value ?? null;

      const renderableType = getRenderableEntityType(toEntityTypes);

      return {
        id: t.entityId,
        index: t.index,
        typeOf: {
          id: t.typeOf.entityId,
          name: t.typeOf.name,
        },
        fromEntity: {
          id: t.fromVersion.entityId,
          name: t.fromVersion.name,
        },
        toEntity: {
          id: t.toVersion.entityId,
          name: t.toVersion.name,

          // The "Renderable Type" for an entity provides a hint to the consumer
          // of the entity to _what_ the entity is so they know how they should
          // render it depending on their use case.
          renderableType,
          // Right now we only support images and entity ids as the value of the To entity.
          value: renderableType === 'IMAGE' ? imageEntityUrlValue ?? '' : t.toVersion.entityId,
        },
      };
    }),
    triples,
  };
}

function getRenderableEntityType(types: SubstreamType[]): RenderableEntityType {
  const typeIds = types.map(t => t.entityId);

  if (typeIds.includes(EntityId(SYSTEM_IDS.IMAGE))) {
    return 'IMAGE';
  }

  if (typeIds.includes(EntityId(SYSTEM_IDS.DATA_BLOCK))) {
    return 'DATA';
  }

  if (typeIds.includes(EntityId(SYSTEM_IDS.TEXT_BLOCK))) {
    return 'TEXT';
  }

  return 'RELATION';
}
