import { IdUtils, Position, SystemIds } from '@geoprotocol/geo-sdk/lite';

import { SCORE_SYSTEM_PROPERTY } from '~/core/constants';
import { ID } from '~/core/id';
import type { Mutator } from '~/core/sync/use-mutate';
import type { Relation } from '~/core/types';

import { columnPropertyIdFromRelation, isShownColumnRelationType } from './shown-column-relations';

export function ensureScoreShownColumn({
  storage,
  blockRelationId,
  spaceId,
  scoreDismissed,
  relationsIncludingDeleted,
}: {
  storage: Mutator;
  blockRelationId: string;
  spaceId: string;
  scoreDismissed: boolean;
  relationsIncludingDeleted: Relation[];
}) {
  if (!blockRelationId) return;
  if (scoreDismissed) return;

  const scoreColumnRelations = relationsIncludingDeleted.filter(
    r =>
      isShownColumnRelationType(r.type.id) &&
      ID.equals(r.fromEntity.id, blockRelationId) &&
      r.spaceId === spaceId &&
      ID.equals(columnPropertyIdFromRelation(r), SCORE_SYSTEM_PROPERTY)
  );

  if (scoreColumnRelations.length > 0) return;

  const existingShown = relationsIncludingDeleted
    .filter(
      r =>
        isShownColumnRelationType(r.type.id) &&
        ID.equals(r.fromEntity.id, blockRelationId) &&
        r.spaceId === spaceId &&
        !r.isDeleted
    )
    .sort((a, b) => Position.compare(a.position ?? null, b.position ?? null));

  // Prefer inserting after Description/Types so Score sits with the default properties.
  const preferredAnchorIds = [SystemIds.TYPES_PROPERTY, SystemIds.DESCRIPTION_PROPERTY];
  let left: string | null = null;
  let right: string | null = null;

  for (const anchorId of preferredAnchorIds) {
    const idx = existingShown.findIndex(r => ID.equals(columnPropertyIdFromRelation(r), anchorId));
    if (idx === -1) continue;
    left = typeof existingShown[idx].position === 'string' ? (existingShown[idx].position as string) : null;
    const next = existingShown[idx + 1];
    right = typeof next?.position === 'string' ? (next.position as string) : null;
    break;
  }

  if (left === null && existingShown.length > 0) {
    const last = existingShown[existingShown.length - 1]?.position;
    left = typeof last === 'string' && last.length > 0 ? last : null;
  }

  const position = Position.generateBetween(left, right) ?? Position.generate();

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
      id: SCORE_SYSTEM_PROPERTY,
      name: 'Score',
      value: SCORE_SYSTEM_PROPERTY,
    },
  });
}
