import { ID } from '~/core/id';
import { geoCallPageCallId } from '~/core/space-calls/routes';
import type { Relation } from '~/core/types';

/** A URL a video element can play. A Geo call page (a published call's recording link) is not one. */
export const isPlayableVideoUrl = (value: string) =>
  (value.startsWith('ipfs://') || value.startsWith('http')) && geoCallPageCallId(value) === null;

export function getRelationVideoUrls(relations: Relation[], propertyId: string): string[] {
  return relations
    .filter(relation => ID.equals(relation.type.id, propertyId))
    .map(relation => relation.toEntity.value)
    .filter(isPlayableVideoUrl);
}
