'use client';

import {
  DndContext,
  DragEndEvent,
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
import { SystemIds } from '@geoprotocol/geo-sdk/lite';
import { useVirtualizer } from '@tanstack/react-virtual';

import * as React from 'react';

import { Source } from '~/core/blocks/data/source';
import { useUserIsEditing } from '~/core/hooks/use-user-is-editing';
import { useSpaceAwareValue } from '~/core/sync/use-store';
import { Property } from '~/core/types';
import { ColumnSortState } from '~/core/utils/column-sort';
import { NavUtils } from '~/core/utils/utils';

import { Checkbox } from '~/design-system/checkbox';
import { Close } from '~/design-system/icons/close';
import { CloseSmall } from '~/design-system/icons/close-small';
import { EyeHide } from '~/design-system/icons/eye-hide';
import { OrderDots } from '~/design-system/icons/order-dots';
import { Plus } from '~/design-system/icons/plus';
import { Trash } from '~/design-system/icons/trash';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';
import { Spinner } from '~/design-system/spinner';
import { Text } from '~/design-system/text';

import type { onChangeEntryFn, onLinkEntryFn } from '~/partials/blocks/table/change-entry';
import { CollectionMetadata } from '~/partials/blocks/table/collection-metadata';
import { SortableColumnHeader } from '~/partials/blocks/table/sortable-column-header';
import { EntityTableCell } from '~/partials/entities-page/entity-table-cell';
import { EditableEntityTableCell } from '~/partials/entity-page/editable-entity-table-cell';

import {
  type EditAddExistingPropertyPayload,
  type EditApplyNewPropertyPayload,
  type EditCreatePropertyEntityPayload,
  EditEntitiesPopover,
  type EditRemovePropertiesPayload,
} from './edit-entities-popover';
import { PowerToolsRow } from './types';

export type PowerToolsTableSelectionProps = {
  selectedEntityIds: Set<string>;
  onToggleRowSelection: (entityId: string) => void;
  onSetRowSelection: (entityId: string, selected: boolean) => void;
  onMasterToggle: () => void;
  selectableCount: number;
  isAllSelected: boolean;
};

interface Props {
  rows: PowerToolsRow[];
  properties: Property[];
  propertiesById: Record<string, Property>;
  spaceId: string;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => void;
  onChangeEntry: onChangeEntryFn;
  onLinkEntry: onLinkEntryFn;
  onDismissPlaceholder?: () => void;
  onDeleteRow?: (row: PowerToolsRow) => void;
  onOpenEntityPanel?: (entityId: string, spaceId: string) => void;
  source: Source;
  hiddenColumnIds: Set<string>;
  onHideColumn?: (propertyId: string) => void;
  orderedPropertyIds: string[];
  onReorderColumns: (ids: string[]) => void;
  selection?: PowerToolsTableSelectionProps;
  imageUploadingFor?: Set<string>;
  /** Cells in these property columns show applying state during bulk apply (e.g. fetchAllIds). */
  bulkApplyPendingPropertyIds?: ReadonlySet<string>;
  onRowClick?: (entityId: string) => void;
  onRowDoubleClick?: (entityId: string) => void;
  sortState: ColumnSortState;
  onSort: React.Dispatch<React.SetStateAction<ColumnSortState>>;
  selectedCount?: number;
  selectedEntityIdsForNewProperty?: string[];
  onApplyNewProperty?: (payload: EditApplyNewPropertyPayload) => void;
  onCreatePropertyEntity?: (payload: EditCreatePropertyEntityPayload) => void;
  onAddExistingProperty?: (payload: EditAddExistingPropertyPayload) => void;
  onRemoveProperties?: (payload: EditRemovePropertiesPayload) => void;
}

const CHECKBOX_COLUMN_WIDTH = 40;
const ADD_COLUMN_WIDTH = 56;

const ROW_HEIGHT_ESTIMATE = 56;
const HEADER_HEIGHT = 44;

function NameCell({
  row,
  property,
  spaceId,
  isEditing,
  isRowEditable,
  onChangeEntry,
  onLinkEntry,
  onOpenEntityPanel,
  source,
}: {
  row: PowerToolsRow;
  property: Property;
  spaceId: string;
  isEditing: boolean;
  isRowEditable: boolean;
  onChangeEntry: onChangeEntryFn;
  onLinkEntry: onLinkEntryFn;
  onOpenEntityPanel?: (entityId: string, spaceId: string) => void;
  source: Source;
}) {
  const nameValue = useSpaceAwareValue({
    entityId: row.entityId,
    propertyId: SystemIds.NAME_PROPERTY,
    spaceId: row.spaceId,
  });

  const name = nameValue?.value ?? null;

  if (isEditing && isRowEditable) {
    return (
      <EditableEntityTableCell
        entityId={row.entityId}
        spaceId={row.spaceId}
        property={property}
        isPlaceholderRow={Boolean(row.placeholder)}
        name={name}
        currentSpaceId={spaceId}
        collectionId={row.collectionId}
        relationId={row.relationId}
        toSpaceId={row.toSpaceId}
        verified={row.verified}
        onChangeEntry={onChangeEntry}
        onLinkEntry={onLinkEntry}
        source={source}
        autoFocus={false}
      />
    );
  }

  const href = NavUtils.toEntity(row.toSpaceId ?? row.spaceId, row.entityId);
  const handleOpen = (event: React.MouseEvent) => {
    if (!onOpenEntityPanel) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button === 1) {
      return;
    }
    event.preventDefault();
    onOpenEntityPanel(row.entityId, row.toSpaceId ?? row.spaceId);
  };

  if (source.type === 'COLLECTION') {
    return (
      <CollectionMetadata
        view="TABLE"
        isEditing={false}
        name={name}
        currentSpaceId={spaceId}
        entityId={row.entityId}
        spaceId={row.spaceId}
        collectionId={row.collectionId}
        relationId={row.relationId}
        verified={row.verified}
        onLinkEntry={onLinkEntry}
      >
        <Link
          entityId={row.entityId}
          spaceId={row.spaceId}
          href={href}
          className="border-t border-dotted border-ctaPrimary/30 pt-1 text-tableCell wrap-break-word text-ctaPrimary hover:text-ctaHover hover:underline"
          onClick={handleOpen}
        >
          {name || row.entityId}
        </Link>
      </CollectionMetadata>
    );
  }

  return (
    <Link
      entityId={row.entityId}
      href={href}
      className="border-t border-dotted border-ctaPrimary/30 pt-1 text-tableCell wrap-break-word text-ctaPrimary hover:text-ctaHover hover:underline"
      onClick={handleOpen}
    >
      {name || row.entityId}
    </Link>
  );
}

function PowerToolsCell({
  row,
  property,
  spaceId,
  isEditing,
  isRowEditable,
  onChangeEntry,
  onLinkEntry,
  onOpenEntityPanel,
  source,
  imageUploadingFor,
  bulkApplyPendingPropertyIds,
}: {
  row: PowerToolsRow;
  property: Property;
  spaceId: string;
  isEditing: boolean;
  isRowEditable: boolean;
  onChangeEntry: onChangeEntryFn;
  onLinkEntry: onLinkEntryFn;
  onOpenEntityPanel?: (entityId: string, spaceId: string) => void;
  source: Source;
  imageUploadingFor?: Set<string>;
  bulkApplyPendingPropertyIds?: ReadonlySet<string>;
}) {
  if (bulkApplyPendingPropertyIds?.has(property.id)) {
    return (
      <div className="flex min-h-[1.25rem] items-center gap-2" aria-busy="true" aria-label="Applying changes">
        <Spinner />
        <Text variant="body" color="grey-04">
          Applying…
        </Text>
      </div>
    );
  }

  if (row.placeholder && property.id !== SystemIds.NAME_PROPERTY && !isEditing) {
    return (
      <Text variant="body" color="grey-04">
        —
      </Text>
    );
  }

  if (property.id === SystemIds.NAME_PROPERTY) {
    return (
      <NameCell
        row={row}
        property={property}
        spaceId={spaceId}
        isEditing={isEditing}
        isRowEditable={isRowEditable}
        onChangeEntry={onChangeEntry}
        onLinkEntry={onLinkEntry}
        onOpenEntityPanel={onOpenEntityPanel}
        source={source}
      />
    );
  }

  if (isEditing && isRowEditable) {
    return (
      <EditableEntityTableCell
        entityId={row.entityId}
        spaceId={row.spaceId}
        property={property}
        isPlaceholderRow={Boolean(row.placeholder)}
        name={null}
        currentSpaceId={spaceId}
        collectionId={row.collectionId}
        relationId={row.relationId}
        toSpaceId={row.toSpaceId}
        verified={row.verified}
        onChangeEntry={onChangeEntry}
        onLinkEntry={onLinkEntry}
        source={source}
        imageUploadingFor={imageUploadingFor}
        autoFocus={false}
      />
    );
  }

  return (
    <EntityTableCell
      entityId={row.entityId}
      spaceId={row.spaceId}
      property={property}
      isExpanded={true}
      name={null}
      href={NavUtils.toEntity(row.toSpaceId ?? row.spaceId, row.entityId)}
      currentSpaceId={spaceId}
      collectionId={row.collectionId}
      relationId={row.relationId}
      verified={row.verified}
      onLinkEntry={onLinkEntry}
      source={source}
    />
  );
}

function SortableHeaderCell({
  property,
  sortState,
  onSort,
  onResizeMouseDown,
  onHideColumn,
  removePropertyPopover,
}: {
  property: Property;
  sortState: ColumnSortState;
  onSort: React.Dispatch<React.SetStateAction<ColumnSortState>>;
  onResizeMouseDown: (event: React.MouseEvent, propertyId: string) => void;
  onHideColumn?: (propertyId: string) => void;
  removePropertyPopover?: {
    selectedCount: number;
    spaceId: string;
    properties: Property[];
    selectedEntityIds: string[];
    onRemoveProperties: (payload: EditRemovePropertiesPayload) => void;
  };
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: property.id,
  });

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.85 : 1,
    zIndex: isDragging ? 1000 : 'auto',
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="group/header relative flex h-full min-w-0 items-center border-r border-grey-02 bg-grey-01 px-3"
    >
      <div
        {...attributes}
        {...listeners}
        className="hover:text-grey-05 mr-2 flex cursor-grab touch-none items-center self-center rounded p-0.5 text-grey-04 opacity-0 transition-opacity duration-150 group-hover/header:opacity-100 hover:bg-grey-02 active:cursor-grabbing"
        title="Drag to reorder column"
      >
        <OrderDots color="currentColor" />
      </div>
      <SortableColumnHeader
        columnId={property.id}
        label={property.name || property.id}
        sort={sortState}
        onSort={onSort}
        variant="metadata"
      />
      {onHideColumn && (
        <div className="ml-2 flex items-center gap-1">
          <button
            type="button"
            onClick={() => onHideColumn(property.id)}
            className="flex shrink-0 items-center justify-center rounded-sm p-0.5 text-grey-04 opacity-0 transition-opacity duration-150 group-hover/header:opacity-100 hover:bg-grey-02 hover:text-text"
            title="Hide column"
            aria-label="Hide column"
          >
            <EyeHide />
          </button>
          {removePropertyPopover && (
            <EditEntitiesPopover
              trigger={
                <button
                  type="button"
                  className="flex shrink-0 items-center justify-center rounded-sm p-0.5 text-grey-04 opacity-0 transition-opacity duration-150 group-hover/header:opacity-100 hover:bg-grey-02 hover:text-text"
                  title="Remove property"
                  aria-label="Remove property"
                >
                  <CloseSmall />
                </button>
              }
              selectedCount={removePropertyPopover.selectedCount}
              spaceId={removePropertyPopover.spaceId}
              properties={removePropertyPopover.properties}
              selectedEntityIds={removePropertyPopover.selectedEntityIds}
              onRemoveProperties={removePropertyPopover.onRemoveProperties}
              removePropertyOnly
              initialPropertiesMarkedForRemoval={[property.id]}
              contentAlign="center"
              contentSideOffset={6}
              restoreFocusOnClose={false}
            />
          )}
        </div>
      )}
      <div
        className="hover:bg-blue-04/50 absolute top-0 right-0 h-full w-3 cursor-col-resize"
        onMouseDown={e => onResizeMouseDown(e, property.id)}
      />
    </div>
  );
}

export function PowerToolsTable({
  rows,
  properties,
  propertiesById,
  spaceId,
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
  onChangeEntry,
  onLinkEntry,
  onDismissPlaceholder,
  onDeleteRow,
  onOpenEntityPanel,
  source,
  hiddenColumnIds,
  onHideColumn,
  orderedPropertyIds,
  onReorderColumns,
  selection,
  imageUploadingFor,
  bulkApplyPendingPropertyIds,
  onRowClick,
  onRowDoubleClick,
  sortState,
  onSort,
  selectedCount = 0,
  selectedEntityIdsForNewProperty = [],
  onApplyNewProperty,
  onCreatePropertyEntity,
  onAddExistingProperty,
  onRemoveProperties,
}: Props) {
  const tableRef = React.useRef<HTMLDivElement>(null);
  /** Preserves scroll when cell content swaps (e.g. Applying… → relation chips) so the view does not jump horizontally. */
  const savedTableScrollRef = React.useRef<{ left: number; top: number } | null>(null);
  const wasBulkOrImageApplyingRef = React.useRef(false);

  const bulkApplying = (bulkApplyPendingPropertyIds?.size ?? 0) > 0;
  const imageApplying = (imageUploadingFor?.size ?? 0) > 0;
  const isBulkOrImageApplying = bulkApplying || imageApplying;

  React.useLayoutEffect(() => {
    const el = tableRef.current;
    if (!el) return;

    if (isBulkOrImageApplying && !wasBulkOrImageApplyingRef.current) {
      savedTableScrollRef.current = { left: el.scrollLeft, top: el.scrollTop };
    }

    if (!isBulkOrImageApplying && wasBulkOrImageApplyingRef.current && savedTableScrollRef.current) {
      const { left, top } = savedTableScrollRef.current;
      const restore = () => {
        el.scrollLeft = left;
        el.scrollTop = top;
      };
      restore();
      requestAnimationFrame(restore);
      savedTableScrollRef.current = null;
    }

    wasBulkOrImageApplyingRef.current = isBulkOrImageApplying;
  }, [isBulkOrImageApplying]);

  React.useEffect(() => {
    if (!isBulkOrImageApplying) return;
    const el = tableRef.current;
    if (!el) return;

    const onScroll = () => {
      savedTableScrollRef.current = { left: el.scrollLeft, top: el.scrollTop };
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [isBulkOrImageApplying]);

  const isEditing = useUserIsEditing(spaceId);
  const showCheckboxColumn = isEditing && selection != null;
  const [columnWidths, setColumnWidths] = React.useState<Record<string, number>>({});
  const [isResizing, setIsResizing] = React.useState<string | null>(null);
  const startXRef = React.useRef(0);
  const startWidthRef = React.useRef(0);
  const [isDragSelecting, setIsDragSelecting] = React.useState(false);
  const dragSelectValueRef = React.useRef<boolean>(false);
  const startRowEntityIdRef = React.useRef<string | null>(null);
  const hasDraggedRef = React.useRef(false);

  React.useEffect(() => {
    const onMouseUp = () => {
      setIsDragSelecting(false);
      startRowEntityIdRef.current = null;
    };
    window.addEventListener('mouseup', onMouseUp);
    return () => window.removeEventListener('mouseup', onMouseUp);
  }, []);

  const orderedProperties = React.useMemo(() => {
    const byId = new Map(properties.map(p => [p.id, p]));
    return orderedPropertyIds
      .filter(id => !hiddenColumnIds.has(id))
      .map(id => byId.get(id))
      .filter((p): p is Property => Boolean(p));
  }, [properties, orderedPropertyIds, hiddenColumnIds]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleColumnReorder = React.useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active?.id === over?.id) return;
      const oldIndex = orderedPropertyIds.indexOf(active.id as string);
      const newIndex = orderedPropertyIds.indexOf(over.id as string);
      if (oldIndex === -1 || newIndex === -1) return;
      onReorderColumns(arrayMove(orderedPropertyIds, oldIndex, newIndex));
    },
    [orderedPropertyIds, onReorderColumns]
  );

  React.useEffect(() => {
    setColumnWidths(prev => {
      const widths: Record<string, number> = {};
      for (const prop of orderedProperties) {
        if (!prev[prop.id]) {
          const renderableType = prop.renderableTypeStrict ?? prop.dataType;
          const isDateColumn = renderableType === 'TIME' || renderableType === 'DATE' || renderableType === 'DATETIME';
          widths[prop.id] = isDateColumn ? 320 : 200;
        }
      }
      if (Object.keys(widths).length === 0) return prev;
      return { ...prev, ...widths };
    });
  }, [orderedProperties]);

  const handleMouseDown = (event: React.MouseEvent, propertyId: string) => {
    event.preventDefault();
    setIsResizing(propertyId);
    startXRef.current = event.clientX;
    startWidthRef.current = columnWidths[propertyId] || 200;
  };

  React.useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      if (!isResizing) return;
      const diff = event.clientX - startXRef.current;
      const newWidth = Math.max(120, startWidthRef.current + diff);
      setColumnWidths(prev => ({
        ...prev,
        [isResizing]: newWidth,
      }));
    };

    const handleMouseUp = () => {
      setIsResizing(null);
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => tableRef.current,
    estimateSize: () => ROW_HEIGHT_ESTIMATE,
    overscan: 6,
  });

  const virtualRows = rowVirtualizer.getVirtualItems();
  const columnLayout = React.useMemo(() => {
    const showAddColumn = isEditing && onApplyNewProperty != null;
    let offset = showCheckboxColumn ? CHECKBOX_COLUMN_WIDTH : 0;
    const layout = orderedProperties.map(property => {
      const width = columnWidths[property.id] || 200;
      const left = offset;
      offset += width;
      return { property, left, width };
    });
    const template = showCheckboxColumn
      ? `${CHECKBOX_COLUMN_WIDTH}px ${layout.map(col => `${col.width}px`).join(' ')}${showAddColumn ? ` ${ADD_COLUMN_WIDTH}px` : ''}`
      : `${layout.map(col => `${col.width}px`).join(' ')}${showAddColumn ? ` ${ADD_COLUMN_WIDTH}px` : ''}`;
    return {
      totalWidth: offset,
      template,
      columns: layout,
      showAddColumn,
    };
  }, [orderedProperties, columnWidths, showCheckboxColumn, isEditing, onApplyNewProperty]);

  React.useEffect(() => {
    const lastItem = virtualRows[virtualRows.length - 1];
    if (!lastItem) return;

    if (lastItem.index >= rows.length - 1 && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [virtualRows, rows.length, hasNextPage, isFetchingNextPage, fetchNextPage]);

  return (
    <div ref={tableRef} className="h-full w-full overflow-auto">
      <div className="shadow-sm sticky top-0 z-10 bg-white">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleColumnReorder}>
          <SortableContext items={orderedPropertyIds} strategy={horizontalListSortingStrategy}>
            <div
              className="grid border-b border-grey-02 bg-grey-01"
              style={{
                height: HEADER_HEIGHT,
                minWidth: columnLayout.totalWidth,
                gridTemplateColumns: columnLayout.template,
              }}
            >
              {showCheckboxColumn && (
                <div className="flex items-center border-r border-grey-02 px-3">
                  <Checkbox
                    checked={selection!.isAllSelected}
                    onChange={selection!.onMasterToggle}
                    aria-label={selection!.isAllSelected ? 'Deselect all' : 'Select all'}
                  />
                </div>
              )}
              {columnLayout.columns.map(({ property }) => (
                <SortableHeaderCell
                  key={property.id}
                  property={property}
                  sortState={sortState}
                  onSort={onSort}
                  onResizeMouseDown={handleMouseDown}
                  onHideColumn={onHideColumn}
                  removePropertyPopover={
                    isEditing && onRemoveProperties
                      ? {
                          selectedCount,
                          spaceId,
                          properties,
                          selectedEntityIds: selectedEntityIdsForNewProperty,
                          onRemoveProperties,
                        }
                      : undefined
                  }
                />
              ))}
              {columnLayout.showAddColumn && (
                <div className="flex items-center justify-center border-r border-grey-02 bg-grey-01 px-2">
                  <EditEntitiesPopover
                    trigger={
                      <button
                        type="button"
                        className="flex h-7 w-7 items-center justify-center rounded-sm text-grey-04 hover:bg-grey-02 hover:text-text"
                        title="Add property"
                        aria-label="Add property"
                      >
                        <Plus />
                      </button>
                    }
                    selectedCount={selectedCount}
                    spaceId={spaceId}
                    properties={properties}
                    selectedEntityIds={selectedEntityIdsForNewProperty}
                    onApplyNewProperty={onApplyNewProperty}
                    onCreatePropertyEntity={onCreatePropertyEntity}
                    onAddExistingProperty={onAddExistingProperty}
                    newPropertyOnly
                    contentAlign="center"
                    contentSideOffset={6}
                    restoreFocusOnClose={false}
                  />
                </div>
              )}
            </div>
          </SortableContext>
        </DndContext>
      </div>

      <div
        style={{
          height: rowVirtualizer.getTotalSize(),
          minHeight: '100%',
          position: 'relative',
          minWidth: columnLayout.totalWidth,
        }}
      >
        {virtualRows.map(virtualRow => {
          const row = rows[virtualRow.index];
          const rowId = row.entityId;

          return (
            <div
              key={virtualRow.key}
              data-index={virtualRow.index}
              ref={node => rowVirtualizer.measureElement(node)}
              role={(onRowClick || onRowDoubleClick) && !row.placeholder ? 'button' : undefined}
              tabIndex={(onRowClick || onRowDoubleClick) && !row.placeholder ? 0 : undefined}
              onMouseDown={
                selection && !row.placeholder
                  ? () => {
                      hasDraggedRef.current = false;
                      dragSelectValueRef.current = !selection.selectedEntityIds.has(row.entityId);
                      startRowEntityIdRef.current = row.entityId;
                      setIsDragSelecting(true);
                    }
                  : undefined
              }
              onClick={
                onRowClick && !row.placeholder
                  ? e => {
                      if (hasDraggedRef.current) {
                        hasDraggedRef.current = false;
                        e.preventDefault();
                        e.stopPropagation();
                        return;
                      }
                      onRowClick(row.entityId);
                    }
                  : undefined
              }
              onDoubleClick={onRowDoubleClick && !row.placeholder ? () => onRowDoubleClick(row.entityId) : undefined}
              onMouseEnter={
                selection && !row.placeholder && isDragSelecting
                  ? () => {
                      const value = dragSelectValueRef.current;
                      selection.onSetRowSelection(row.entityId, value);
                      if (startRowEntityIdRef.current !== row.entityId) {
                        hasDraggedRef.current = true;
                        if (startRowEntityIdRef.current != null) {
                          selection.onSetRowSelection(startRowEntityIdRef.current, value);
                          startRowEntityIdRef.current = null;
                        }
                      }
                    }
                  : undefined
              }
              onKeyDown={
                onRowClick && !row.placeholder
                  ? e => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onRowClick(row.entityId);
                      }
                    }
                  : undefined
              }
              className={`absolute top-0 left-0 border-b border-grey-02 ${
                row.placeholder
                  ? 'bg-grey-01'
                  : selection && selection.selectedEntityIds.has(row.entityId)
                    ? 'bg-ctaTertiary'
                    : !isEditing
                      ? 'bg-grey-01/50'
                      : 'cursor-pointer hover:bg-grey-01'
              }`}
              style={{
                transform: `translateY(${virtualRow.start}px)`,
                width: '100%',
                zIndex: 1,
              }}
            >
              <div
                className="grid"
                style={{
                  minWidth: columnLayout.totalWidth,
                  gridTemplateColumns: columnLayout.template,
                }}
              >
                {showCheckboxColumn && (
                  <div
                    data-checkbox-cell
                    className="flex min-h-full cursor-pointer items-start border-r border-grey-02 px-3 py-2"
                    onClick={e => {
                      e.stopPropagation();
                      if (hasDraggedRef.current) {
                        hasDraggedRef.current = false;
                        return;
                      }
                      if (!row.placeholder) selection!.onToggleRowSelection(row.entityId);
                    }}
                    onMouseEnter={
                      !row.placeholder && isDragSelecting
                        ? () => {
                            hasDraggedRef.current = true;
                            selection!.onSetRowSelection(row.entityId, dragSelectValueRef.current);
                          }
                        : undefined
                    }
                    role="button"
                    tabIndex={row.placeholder ? undefined : 0}
                    aria-label={row.placeholder ? undefined : 'Select row'}
                    onKeyDown={
                      !row.placeholder
                        ? e => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              e.stopPropagation();
                              selection!.onToggleRowSelection(row.entityId);
                            }
                          }
                        : undefined
                    }
                  >
                    {!row.placeholder && (
                      <Checkbox checked={selection!.selectedEntityIds.has(row.entityId)} aria-label="Select row" />
                    )}
                  </div>
                )}
                {columnLayout.columns.map(({ property }) => {
                  const isNameCell = property.id === SystemIds.NAME_PROPERTY;
                  const isPlaceholderNameCell = row.placeholder && isEditing && isNameCell;
                  const isDeleteableNameCell = !row.placeholder && isEditing && isNameCell && onDeleteRow;
                  return (
                    <div key={`${rowId}-${property.id}`} className="min-w-0 border-r border-grey-02 px-4 py-2">
                      <div className="flex w-full items-start gap-2 overflow-visible">
                        <PowerToolsCell
                          row={row}
                          property={property}
                          spaceId={spaceId}
                          isEditing={isEditing}
                          isRowEditable={isEditing}
                          onChangeEntry={onChangeEntry}
                          onLinkEntry={onLinkEntry}
                          onOpenEntityPanel={onOpenEntityPanel}
                          source={source}
                          imageUploadingFor={imageUploadingFor}
                          bulkApplyPendingPropertyIds={bulkApplyPendingPropertyIds}
                        />
                        {isPlaceholderNameCell && onDismissPlaceholder && (
                          <button
                            type="button"
                            onClick={onDismissPlaceholder}
                            className="mt-0.5 ml-auto flex h-6 w-6 shrink-0 items-center justify-center rounded-sm hover:bg-grey-02"
                            title="Cancel new row"
                            aria-label="Cancel new row"
                          >
                            <Close />
                          </button>
                        )}
                        {isDeleteableNameCell && (
                          <button
                            type="button"
                            onClick={() => onDeleteRow(row)}
                            className="-my-1 mt-0.5 ml-auto hidden h-6 w-6 shrink-0 items-center justify-center rounded-sm text-grey-04 group-hover:flex hover:bg-grey-02 hover:text-red-01"
                            title="Delete row"
                            aria-label="Delete row"
                          >
                            <Trash />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
