import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Position, SystemIds } from '@graphprotocol/grc-20';
import cx from 'classnames';

import React from 'react';

import { Source } from '~/core/blocks/data/source';
import { Property, Relation, Row } from '~/core/v2.types';

import { OrderDots } from '~/design-system/icons/order-dots';
import { PositionBox } from '~/design-system/position-box';

import { onChangeEntryFn, onLinkEntryFn } from './change-entry';
import { TableBlockListItem } from './table-block-list-item';

type TableBlockTablePropsDnd = {
  spaceId: string;
  propertiesSchema?: Record<string, Property>;
  onChangeEntry: onChangeEntryFn;
  onLinkEntry: onLinkEntryFn;
  source: Source;
  entries: Row[];
  isEditing: boolean;
  onUpdateRelation: (relation: Relation, newPosition: string | null) => void;
  relations: Relation[];
  collectionRelations: Relation[];
  collectionLength: number;
  pageNumber: number;
  pageSize: number;
  shouldAutoFocusPlaceholder?: boolean;
};

const TableBlockListItemsDnd = ({
  entries,
  isEditing,
  spaceId,
  onChangeEntry,
  onLinkEntry,
  propertiesSchema,
  source,
  onUpdateRelation,
  relations,
  collectionRelations,
  collectionLength,
  pageNumber,
  pageSize,
  shouldAutoFocusPlaceholder = false,
}: TableBlockTablePropsDnd) => {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const [activeId, setActiveId] = React.useState<string | null>(null);

  const activeRow = activeId ? entries.find(r => r?.entityId === activeId) : null;

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active?.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active?.id === over?.id) return;

    const oldIndex = entries.findIndex(r => r?.entityId === active?.id);
    const newIndex = entries.findIndex(r => r?.entityId === over?.id);

    // Only update the items between oldIndex and newIndex (inclusive)
    const minIndex = Math.min(oldIndex, newIndex);
    const maxIndex = Math.max(oldIndex, newIndex);

    const newList = arrayMove(entries, oldIndex, newIndex);

    // Only update positions for items that actually moved
    for (let i = minIndex; i <= maxIndex; i++) {
      const raw = newList[i];
      const relation = relations.find(r => r.toEntity.id === raw.entityId);
      const targetPosition = entries[i].position ?? null;

      if (relation) onUpdateRelation(relation, targetPosition);
    }

    setActiveId(null);
  };

  const handleMove = (targetPosition: number, currentPosition?: number) => {
    if (currentPosition !== undefined) {
      // Position-based move (from typing): both targetPosition and currentPosition are 1-based global positions
      const currentPageIndex = currentPosition - pageNumber * pageSize - 1;
      const currentRow = entries[currentPageIndex];

      if (!currentRow) {
        return;
      }

      const movingRelation = collectionRelations.find(r => r.toEntity.id === currentRow?.entityId);

      if (!movingRelation) {
        return;
      }

      // Sort all collection relations by position
      const allSortedRelations = [...collectionRelations].sort((a, b) =>
        Position.compare(a.position ?? null, b.position ?? null)
      );

      // Find the current position of the moving item in the sorted list
      const currentSortedIndex = allSortedRelations.findIndex(r => r.id === movingRelation.id);

      if (currentSortedIndex === -1) return;

      // Create a reordered array by moving the item to the new position (like drag-and-drop)
      const targetIndex = Math.max(0, Math.min(targetPosition - 1, allSortedRelations.length - 1));
      const reorderedRelations = [...allSortedRelations];

      // Remove the moving item and insert it at the target position
      const [movingItem] = reorderedRelations.splice(currentSortedIndex, 1);
      reorderedRelations.splice(targetIndex, 0, movingItem);

      // Update positions for affected items (like drag-and-drop does)
      const minIndex = Math.min(currentSortedIndex, targetIndex);
      const maxIndex = Math.max(currentSortedIndex, targetIndex);

      for (let i = minIndex; i <= maxIndex; i++) {
        const relationToUpdate = reorderedRelations[i];
        const newPosition = allSortedRelations[i]?.position ?? null;
        onUpdateRelation(relationToUpdate, newPosition);
      }
    } else {
      // Drag-and-drop move: targetPosition is the new page index (0-based)
      const oldIndex = entries.findIndex(r => r?.entityId === activeId);
      const newIndex = targetPosition;

      if (oldIndex === -1) return;

      // Only update the items between oldIndex and newIndex (inclusive)
      const minIndex = Math.min(oldIndex, newIndex);
      const maxIndex = Math.max(oldIndex, newIndex);

      const newList = arrayMove(entries, oldIndex, newIndex);

      // Only update positions for items that actually moved
      for (let i = minIndex; i <= maxIndex; i++) {
        const raw = newList[i];
        const relation = relations.find(r => r.toEntity.id === raw.entityId);
        if (relation) {
          onUpdateRelation(relation, entries[i].position ?? null);
        }
      }
    }
  };

  if (entries.length <= 1) {
    <div className={cx('flex w-full flex-col', isEditing ? 'gap-10' : 'gap-4')}>
      {entries.map((row, index) => {
        const isPlaceholder = Boolean(row.placeholder);

        return (
          <TableBlockListItem
            isEditing={isEditing}
            key={`${row.entityId}-${index}`}
            columns={row.columns}
            currentSpaceId={spaceId}
            rowEntityId={row.entityId}
            isPlaceholder={isPlaceholder}
            onChangeEntry={onChangeEntry}
            onLinkEntry={onLinkEntry}
            properties={propertiesSchema}
            relationId={row.columns[SystemIds.NAME_PROPERTY]?.relationId}
            source={source}
            autoFocus={isPlaceholder && shouldAutoFocusPlaceholder}
          />
        );
      })}
    </div>;
  }
  return (
    <div className={cx('flex w-full flex-col', isEditing ? 'gap-10' : 'gap-4')}>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={entries.map(r => r.entityId)} strategy={verticalListSortingStrategy}>
          <div className={`flex flex-col gap-4`}>
            {entries.map((row, index: number) => {
              return (
                <SortableItem
                  isEditing={isEditing}
                  key={`${row.entityId}-${index}`}
                  spaceId={spaceId}
                  onChangeEntry={onChangeEntry}
                  onLinkEntry={onLinkEntry}
                  properties={propertiesSchema}
                  source={source}
                  row={row}
                  position={index}
                  totalEntries={collectionLength}
                  pageSize={pageSize}
                  handleMove={handleMove}
                  pageNumber={pageNumber}
                  shouldAutoFocusPlaceholder={shouldAutoFocusPlaceholder}
                />
              );
            })}
          </div>
        </SortableContext>

        <DragOverlay>
          {activeId && activeRow ? (
            <div className="relative inline-block" style={{ cursor: 'grabbing' }}>
              <div className="absolute -left-5 flex h-full items-center justify-center">
                <OrderDots color="#B6B6B6" />
              </div>

              <TableBlockListItem
                isEditing={isEditing}
                key={`${activeRow.entityId}-${activeId}-grab`}
                columns={activeRow.columns}
                currentSpaceId={spaceId}
                rowEntityId={activeRow.entityId}
                isPlaceholder={Boolean(activeRow.placeholder)}
                onChangeEntry={onChangeEntry}
                onLinkEntry={onLinkEntry}
                properties={propertiesSchema}
                relationId={activeRow.columns[SystemIds.NAME_PROPERTY]?.relationId}
                source={source}
              />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
};

const SortableItem = ({
  spaceId,
  source,
  onChangeEntry,
  onLinkEntry,
  properties,
  isEditing,
  row,
  position,
  totalEntries,
  handleMove,
  pageSize,
  pageNumber,
  shouldAutoFocusPlaceholder = false,
}: {
  row: Row;
  spaceId: string;
  source: Source;
  onChangeEntry: onChangeEntryFn;
  onLinkEntry: onLinkEntryFn;
  properties?: Record<string, Property>;
  isEditing: boolean;
  position: number;
  totalEntries: number;
  handleMove: (targetPosition: number, currentPosition?: number) => void;
  pageSize: number;
  pageNumber: number;
  shouldAutoFocusPlaceholder?: boolean;
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: row.entityId,
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0 : 1,
    zIndex: isDragging ? 1000 : 'auto',
  };

  const [justDragged, setJustDragged] = React.useState(false);
  const [hovered, setHovered] = React.useState(false);
  const timeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // Cleanup timeout on unmount
  React.useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const handleClick = (e: React.MouseEvent) => {
    // Prevent navigation if we just finished dragging
    if (justDragged) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  const handleMouseEnter = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setHovered(true);
  };

  const handleMouseLeave = () => {
    timeoutRef.current = setTimeout(() => setHovered(false), 200);
  };

  const isPlaceholder = Boolean(row.placeholder);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="relative"
      onClick={handleClick}
      onClickCapture={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {hovered && isEditing && (
        <PositionBox
          handleMove={handleMove}
          position={position + 1}
          totalEntries={totalEntries}
          pageSize={pageSize}
          pageNumber={pageNumber}
          className="-left-[152px] h-full items-center"
        />
      )}
      <div {...attributes} {...listeners} className="flex items-center">
        <TableBlockListItem
          isEditing={isEditing}
          key={`${row.entityId}-grabbed`}
          columns={row.columns}
          currentSpaceId={spaceId}
          rowEntityId={row.entityId}
          isPlaceholder={isPlaceholder}
          onChangeEntry={onChangeEntry}
          onLinkEntry={onLinkEntry}
          properties={properties}
          relationId={row.columns[SystemIds.NAME_PROPERTY]?.relationId}
          source={source}
          autoFocus={isPlaceholder && shouldAutoFocusPlaceholder}
        />
      </div>
    </div>
  );
};

export default TableBlockListItemsDnd;
