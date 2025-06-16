'use client';

import { NavUtils } from '~/core/utils/utils';
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
      entityHref={NavUtils.toEntity(spaceId, relation.value ?? '')}
      relationHref={NavUtils.toEntity(spaceId, relation.relationId)}
    >
      {relation.valueName ?? relation.value}
    </LinkableRelationChip>
  );
}