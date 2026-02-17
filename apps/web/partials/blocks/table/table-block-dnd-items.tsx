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
import { SortableContext, arrayMove, useSortable } from '@dnd-kit/sortable';
import type { SortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Position, SystemIds } from '@geoprotocol/geo-sdk';

import React from 'react';

import { Source } from '~/core/blocks/data/source';
import { Property, Relation, Row } from '~/core/types';

import { PositionBox } from '~/design-system/position-box';

import { onChangeEntryFn, onLinkEntryFn } from './change-entry';

export type RenderItemProps = {
  row: Row;
  isEditing: boolean;
  spaceId: string;
  onChangeEntry: onChangeEntryFn;
  onLinkEntry: onLinkEntryFn;
  properties?: Record<string, Property>;
  source: Source;
  isPlaceholder: boolean;
  autoFocus?: boolean;
};

export type DndItemsConfig = {
  sortingStrategy: SortingStrategy;
  outerClassName?: string | ((isEditing: boolean) => string);
  itemsClassName: string;
  sortableItemClassName: string;
  sortableItemInnerClassName: string;
  positionBoxClassName: string;
  positionBoxIconClassName?: string;
  renderItem: (props: RenderItemProps) => React.ReactNode;
  renderDragOverlay: (props: RenderItemProps) => React.ReactNode;
};

export type TableBlockDndItemsProps = {
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
  config: DndItemsConfig;
};

export const TableBlockDndItems = ({
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
  config,
}: TableBlockDndItemsProps) => {
  const placeholderEntries = entries.filter(r => r.placeholder);
  const sortableEntries = entries.filter(r => !r.placeholder);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const [activeId, setActiveId] = React.useState<string | null>(null);

  const activeRow = activeId ? sortableEntries.find(r => r?.entityId === activeId) : null;

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active?.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active?.id === over?.id) return;

    const oldIndex = sortableEntries.findIndex(r => r?.entityId === active?.id);
    const newIndex = sortableEntries.findIndex(r => r?.entityId === over?.id);

    const minIndex = Math.min(oldIndex, newIndex);
    const maxIndex = Math.max(oldIndex, newIndex);

    const newList = arrayMove(sortableEntries, oldIndex, newIndex);

    for (let i = minIndex; i <= maxIndex; i++) {
      const raw = newList[i];
      const relation = relations.find(r => r.toEntity.id === raw.entityId);
      if (relation) {
        onUpdateRelation(relation, sortableEntries[i].position ?? null);
      }
    }

    setActiveId(null);
  };

  const handleMove = (targetPosition: number, currentPosition?: number) => {
    if (currentPosition !== undefined) {
      const currentPageIndex = currentPosition - pageNumber * pageSize - 1;
      const currentRow = sortableEntries[currentPageIndex];

      if (!currentRow) return;

      const movingRelation = collectionRelations.find(r => r.toEntity.id === currentRow?.entityId);

      if (!movingRelation) return;

      const allSortedRelations = [...collectionRelations].sort((a, b) =>
        Position.compare(a.position ?? null, b.position ?? null)
      );

      const currentSortedIndex = allSortedRelations.findIndex(r => r.id === movingRelation.id);

      if (currentSortedIndex === -1) return;

      const targetIndex = Math.max(0, Math.min(targetPosition - 1, allSortedRelations.length - 1));
      const reorderedRelations = [...allSortedRelations];

      const [movingItem] = reorderedRelations.splice(currentSortedIndex, 1);
      reorderedRelations.splice(targetIndex, 0, movingItem);

      const minIndex = Math.min(currentSortedIndex, targetIndex);
      const maxIndex = Math.max(currentSortedIndex, targetIndex);

      for (let i = minIndex; i <= maxIndex; i++) {
        const relationToUpdate = reorderedRelations[i];
        const newPosition = allSortedRelations[i]?.position ?? null;
        onUpdateRelation(relationToUpdate, newPosition);
      }
    } else {
      const oldIndex = sortableEntries.findIndex(r => r?.entityId === activeId);
      const newIndex = targetPosition;

      if (oldIndex === -1) return;

      const minIndex = Math.min(oldIndex, newIndex);
      const maxIndex = Math.max(oldIndex, newIndex);

      const newList = arrayMove(sortableEntries, oldIndex, newIndex);

      for (let i = minIndex; i <= maxIndex; i++) {
        const raw = newList[i];
        const relation = relations.find(r => r.toEntity.id === raw.entityId);
        if (relation) {
          onUpdateRelation(relation, sortableEntries[i].position ?? null);
        }
      }
    }
  };

  const sharedItemProps = {
    isEditing,
    spaceId,
    onChangeEntry,
    onLinkEntry,
    properties: propertiesSchema,
    source,
  };

  const resolvedOuterClassName =
    typeof config.outerClassName === 'function' ? config.outerClassName(isEditing) : config.outerClassName;

  const isCollection = source.type === 'COLLECTION';

  const items = (
    <div className={config.itemsClassName}>
      {placeholderEntries.map((row, index) => (
        <React.Fragment key={`${row.entityId}-placeholder-${index}`}>
          {config.renderItem({
            ...sharedItemProps,
            row,
            isPlaceholder: true,
            autoFocus: shouldAutoFocusPlaceholder,
          })}
        </React.Fragment>
      ))}
      {sortableEntries.map((row, index: number) =>
        isCollection ? (
          <SortableItem
            key={`${row.entityId}-${index}`}
            row={row}
            isEditing={isEditing}
            position={index}
            totalEntries={collectionLength}
            handleMove={handleMove}
            pageSize={pageSize}
            pageNumber={pageNumber}
            config={config}
            sharedItemProps={sharedItemProps}
          />
        ) : (
          <React.Fragment key={`${row.entityId}-${index}`}>
            {config.renderItem({
              ...sharedItemProps,
              row,
              isPlaceholder: false,
            })}
          </React.Fragment>
        )
      )}
    </div>
  );

  const content = isCollection ? (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={sortableEntries.map(r => r.entityId)} strategy={config.sortingStrategy}>
        {items}
      </SortableContext>

      <DragOverlay>
        {activeId && activeRow
          ? config.renderDragOverlay({
              ...sharedItemProps,
              row: activeRow,
              isPlaceholder: Boolean(activeRow.placeholder),
            })
          : null}
      </DragOverlay>
    </DndContext>
  ) : (
    items
  );

  if (resolvedOuterClassName !== undefined) {
    return <div className={resolvedOuterClassName}>{content}</div>;
  }

  return content;
};

type SharedItemProps = {
  isEditing: boolean;
  spaceId: string;
  onChangeEntry: onChangeEntryFn;
  onLinkEntry: onLinkEntryFn;
  properties?: Record<string, Property>;
  source: Source;
};

const SortableItem = ({
  row,
  isEditing,
  position,
  totalEntries,
  handleMove,
  pageSize,
  pageNumber,
  config,
  sharedItemProps,
}: {
  row: Row;
  isEditing: boolean;
  position: number;
  totalEntries: number;
  handleMove: (targetPosition: number, currentPosition?: number) => void;
  pageSize: number;
  pageNumber: number;
  config: DndItemsConfig;
  sharedItemProps: SharedItemProps;
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: row.entityId,
  });

  const [hovered, setHovered] = React.useState(false);
  const timeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0 : 1,
    zIndex: isDragging ? 1000 : 'auto',
  };

  const [justDragged, setJustDragged] = React.useState(false);

  React.useEffect(() => {
    if (isDragging) {
      setJustDragged(true);
    } else if (justDragged) {
      const timeout = setTimeout(() => setJustDragged(false), 200);
      return () => clearTimeout(timeout);
    }
  }, [isDragging, justDragged]);

  React.useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const handleClick = (e: React.MouseEvent) => {
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

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={config.sortableItemClassName}
      onClick={handleClick}
      onClickCapture={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div {...attributes} {...listeners} className={config.sortableItemInnerClassName}>
        {hovered && isEditing && (
          <PositionBox
            handleMove={handleMove}
            position={position + 1}
            totalEntries={totalEntries}
            pageSize={pageSize}
            pageNumber={pageNumber}
            className={config.positionBoxClassName}
            iconClassName={config.positionBoxIconClassName}
          />
        )}
        {config.renderItem({
          ...sharedItemProps,
          row,
          isPlaceholder: false,
        })}
      </div>
    </div>
  );
};
