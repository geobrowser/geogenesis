import { OG_IMAGE_PROPERTY } from '~/core/constants';
import { DEBATE_TYPE_ID } from '~/core/debates/ontology';
import { AVATAR_PROPERTY_ID, COVER_PROPERTY_ID } from '~/core/io/subgraph/space-image';
import { normId } from '~/core/utils/norm-id';

export type GraphEntity = {
  id: string;
  name: string | null;
  spaceIds: string[];
  /** Spaces that write a non-empty name for it: where it has content, not just a citation. */
  namedSpaceIds: string[];
  types: Array<{ id: string; name: string | null }>;
  /** Avatar, else cover; an `ipfs://` or http URL. */
  image: string | null;
  /** A debate's share card (its OG Image), drawn in place of `image`. Null or absent for anything else. */
  card?: string | null;
};

export type GraphCentreText = { propertyId: string; spaceId: string; text: string };

export type GraphCentre = GraphEntity & {
  description: string | null;
  /** Name and description values per space, so the view can read them in the centre's own space. */
  texts: GraphCentreText[];
};

export type GraphRelation = {
  id: string;
  direction: 'out' | 'in';
  propertyId: string;
  propertyName: string | null;
  /** The space the relation was written in. */
  spaceId: string;
  position: string | null;
  entity: GraphEntity;
};

export type GraphHop = {
  centre: GraphCentre | null;
  relations: GraphRelation[];
};

export type RawEntity = {
  id: string;
  name: string | null;
  spaceIds: string[] | null;
  names?: Array<{ spaceId: string; text: string | null }> | null;
  types: Array<{ id: string; name: string | null }> | null;
  relationsList: Array<{
    typeId: string;
    spaceId?: string | null;
    toEntity: { valuesList: Array<{ text: string | null }> } | null;
  }> | null;
};

export function imageOf(entity: RawEntity): string | null {
  const relations = entity.relationsList ?? [];
  for (const propertyId of [AVATAR_PROPERTY_ID, COVER_PROPERTY_ID]) {
    for (const relation of relations) {
      if (normId(relation.typeId) !== propertyId) continue;
      const url = relation.toEntity?.valuesList.find(value => value.text)?.text;
      if (url) return url;
    }
  }
  return null;
}

/**
 * A debate's share card: the Image URL of its OG Image. Other entities can carry an OG Image too, but
 * only debates are drawn as a card, so they get null. A debate can have a card in more than one space;
 * one in a space that names it (where the debate lives) wins over any other.
 */
export function cardOf(entity: RawEntity, namedSpaceIds: readonly string[] = []): string | null {
  if (!(entity.types ?? []).some(type => normId(type.id) === DEBATE_TYPE_ID)) return null;
  const cards = (entity.relationsList ?? []).flatMap(relation => {
    if (normId(relation.typeId) !== OG_IMAGE_PROPERTY) return [];
    const url = relation.toEntity?.valuesList.find(value => value.text)?.text;
    return url ? [{ url, own: relation.spaceId ? namedSpaceIds.includes(normId(relation.spaceId)) : false }] : [];
  });
  return (cards.find(card => card.own) ?? cards[0])?.url ?? null;
}

export function decodeEntity(entity: RawEntity): GraphEntity {
  const namedSpaceIds = [
    ...new Set((entity.names ?? []).filter(value => value.text?.trim()).map(value => normId(value.spaceId))),
  ];
  return {
    id: normId(entity.id),
    name: entity.name?.trim() ? entity.name.trim() : null,
    spaceIds: (entity.spaceIds ?? []).map(normId),
    namedSpaceIds,
    types: entity.types ?? [],
    image: imageOf(entity),
    card: cardOf(entity, namedSpaceIds),
  };
}
