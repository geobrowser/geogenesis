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
import { SortableContext, arrayMove, rectSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { SystemIds } from '@graphprotocol/grc-20';
import cx from 'classnames';

import React from 'react';

import { Source } from '~/core/blocks/data/source';
import { Property, Relation, Row } from '~/core/v2.types';

import { onChangeEntryFn, onLinkEntryFn } from './change-entry';
import { TableBlockGalleryItem } from './table-block-gallery-item';

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
};

const TableBlockGalleryItemsDnd = ({
  entries,
  isEditing,
  spaceId,
  onChangeEntry,
  onLinkEntry,
  propertiesSchema,
  source,
  onUpdateRelation,
  relations,
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

  if (entries.length <= 1) {
    <div className={cx('flex w-full flex-col', isEditing ? 'gap-10' : 'gap-4')}>
      {entries.map((row, index) => {
        return (
          <TableBlockGalleryItem
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
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={entries.map(r => r.entityId)} strategy={rectSortingStrategy}>
        <div className="grid grid-cols-3 gap-x-4 gap-y-10 sm:grid-cols-2">
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
              />
            );
          })}
        </div>
      </SortableContext>

      <DragOverlay>
        {activeId && activeRow ? (
          <div className="" style={{ cursor: 'grabbing' }}>
            <TableBlockGalleryItem
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
}: {
  row: Row;
  spaceId: string;
  source: Source;
  onChangeEntry: onChangeEntryFn;
  onLinkEntry: onLinkEntryFn;
  properties?: Record<string, Property>;
  isEditing: boolean;
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
      <div {...attributes} {...listeners} className="">
        <TableBlockGalleryItem
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

export default TableBlockGalleryItemsDnd;
