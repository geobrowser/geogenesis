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
  onUpdateRelation: (relation: Relation, newPosition: string | null) => void;
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

  const activeRelation = activeId ? sortedRelations.find(r => r?.id === activeId) : null;

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active?.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active?.id === over?.id) return;

    const oldIndex = sortedRelations.findIndex(r => r?.id === active?.id);
    const newIndex = sortedRelations.findIndex(r => r?.id === over?.id);

    const newList = arrayMove(sortedRelations, oldIndex, newIndex);

    newList.forEach((relation, index) => {
      onUpdateRelation(relation, sortedRelations[index].position ?? null);
    });
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
        <div className={`flex flex-wrap gap-2`}>
          {sortedRelations.map(relation => (
            <SortableRelationChip key={relation?.id} relation={relation} spaceId={spaceId} />
          ))}
        </div>
      </SortableContext>

      <DragOverlay>
        {activeId && activeRelation ? (
          <div className="inline-block" style={{ cursor: 'grabbing' }}>
            <LinkableRelationChip
              isEditing
              onDelete={() => {}}
              currentSpaceId={spaceId}
              entityId={activeRelation.toEntity?.id}
              relationId={activeRelation?.id}
              relationEntityId={activeRelation.entityId}
              spaceId={activeRelation.toSpaceId}
              verified={activeRelation.verified}
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
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0 : 1,
    zIndex: isDragging ? 1000 : 'auto',
  };

  const { storage } = useMutate();
  const [justDragged, setJustDragged] = React.useState(false);

  // Track when dragging ends to prevent click events
  React.useEffect(() => {
    if (isDragging) {
      setJustDragged(true);
    } else if (justDragged) {
      // Keep justDragged true for a short time after drag ends
      const timeout = setTimeout(() => setJustDragged(false), 200);
      return () => clearTimeout(timeout);
    }
  }, [isDragging, justDragged]);

  const handleClick = (e: React.MouseEvent) => {
    // Prevent navigation if we just finished dragging
    if (justDragged) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="relative inline-block"
      onClick={handleClick}
      onClickCapture={handleClick}
    >
      <div {...attributes} {...listeners} className="inline-flex items-center">
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
    </div>
  );
}
