import { IdUtils, Position, SystemIds } from '@geoprotocol/geo-sdk/lite';

import { ID } from '~/core/id';
import type { Mutator } from '~/core/sync/use-mutate';
import type { Relation } from '~/core/types';

const DEFAULT_SHOWN_COLUMNS: { id: string; name: string }[] = [
  { id: SystemIds.TYPES_PROPERTY, name: 'Types' },
  { id: SystemIds.DESCRIPTION_PROPERTY, name: 'Description' },
];

export function ensureRankingShownColumns({
  storage,
  blockRelationId,
  spaceId,
  relations,
}: {
  storage: Mutator;
  blockRelationId: string;
  spaceId: string;
  relations: Relation[];
}) {
  if (!blockRelationId) return;

  const existingShown = relations.filter(
    r =>
      (r.type.id === SystemIds.PROPERTIES || r.type.id === SystemIds.SHOWN_COLUMNS) &&
      ID.equals(r.fromEntity.id, blockRelationId) &&
      r.spaceId === spaceId &&
      !r.isDeleted
  );

  const sorted = [...existingShown].sort((a, b) => Position.compare(a.position ?? null, b.position ?? null));
  const last = sorted[sorted.length - 1]?.position;
  const lastStr = typeof last === 'string' && last.length > 0 ? last : null;

  let nextPosition = lastStr;

  for (const { id: propertyId, name: propertyName } of DEFAULT_SHOWN_COLUMNS) {
    if (existingShown.some(r => ID.equals(r.toEntity.id, propertyId))) continue;

    const position = Position.generateBetween(nextPosition, null) ?? Position.generate();
    nextPosition = position;

    storage.relations.set({
      id: IdUtils.generate(),
      entityId: IdUtils.generate(),
      spaceId,
      position,
      renderableType: 'RELATION',
      type: {
        id: SystemIds.PROPERTIES,
        name: 'Properties',
      },
      fromEntity: {
        id: blockRelationId,
        name: null,
      },
      toEntity: {
        id: propertyId,
        name: propertyName,
        value: propertyId,
      },
    });
  }
}
