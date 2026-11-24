import type { Value } from '~/core/types';
import { Entities } from '~/core/utils/entity';
import { normId } from '~/core/utils/norm-id';

import type { GraphCentre } from './graph-entity';

/**
 * The centre's name and description as `spaceId` wrote them, by the same rule as an entity page
 * pinned to that space: the name falls back across spaces, the description does not.
 */
export function centreTextInSpace(
  centre: GraphCentre,
  spaceId: string | null
): { name: string | null; description: string | null } {
  if (!spaceId) return { name: centre.name, description: centre.description };
  const values: Value[] = centre.texts.map((text, index) => ({
    id: `${centre.id}:${index}`,
    entity: { id: centre.id, name: null },
    property: { id: text.propertyId, name: null, dataType: 'TEXT' },
    value: text.text,
    spaceId: text.spaceId,
  }));
  const space = normId(spaceId);
  return {
    name: Entities.nameInSpace(values, space) ?? centre.name,
    description: Entities.descriptionInSpace(values, space),
  };
}
