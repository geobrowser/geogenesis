import { ID } from '~/core/id';
import type { Relation } from '~/core/types';

export const isPlayableVideoUrl = (value: string) => value.startsWith('ipfs://') || value.startsWith('http');

export function getRelationVideoUrls(relations: Relation[], propertyId: string): string[] {
  return relations
    .filter(relation => ID.equals(relation.type.id, propertyId))
    .map(relation => relation.toEntity.value)
    .filter(isPlayableVideoUrl);
}
