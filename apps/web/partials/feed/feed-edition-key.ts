import { normId } from '~/core/utils/norm-id';

/** One feed card: an entity as it stands in one space. */
export function feedEditionKey(spaceId: string, entityId: string): string {
  return `${normId(spaceId)}:${normId(entityId)}`;
}
