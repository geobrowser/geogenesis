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
import { SystemIds } from '@graphprotocol/grc-20';
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
  collectionLength: number;
  pageNumber: number;
  pageSize: number;
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
  collectionLength,
  pageNumber,
  pageSize,
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

    const newList = arrayMove(entries, oldIndex, newIndex);

    newList.forEach((raw, index) => {
      const relation = relations.find(r => r.toEntity.id === raw.entityId);
      if (relation) onUpdateRelation(relation, entries[index].position ?? null);
    });

    setActiveId(null);
  };

  const handleMove = (newIndex: number, oldIndex: number) => {
    const newList = arrayMove(entries, oldIndex, newIndex);
    newList.forEach((raw, index) => {
      const relation = relations.find(r => r.toEntity.id === raw.entityId);
      if (relation) {
        onUpdateRelation(relation, entries[index].position ?? null);
      }
    });
  };

  if (entries.length <= 1) {
    <div className={cx('flex w-full flex-col', isEditing ? 'gap-10' : 'gap-4')}>
      {entries.map((row, index) => {
        return (
          <TableBlockListItem
            isEditing={isEditing}
            key={`${row.entityId}-${index}`}
            columns={row.columns}
            currentSpaceId={spaceId}
            rowEntityId={row.entityId}
            isPlaceholder={Boolean(row.placeholder)}
            onChangeEntry={onChangeEntry}
            onLinkEntry={onLinkEntry}
            properties={propertiesSchema}
            relationId={row.columns[SystemIds.NAME_PROPERTY]?.relationId}
            source={source}
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
  handleMove: (newIndex: number, oldIndex: number) => void;
  pageSize: number;
  pageNumber: number;
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

  let timeoutId: NodeJS.Timeout;

  const handleMouseEnter = () => {
    clearTimeout(timeoutId);
    setHovered(true);
  };

  const handleMouseLeave = () => {
    timeoutId = setTimeout(() => setHovered(false), 200);
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="relative inline-block"
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
      <div {...attributes} {...listeners} className="inline-flex items-center">
        <TableBlockListItem
          isEditing={isEditing}
          key={`${row.entityId}-grabbed`}
          columns={row.columns}
          currentSpaceId={spaceId}
          rowEntityId={row.entityId}
          isPlaceholder={Boolean(row.placeholder)}
          onChangeEntry={onChangeEntry}
          onLinkEntry={onLinkEntry}
          properties={properties}
          relationId={row.columns[SystemIds.NAME_PROPERTY]?.relationId}
          source={source}
        />
      </div>
    </div>
  );
};

export default TableBlockListItemsDnd;
