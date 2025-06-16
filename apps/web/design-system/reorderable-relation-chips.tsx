'use client';

import * as React from 'react';
import { Reorder, useDragControls } from 'framer-motion';

import { RelationRenderableProperty } from '~/core/types';
import { NavUtils } from '~/core/utils/utils';
import { LinkableRelationChip } from './chip';
import { useReorderableRelations } from '~/core/hooks/use-reorderable-relations';
import { RelationWithIndex } from '~/core/utils/relations';

interface ReorderableRelationChipsProps {
  relations: RelationRenderableProperty[];
  attributeId: string;
  attributeName: string | null;
  spaceId: string;
  onDeleteRelation: (relation: RelationRenderableProperty) => void;
}

export function ReorderableRelationChips({
  relations,
  attributeId,
  attributeName,
  spaceId,
  onDeleteRelation,
}: ReorderableRelationChipsProps) {
  const [isDragging, setIsDragging] = React.useState(false);
  
  const { sortedRelations, handleReorder, handleDrop, isReordering } = useReorderableRelations({
    relations,
    attributeId,
    attributeName,
    isDragging, // Pass dragging state to hook
  });
  const currentOrderRef = React.useRef<RelationWithIndex[]>(sortedRelations);

  React.useEffect(() => {
    console.log("new sortedRelations:", sortedRelations);
  }, [sortedRelations]);
  
  // Handle reorder event from framer-motion (UI only)
  const onReorder = React.useCallback((newOrder: RelationWithIndex[]) => {
    currentOrderRef.current = newOrder; // Track current order
    handleReorder(newOrder); // UI-only update
  }, [handleReorder]);

  // Handle drag end (database persistence)
  const onDragEnd = React.useCallback(() => {
    setIsDragging(false);
    handleDrop(currentOrderRef.current); // Database write with final order
  }, [handleDrop]);

  // Don't render reorder component if there's only one or no relations
  if (sortedRelations.length <= 1) {
    return (
      <>
        {sortedRelations.map(relation => (
          <LinkableRelationChip
            key={`relation-${relation.relationId}-${relation.value}`}
            isEditing
            onDelete={() => onDeleteRelation(relation)}
            entityHref={NavUtils.toEntity(spaceId, relation.value ?? '')}
            relationHref={NavUtils.toEntity(spaceId, relation.relationId)}
          >
            {relation.valueName ?? relation.value}
          </LinkableRelationChip>
        ))}
      </>
    );
  }

  return (
    <Reorder.Group
      axis="y"
      values={sortedRelations}
      onReorder={onReorder}
      className={`flex flex-col items-start gap-1 ${isReordering ? 'opacity-75 pointer-events-none' : ''}`}
    >
      {sortedRelations.map(relation => (
        <ReorderableChip
          key={relation.relationId}
          relation={relation}
          spaceId={spaceId}
          onDelete={() => onDeleteRelation(relation)}
          isReordering={isReordering}
          setIsDragging={setIsDragging}
          onDragEnd={onDragEnd}
        />
      ))}
    </Reorder.Group>
  );
}

interface ReorderableChipProps {
  relation: RelationWithIndex;
  spaceId: string;
  onDelete: () => void;
  isReordering?: boolean;
  setIsDragging: (isDragging: boolean) => void;
  onDragEnd: () => void;
}

function ReorderableChip({ relation, spaceId, onDelete, isReordering, setIsDragging, onDragEnd }: ReorderableChipProps) {
  const dragControls = useDragControls();
  const [isThisChipDragging, setIsThisChipDragging] = React.useState(false);

  return (
    <Reorder.Item
      drag
      value={relation}
      id={relation.relationId}
      dragListener={false}
      dragControls={dragControls}
      className="relative flex items-center"
      onDragStart={() => {
        setIsThisChipDragging(true);
        setIsDragging(true);
      }}
      onDragEnd={() => {
        setIsThisChipDragging(false);
        onDragEnd(); // Trigger database write
      }}
      whileDrag={{ 
        scale: 1.05,
        zIndex: 1,
        boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.15)',
      }}
      transition={{
        type: 'spring',
        stiffness: 300,
        damping: 30,
      }}
    >
      {/* Drag Handle */}
      <div
        className={`mr-1 flex items-center px-1 py-2 select-none ${
          isReordering 
            ? 'cursor-not-allowed text-grey-02 opacity-50' 
            : 'cursor-grab text-grey-03 hover:text-grey-04 active:cursor-grabbing'
        }`}
        onPointerDown={(e) => {
          if (isReordering) {
            return;
          }
          e.preventDefault();
          e.stopPropagation();
          dragControls.start(e);
        }}
        onMouseDown={(e) => {
          if (isReordering) {
            return;
          }
          e.preventDefault();
        }}
        onSelectStart={(e) => {
          e.preventDefault();
        }}
        style={{
          cursor: isReordering ? 'not-allowed' : (isThisChipDragging ? 'grabbing' : 'grab'),
          userSelect: 'none',
          WebkitUserSelect: 'none',
          msUserSelect: 'none',
        }}
      >
        <svg
          width="8"
          height="12"
          viewBox="0 0 8 12"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="h-3 w-2"
        >
          <circle cx="2" cy="2" r="1" fill="currentColor" />
          <circle cx="6" cy="2" r="1" fill="currentColor" />
          <circle cx="2" cy="6" r="1" fill="currentColor" />
          <circle cx="6" cy="6" r="1" fill="currentColor" />
          <circle cx="2" cy="10" r="1" fill="currentColor" />
          <circle cx="6" cy="10" r="1" fill="currentColor" />
        </svg>
      </div>

      {/* Chip Content */}
      <div
        style={{
          opacity: isThisChipDragging ? 0.8 : 1,
        }}
      >
        <LinkableRelationChip
          isEditing
          onDelete={onDelete}
          entityHref={NavUtils.toEntity(spaceId, relation.value ?? '')}
          relationHref={NavUtils.toEntity(spaceId, relation.relationId)}
        >
          {relation.valueName ?? relation.value}
        </LinkableRelationChip>
      </div>
    </Reorder.Item>
  );
}