'use client';

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
import { Position, SystemIds } from '@geoprotocol/geo-sdk';
import cx from 'classnames';

import React from 'react';

import { Source } from '~/core/blocks/data/source';
import { useMutate } from '~/core/sync/use-mutate';
import { useSpaceAwareValue } from '~/core/sync/use-store';
import { Cell, Property, Relation, Row } from '~/core/types';
import { NavUtils } from '~/core/utils/utils';

import { PageStringField } from '~/design-system/editable-fields/editable-fields';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';
import { SelectEntity } from '~/design-system/select-entity';

import type { onChangeEntryFn, onLinkEntryFn } from '~/partials/blocks/table/change-entry';
import { CollectionMetadata } from '~/partials/blocks/table/collection-metadata';

type Props = {
  columns: Record<string, Cell>;
  currentSpaceId: string;
  isEditing: boolean;
  rowEntityId: string;
  isPlaceholder: boolean;
  onChangeEntry: onChangeEntryFn;
  onLinkEntry: onLinkEntryFn;
  properties?: Record<string, Property>;
  relationId?: string;
  source: Source;
  autoFocus?: boolean;
};

export function TableBlockBulletedListItemDnd({
  entries,
  isEditing,
  spaceId,
  onChangeEntry,
  onLinkEntry,
  propertiesSchema,
  source,
  autoFocus,
  relations,
  onUpdateRelation,
  pageNumber,
}: {
  entries: Row[];
  isEditing: boolean;
  spaceId: string;
  onChangeEntry: onChangeEntryFn;
  onLinkEntry: onLinkEntryFn;
  propertiesSchema?: Record<string, Property>;
  onUpdateRelation: (relation: Relation, newPosition: string | null) => void;
  source: Source;
  autoFocus?: boolean;
  relations: Relation[];
  pageNumber: number;
}) {
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

  if (entries.length === 1) {
    return (
      <div className="flex w-full flex-col">
        {entries.map((row, index: number) => {
          const isPlaceholder = Boolean(row.placeholder);

          return (
            <TableBlockBulletedListItem
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
              autoFocus={isPlaceholder && autoFocus}
            />
          );
        })}
      </div>
    );
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
          <div className={`flex w-full flex-col`}>
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
                  pageNumber={pageNumber}
                  shouldAutoFocusPlaceholder={false}
                />
              );
            })}
          </div>
        </SortableContext>

        <DragOverlay>
          {activeId && activeRow ? (
            <div className="relative inline-block" style={{ cursor: 'grabbing' }}>
              <TableBlockBulletedListItem
                isEditing={isEditing}
                key={`${activeRow.entityId}`}
                columns={activeRow.columns}
                currentSpaceId={spaceId}
                rowEntityId={activeRow.entityId}
                isPlaceholder={false}
                onChangeEntry={onChangeEntry}
                onLinkEntry={onLinkEntry}
                properties={propertiesSchema}
                relationId={activeRow.columns[SystemIds.NAME_PROPERTY]?.relationId}
                source={source}
                autoFocus={false}
              />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

function TableBlockBulletedListItem({
  columns,
  currentSpaceId,
  isEditing,
  rowEntityId,
  isPlaceholder,
  onChangeEntry,
  onLinkEntry,
  relationId,
  source,
  autoFocus = false,
}: Props) {
  const { storage } = useMutate();
  const nameCell = columns[SystemIds.NAME_PROPERTY];
  const { propertyId: cellId, verified } = nameCell;

  const name =
    useSpaceAwareValue({ entityId: rowEntityId, propertyId: SystemIds.NAME_PROPERTY, spaceId: currentSpaceId })
      ?.value ?? null;

  const href = NavUtils.toEntity(nameCell?.space ?? currentSpaceId, cellId);

  if (isEditing && source.type !== 'RELATIONS') {
    return (
      <div className="group flex w-full gap-2 px-1 py-0.5">
        <div className="mt-1 flex-shrink-0 text-xl leading-none text-text">•</div>
        <div className="w-full">
          {isPlaceholder && source.type === 'COLLECTION' ? (
            <SelectEntity
              onCreateEntity={result => {
                onChangeEntry(rowEntityId, currentSpaceId, { type: 'CREATE_ENTITY', name: result.name });
              }}
              onDone={(result, fromCreateFn) => {
                if (fromCreateFn) return;
                onChangeEntry(rowEntityId, currentSpaceId, { type: 'FIND_ENTITY', entity: result });
              }}
              spaceId={currentSpaceId}
              autoFocus={autoFocus}
            />
          ) : (
            <div>
              {source.type !== 'COLLECTION' ? (
                <PageStringField
                  placeholder="Add name..."
                  onChange={value => {
                    onChangeEntry(rowEntityId, currentSpaceId, { type: 'SET_NAME', name: value });
                  }}
                  value={name ?? ''}
                />
              ) : (
                <CollectionMetadata
                  view="BULLETED_LIST"
                  isEditing={true}
                  name={name}
                  currentSpaceId={currentSpaceId}
                  entityId={rowEntityId}
                  spaceId={nameCell?.space}
                  collectionId={nameCell?.collectionId}
                  relationId={relationId}
                  verified={verified}
                  onLinkEntry={onLinkEntry}
                >
                  <PageStringField
                    placeholder="Add name..."
                    onChange={value => {
                      onChangeEntry(rowEntityId, currentSpaceId, { type: 'SET_NAME', name: value });
                    }}
                    value={name ?? ''}
                  />
                </CollectionMetadata>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="group relative flex w-full gap-2 rounded-md px-1 py-0.5 transition duration-200 hover:bg-divider">
      <div className="mt-1 flex-shrink-0 text-xl leading-none text-text">•</div>
      {source.type !== 'COLLECTION' ? (
        <Link entityId={rowEntityId} spaceId={currentSpaceId} href={href} className="text-body">
          {name}
        </Link>
      ) : (
        <CollectionMetadata
          view="BULLETED_LIST"
          isEditing={false}
          name={name}
          currentSpaceId={currentSpaceId}
          entityId={rowEntityId}
          spaceId={nameCell?.space}
          collectionId={nameCell?.collectionId}
          relationId={relationId}
          verified={verified}
          onLinkEntry={onLinkEntry}
        >
          <Link entityId={rowEntityId} spaceId={currentSpaceId} href={href} className="text-body">
            {name}
          </Link>
        </CollectionMetadata>
      )}
    </div>
  );
}

const SortableItem = ({
  spaceId,
  source,
  onChangeEntry,
  onLinkEntry,
  properties,
  isEditing,
  row,
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

  const isPlaceholder = Boolean(row.placeholder);

  return (
    <div ref={setNodeRef} style={style} className="relative" onClick={handleClick} onClickCapture={handleClick}>
      <div {...attributes} {...listeners} className="flex items-center">
        <TableBlockBulletedListItem
          isEditing={isEditing}
          key={`${row.entityId}-${pageNumber}`}
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
