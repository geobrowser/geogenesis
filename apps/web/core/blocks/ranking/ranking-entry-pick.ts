import { ContentIds, SystemIds } from '@geoprotocol/geo-sdk/lite';

import { EntityId } from '~/core/io/substream-schema';
import type { Relation, Value } from '~/core/types';
import { compareBySpaceRank } from '~/core/utils/space/space-ranking';

function pickBySpacePrecedence<T extends { spaceId: string }>(items: T[], currentSpaceId: string): T | null {
  const inSpace = items.find(item => item.spaceId === currentSpaceId);
  if (inSpace) return inSpace;

  const others = items.filter(item => item.spaceId !== currentSpaceId);
  if (others.length === 0) return null;

  return others.sort(compareBySpaceRank(item => item.spaceId))[0];
}

export function pickValueBySpace(values: Value[], propertyId: string, currentSpaceId: string): string | null {
  const candidates = values.filter(v => v.property.id === propertyId && v.value?.trim());
  return pickBySpacePrecedence(candidates, currentSpaceId)?.value?.trim() ?? null;
}

export function pickRelationBySpace(relations: Relation[], typeId: string, currentSpaceId: string): Relation | null {
  return pickBySpacePrecedence(
    relations.filter(r => r.type.id === typeId),
    currentSpaceId
  );
}

export function pickImage(relations: Relation[], currentSpaceId: string): string | null {
  const withValue = relations.filter(r => r.toEntity.value);

  const avatar = pickRelationBySpace(withValue, EntityId(ContentIds.AVATAR_PROPERTY), currentSpaceId);
  if (avatar?.spaceId === currentSpaceId) return avatar.toEntity.value;

  const cover = pickRelationBySpace(withValue, EntityId(SystemIds.COVER_PROPERTY), currentSpaceId);
  if (cover?.spaceId === currentSpaceId) return cover.toEntity.value;

  if (avatar) return avatar.toEntity.value;
  if (cover) return cover.toEntity.value;
  return null;
}
