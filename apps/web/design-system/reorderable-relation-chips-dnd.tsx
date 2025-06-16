'use client';

import * as React from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  DragStartEvent,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
} from '@dnd-kit/sortable';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import { ReorderableRelationChipsProps } from '~/core/types/reorderable-relations';
import { useReorderableRelations } from '~/core/hooks/use-reorderable-relations';
import { RelationWithIndex } from '~/core/utils/relations';
import { StaticRelationChips } from './static-relation-chips';
import { RelationChipRenderer } from './relation-chip-renderer';

interface SortableRelationChipProps {
  relation: RelationWithIndex;
  spaceId: string;
  onDelete: () => void;
}

function SortableRelationChip({ relation, spaceId, onDelete }: SortableRelationChipProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: relation.relationId });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div 
      ref={setNodeRef} 
      style={style} 
      {...attributes} 
      {...listeners}
      className="relative flex items-center"
    >
      <RelationChipRenderer
        relation={relation}
        spaceId={spaceId}
        onDelete={onDelete}
      />
    </div>
  );
}

export function ReorderableRelationChipsDnd({
  relations,
  spaceId,
  onDeleteRelation,
}: ReorderableRelationChipsProps) {
  const [activeId, setActiveId] = React.useState<string | null>(null);
  
  const { sortedRelations, handleReorder, handleDrop, isReordering } = useReorderableRelations({
    relations,
  });
  const currentOrderRef = React.useRef<RelationWithIndex[]>(sortedRelations);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // Prevent accidental drags
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    
    if (active.id !== over?.id && over) {
      const oldIndex = sortedRelations.findIndex((r) => r.relationId === active.id);
      const newIndex = sortedRelations.findIndex((r) => r.relationId === over.id);
      
      if (oldIndex !== -1 && newIndex !== -1) {
        const newOrder = arrayMove(sortedRelations, oldIndex, newIndex);
        currentOrderRef.current = newOrder;
        handleReorder(newOrder);
      }
    }
    
    setActiveId(null);
    handleDrop(currentOrderRef.current);
  };

  const activeRelation = activeId 
    ? sortedRelations.find(r => r.relationId === activeId) 
    : null;

  // Don't render reorder component if there's only one or no relations
  if (sortedRelations.length <= 1) {
    return (
      <StaticRelationChips
        relations={sortedRelations}
        spaceId={spaceId}
        onDeleteRelation={onDeleteRelation}
      />
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={sortedRelations.map(r => r.relationId)}
        strategy={rectSortingStrategy}
      >
        <div className={`flex flex-wrap gap-2 ${isReordering ? 'opacity-75 pointer-events-none' : ''}`}>
          {sortedRelations.map(relation => (
            <SortableRelationChip
              key={relation.relationId}
              relation={relation}
              spaceId={spaceId}
              onDelete={() => onDeleteRelation(relation)}
            />
          ))}
        </div>
      </SortableContext>
      
      <DragOverlay>
        {activeId && activeRelation ? (
          <div style={{ cursor: 'grabbing' }}>
            <RelationChipRenderer
              relation={activeRelation}
              spaceId={spaceId}
              onDelete={() => {}}
            />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}