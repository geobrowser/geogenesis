import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Position } from '@graphprotocol/grc-20';

import React from 'react';

import { useMutate } from '~/core/sync/use-mutate';
import { sortRelations } from '~/core/utils/utils';
import { Relation } from '~/core/v2.types';

import { LinkableRelationChip } from './chip';

export default function ReorderableRelationChipsDnd({
  relations,
  onUpdateRelation,
  spaceId,
}: {
  relations: Relation[];
  onUpdateRelation: (relation: Relation, newPosition: string) => void;
  spaceId: string;
}) {
  const { storage } = useMutate();

  const sortedRelations = sortRelations(relations);

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

  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [isDragging, setIsDragging] = React.useState(false);

  const activeRelation = activeId ? sortedRelations.find(r => r?.id === activeId) : null;

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active?.id as string);
    setIsDragging(true);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active?.id === over?.id) return;

    const oldIndex = sortedRelations.findIndex(r => r?.id === active?.id);
    const newIndex = sortedRelations.findIndex(r => r?.id === over?.id);

    const moved = sortedRelations[oldIndex];

    const newList = arrayMove(sortedRelations, oldIndex, newIndex);

    const idx = newList.findIndex(r => r?.id === moved?.id);
    const before = newList[idx - 1]?.position ?? null;
    const after = newList[idx + 1]?.position ?? null;

    const newPos = Position.generateBetween(before, after);

    onUpdateRelation(moved, newPos);

    setIsDragging(false);
    setActiveId(null);
  };

  // Don't render reorder component if there's only one or no relations
  if (sortedRelations.length <= 1) {
    return (
      <>
        {sortedRelations.map(relation => (
          <LinkableRelationChip
            key={`relation-${relation.id}`}
            isEditing
            onDelete={() => storage.relations.delete(relation)}
            onDone={result => {
              storage.relations.update(relation, draft => {
                draft.toSpaceId = result.space;
                draft.verified = result.verified;
              });
            }}
            currentSpaceId={spaceId}
            entityId={relation.toEntity.id}
            relationId={relation.id}
            relationEntityId={relation.entityId}
            spaceId={relation.toSpaceId}
            verified={relation.verified}
          >
            {relation.toEntity.name}
          </LinkableRelationChip>
        ))}
      </>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={sortedRelations.map(r => r.id)} strategy={horizontalListSortingStrategy}>
        <div className={`flex gap-2 overflow-x-auto`}>
          {sortedRelations.map(relation => (
            <SortableRelationChip key={relation?.id} relation={relation} spaceId={spaceId} />
          ))}
        </div>
      </SortableContext>

      <DragOverlay>
        {activeId && activeRelation ? (
          <div style={{ cursor: 'grabbing' }}>
            <LinkableRelationChip
              isEditing
              onDelete={() => {}}
              currentSpaceId={spaceId}
              entityId={activeRelation.toEntity?.id}
              relationId={activeRelation?.id}
              relationEntityId={activeRelation.entityId}
              spaceId={activeRelation.toSpaceId}
            >
              {activeRelation.toEntity.name}
            </LinkableRelationChip>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

interface SortableRelationChipProps {
  relation: Relation;
  spaceId: string;
}

function SortableRelationChip({ relation, spaceId }: SortableRelationChipProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: relation.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0 : 1,
  };

  const { storage } = useMutate();

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="relative flex items-center text-green"
    >
      <LinkableRelationChip
        isEditing
        onDelete={() => storage.relations.delete(relation)}
        currentSpaceId={spaceId}
        entityId={relation.toEntity.id}
        relationId={relation.id}
        relationEntityId={relation.entityId}
        spaceId={relation.toSpaceId}
        verified={relation.verified}
      >
        {relation.toEntity.name}
      </LinkableRelationChip>
    </div>
  );
}
