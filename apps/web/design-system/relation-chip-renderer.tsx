'use client';

import { LinkableRelationChip } from './chip';
import { RelationWithIndex } from '~/core/utils/relations';

interface RelationChipRendererProps {
  relation: RelationWithIndex;
  spaceId: string;
  onDelete: () => void;
}

/**
 * Standardized renderer for relation chips with consistent props and behavior.
 * Centralizes the LinkableRelationChip usage pattern.
 */
export function RelationChipRenderer({ relation, spaceId, onDelete }: RelationChipRendererProps) {
  return (
    <LinkableRelationChip
      isEditing
      onDelete={onDelete}
      currentSpaceId={spaceId}
      entityId={relation.entityId}
      relationId={relation.relationId}
    >
      {relation.valueName ?? relation.value}
    </LinkableRelationChip>
  );
}