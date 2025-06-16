'use client';

import { RelationRenderableProperty } from '~/core/types';
import { RelationWithIndex } from '~/core/utils/relations';
import { RelationChipRenderer } from './relation-chip-renderer';

interface StaticRelationChipsProps {
  relations: RelationWithIndex[];
  spaceId: string;
  onDeleteRelation: (relation: RelationRenderableProperty) => void;
}

/**
 * Renders relation chips in a static (non-reorderable) layout.
 * Used as fallback when there's only one relation or when reordering is not needed.
 */
export function StaticRelationChips({ relations, spaceId, onDeleteRelation }: StaticRelationChipsProps) {
  return (
    <>
      {relations.map(relation => (
        <RelationChipRenderer
          key={`relation-${relation.relationId}-${relation.value}`}
          relation={relation}
          spaceId={spaceId}
          onDelete={() => onDeleteRelation(relation)}
        />
      ))}
    </>
  );
}