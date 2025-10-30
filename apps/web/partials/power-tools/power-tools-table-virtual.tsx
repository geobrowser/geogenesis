'use client';

import { SystemIds } from '@graphprotocol/grc-20';
import { useVirtualizer } from '@tanstack/react-virtual';
import * as React from 'react';

import { Property, Row } from '~/core/v2.types';
import { NavUtils } from '~/core/utils/utils';
import { useUserIsEditing } from '~/core/hooks/use-user-is-editing';
import { Source } from '~/core/blocks/data/source';

import { Checkbox } from '~/design-system/checkbox';
import { Text } from '~/design-system/text';
import { Plus } from '~/design-system/icons/plus';
import { SelectEntity } from '~/design-system/select-entity';
import { EntitySidePanel } from './entity-side-panel';
import { EditableEntityTableCell } from '~/partials/entity-page/editable-entity-table-cell';
import { EntityTableCell } from '~/partials/entities-page/entity-table-cell';

interface Props {
  rows: Row[];
  propertiesSchema: Record<string, Property> | null;
  spaceId: string;
  selectedRows: Set<string>;
  onSelectRow: (entityId: string, selected: boolean) => void;
  onSelectAll: (selected: boolean) => void;
  onSelectRange?: (startIndex: number, endIndex: number, selected: boolean) => void;
  // Infinite scroll props
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => void;
  totalDBRowCount: number;
  totalFetched: number;
  // For proper select all state
  allAvailableEntityIds?: string[];
  isSelectingAll?: boolean;
  selectAllState?: 'none' | 'partial' | 'all';
  // Entity editing handlers
  onChangeEntry: (context: any, event: any) => void;
  onLinkEntry: (id: string, to: {id: string; name: string | null; space?: string; verified?: boolean}) => void;
  source: Source;
}

export function PowerToolsTableVirtual({
  rows,
  propertiesSchema,
  spaceId,
  selectedRows,
  onSelectRow,
  onSelectAll,
  onSelectRange,
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
  totalDBRowCount,
  totalFetched,
  allAvailableEntityIds,
  isSelectingAll = false,
  selectAllState,
  onChangeEntry,
  onLinkEntry,
  source,
}: Props) {
  const tableRef = React.useRef<HTMLDivElement>(null);
  const [lastSelectedIndex, setLastSelectedIndex] = React.useState<number | null>(null);
  const [columnWidths, setColumnWidths] = React.useState<Record<string, number>>({});
  const [isResizing, setIsResizing] = React.useState<string | null>(null);
  const [startX, setStartX] = React.useState(0);
  const [startWidth, setStartWidth] = React.useState(0);

  // Side panel state
  const [sidePanelOpen, setSidePanelOpen] = React.useState(false);
  const [selectedEntity, setSelectedEntity] = React.useState<{entityId: string, spaceId: string} | null>(null);

  // Editing state
  const isEditing = useUserIsEditing(spaceId);

  // Handler for opening entity in side panel
  const handleEntityClick = React.useCallback((entityId: string, entitySpaceId?: string) => {
    // Use the entity's actual spaceId if provided, otherwise fallback to current spaceId
    const actualSpaceId = entitySpaceId || spaceId;
    setSelectedEntity({ entityId, spaceId: actualSpaceId });
    setSidePanelOpen(true);
  }, [spaceId]);

  const handleCloseSidePanel = React.useCallback(() => {
    setSidePanelOpen(false);
    setSelectedEntity(null);
  }, []);

  // Calculate selection state - use optimistic state during loading
  const isAllSelected = React.useMemo(() => {
    if (isSelectingAll && selectAllState === 'all') {
      return true; // Optimistic state
    }
    if (allAvailableEntityIds && allAvailableEntityIds.length > 0) {
      return allAvailableEntityIds.every(id => selectedRows.has(id));
    }
    // Fallback to visible rows if no allAvailableEntityIds provided
    return rows.length > 0 && rows.every((row) => selectedRows.has(row.entityId));
  }, [allAvailableEntityIds, selectedRows, rows, isSelectingAll, selectAllState]);

  const isPartiallySelected = React.useMemo(() => {
    if (isSelectingAll && selectAllState === 'all') {
      return false; // When all selected, not partial
    }
    if (allAvailableEntityIds && allAvailableEntityIds.length > 0) {
      return !isAllSelected && allAvailableEntityIds.some(id => selectedRows.has(id));
    }
    // Fallback to visible rows if no allAvailableEntityIds provided
    return !isAllSelected && rows.some((row) => selectedRows.has(row.entityId));
  }, [isAllSelected, allAvailableEntityIds, selectedRows, rows, isSelectingAll, selectAllState]);

  // Get all unique property IDs from schema and rows
  const visibleProperties = React.useMemo(() => {
    const propertySet = new Set<string>();

    // Always include Name property
    propertySet.add(SystemIds.NAME_PROPERTY);

    // Add all properties from schema
    if (propertiesSchema) {
      Object.keys(propertiesSchema).forEach(id => propertySet.add(id));
    }

    // Add any additional properties found in rows
    rows.forEach(row => {
      if (row.columns) {
        Object.keys(row.columns).forEach(id => propertySet.add(id));
      }
    });

    // Convert to property objects, filtering out any that don't exist in schema
    return Array.from(propertySet)
      .map(id => propertiesSchema?.[id])
      .filter((prop): prop is Property => Boolean(prop));
  }, [propertiesSchema, rows]);

  // Initialize column widths
  React.useEffect(() => {
    const widths: Record<string, number> = {};
    visibleProperties.forEach(prop => {
      if (!columnWidths[prop.id]) {
        // Date/time columns need more space for YYYY/MM/DD - 00:00 AM placeholder format
        const isDateColumn = prop.dataType === 'TIME' || prop.renderableType === 'TIME';
        widths[prop.id] = isDateColumn ? 300 : 200; // 1.5x width for date columns
      }
    });
    if (Object.keys(widths).length > 0) {
      setColumnWidths(prev => ({ ...prev, ...widths }));
    }
  }, [visibleProperties, columnWidths]);

  // Handle column resize
  const handleMouseDown = (e: React.MouseEvent, propertyId: string) => {
    e.preventDefault();
    setIsResizing(propertyId);
    setStartX(e.clientX);
    setStartWidth(columnWidths[propertyId] || 200);
  };

  React.useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;

      const diff = e.clientX - startX;
      const newWidth = Math.max(100, startWidth + diff); // Min width 100px

      setColumnWidths(prev => ({
        ...prev,
        [isResizing]: newWidth
      }));
    };

    const handleMouseUp = () => {
      setIsResizing(null);
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);

      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isResizing, startX, startWidth]);

  // Generate grid template columns based on column widths
  const gridTemplateColumns = React.useMemo(() => {
    const columns = visibleProperties.map(prop =>
      `${columnWidths[prop.id] || 200}px`
    ).join(' ');
    return `48px ${columns}`;
  }, [visibleProperties, columnWidths]);

  // Calculate total width of all columns for minWidth
  const totalTableWidth = React.useMemo(() => {
    const columnsTotalWidth = visibleProperties.reduce((total, prop) => {
      return total + (columnWidths[prop.id] || 200);
    }, 0);
    return 48 + columnsTotalWidth; // 48px for checkbox column + all property columns
  }, [visibleProperties, columnWidths]);

  // Row height estimation
  const estimateRowHeight = React.useCallback(() => 56, []);

  // Setup virtualizer
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => tableRef.current,
    estimateSize: estimateRowHeight,
    overscan: 5,
    measureElement:
      typeof window !== 'undefined' && navigator.userAgent.indexOf('Firefox') === -1
        ? (element) => element?.getBoundingClientRect().height
        : undefined,
  });

  const virtualItems = virtualizer.getVirtualItems();

  // Handle infinite scrolling
  React.useEffect(() => {
    const lastItem = virtualItems[virtualItems.length - 1];

    if (!lastItem) {
      return;
    }

    if (
      lastItem.index >= rows.length - 1 &&
      hasNextPage &&
      !isFetchingNextPage
    ) {
      fetchNextPage();
    }
  }, [hasNextPage, fetchNextPage, rows.length, isFetchingNextPage, virtualItems]);

  // Handle selection with shift key
  const handleRowClick = (index: number, event: React.MouseEvent) => {
    const row = rows[index];
    const rowId = row.entityId;
    const isCurrentlySelected = selectedRows.has(rowId);

    if (event.shiftKey && lastSelectedIndex !== null && onSelectRange) {
      event.preventDefault();
      const start = Math.min(lastSelectedIndex, index);
      const end = Math.max(lastSelectedIndex, index);
      onSelectRange(start, end, !isCurrentlySelected);
    } else {
      onSelectRow(rowId, !isCurrentlySelected);
      setLastSelectedIndex(index);
    }
  };

  return (
    <div
      ref={tableRef}
      className={`h-full w-full overflow-auto ${isResizing ? 'select-none' : ''}`}
      style={{
        position: 'relative',
        cursor: isResizing ? 'col-resize' : 'default'
      }}
    >
      {/* Sticky Header */}
      <div
        className="sticky top-0 z-10 bg-white shadow-sm"
        style={{ minWidth: `${totalTableWidth}px` }}
      >
        <div className="grid border-b border-grey-02" style={{
          gridTemplateColumns,
          minWidth: `${totalTableWidth}px`,
        }}>
          {/* Selection checkbox header */}
          <div
            className={`flex items-center justify-center border-r border-grey-02 bg-grey-01 p-3 ${
              isSelectingAll ? 'cursor-wait' : 'cursor-pointer'
            }`}
            onClick={(e) => {
              if (isSelectingAll) return; // Prevent clicks during loading
              console.log('Header checkbox div clicked');
              e.preventDefault();
              onSelectAll(!isAllSelected);
            }}
          >
            {isSelectingAll ? (
              <div className="animate-spin w-4 h-4 border-2 border-blue-04 border-t-transparent rounded-full" />
            ) : (
              <Checkbox
                checked={isAllSelected}
              />
            )}
          </div>

          {/* Property headers */}
          {visibleProperties.map((property, index) => (
            <div
              key={property.id}
              className={`relative flex items-center border-grey-02 bg-grey-01 p-3 ${
                index < visibleProperties.length - 1 ? 'border-r' : ''
              }`}
            >
              <Text variant="metadata" className="truncate">
                {property.name || property.id}
              </Text>
              {/* Resize handle */}
              {index < visibleProperties.length - 1 && (
                <div
                  className="absolute right-0 top-0 h-full w-3 cursor-col-resize hover:bg-blue-04 hover:bg-opacity-50 flex items-center justify-center"
                  style={{
                    right: '-6px',
                    userSelect: isResizing ? 'none' : 'auto'
                  }}
                  onMouseDown={(e) => handleMouseDown(e, property.id)}
                >
                  <div className="w-1 h-4 bg-grey-03 opacity-0 hover:opacity-100 transition-opacity" />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Virtual Scrolling Container */}
      <div
        style={{
          height: virtualizer.getTotalSize(),
          minHeight: '100%',
          width: '100%',
          position: 'relative',
        }}
      >
        {/* Virtual Rows */}
        {virtualItems.map((virtualRow) => {
          const row = rows[virtualRow.index];
          const rowId = row.entityId;
          const isSelected = selectedRows.has(rowId);
          const isPlaceholder = row.placeholder;

          return (
            <div
              key={virtualRow.key}
              data-index={virtualRow.index}
              ref={(node) => virtualizer.measureElement(node)}
              className={`absolute left-0 top-0 ${
                isPlaceholder ? 'bg-grey-01 z-40' : isSelected ? 'bg-action-bg' : 'hover:bg-grey-01'
              }`}
              style={{
                transform: `translateY(${virtualRow.start}px)`,
                minWidth: `${totalTableWidth}px`,
              }}
            >
              <div
                className="grid border-b border-grey-02"
                style={{
                  gridTemplateColumns,
                  minWidth: `${totalTableWidth}px`,
                }}
              >
                {/* Selection checkbox or Plus icon for placeholder */}
                <div
                  className="flex items-center justify-center border-r border-grey-02 p-3"
                  onClick={(e) => {
                    if (isPlaceholder) {
                      // Placeholder row doesn't support selection
                      return;
                    }
                    // Handle shift-click for range selection
                    if (e.shiftKey && lastSelectedIndex !== null && onSelectRange) {
                      const start = Math.min(lastSelectedIndex, virtualRow.index);
                      const end = Math.max(lastSelectedIndex, virtualRow.index);
                      onSelectRange(start, end, !isSelected);
                    } else {
                      onSelectRow(rowId, !isSelected);
                    }
                    setLastSelectedIndex(virtualRow.index);
                  }}
                >
                  {isPlaceholder ? (
                    <Plus color="grey-04" />
                  ) : (
                    <Checkbox checked={isSelected} />
                  )}
                </div>

                {/* Cell values */}
                {visibleProperties.map((property, cellIndex) => {
                  const cell = row.columns?.[property.id];
                  const isLastColumn = cellIndex === visibleProperties.length - 1;
                  const isFirstColumn = cellIndex === 0;
                  const isNameProperty = property.id === SystemIds.NAME_PROPERTY;

                  // For placeholder row, show SelectEntity in first column
                  if (isPlaceholder && isFirstColumn) {
                    return (
                      <div
                        key={property.id}
                        className={`flex items-start p-3 ${
                          !isLastColumn ? 'border-r border-grey-02' : ''
                        }`}
                      >
                        <div className="relative z-50">
                          <SelectEntity
                            onCreateEntity={result => {
                              onChangeEntry(
                                {
                                  entityId: row.entityId,
                                  entityName: null,
                                  spaceId: spaceId,
                                },
                                {
                                  type: 'Create',
                                  data: result,
                                }
                              );
                            }}
                            onDone={(result, fromCreateFn) => {
                              if (fromCreateFn) {
                                // Bail out if callback is from create function
                                return;
                              }

                              onChangeEntry(
                                {
                                  entityId: row.entityId,
                                  entityName: null,
                                  spaceId: spaceId,
                                },
                                {
                                  type: 'Find',
                                  data: result,
                                }
                              );
                            }}
                            spaceId={spaceId}
                            autoFocus={true}
                          />
                        </div>
                      </div>
                    );
                  }

                  // For placeholder row non-name columns, show empty
                  if (isPlaceholder) {
                    return (
                      <div
                        key={property.id}
                        className={`flex items-start p-3 ${
                          !isLastColumn ? 'border-r border-grey-02' : ''
                        }`}
                      >
                        <Text variant="body" color="grey-04">
                          —
                        </Text>
                      </div>
                    );
                  }

                  if (!cell) {
                    return (
                      <div
                        key={property.id}
                        className={`flex items-start p-3 ${
                          !isLastColumn ? 'border-r border-grey-02' : ''
                        }`}
                      >
                        <Text variant="body" color="grey-04">
                          —
                        </Text>
                      </div>
                    );
                  }

                  // Get entity name from name column
                  const nameCell = row.columns[SystemIds.NAME_PROPERTY];
                  const entityName = nameCell?.name || null;
                  const cellSpaceId = isNameProperty ? (nameCell?.space ?? spaceId) : spaceId;

                  // For name property, use custom click handler to open side panel
                  if (isNameProperty) {
                    return (
                      <div
                        key={property.id}
                        className={`flex items-start p-3 ${
                          !isLastColumn ? 'border-r border-grey-02' : ''
                        }`}
                      >
                        {isEditing ? (
                          <EditableEntityTableCell
                            entityId={row.entityId}
                            spaceId={cellSpaceId}
                            property={property}
                            isPlaceholderRow={false}
                            name={entityName}
                            currentSpaceId={spaceId}
                            collectionId={nameCell?.collectionId}
                            relationId={nameCell?.relationId}
                            toSpaceId={nameCell?.space}
                            verified={nameCell?.verified}
                            onChangeEntry={onChangeEntry}
                            onLinkEntry={onLinkEntry}
                            source={source}
                            autoFocus={false}
                          />
                        ) : (
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleEntityClick(row.entityId, nameCell?.space);
                            }}
                            className="text-left text-blue-04 hover:underline"
                          >
                            <Text variant="body">
                              {entityName || 'Untitled'}
                            </Text>
                          </button>
                        )}
                      </div>
                    );
                  }

                  // For all other cells, use the standard table cell components
                  return (
                    <div
                      key={property.id}
                      className={`flex items-start p-3 ${
                        !isLastColumn ? 'border-r border-grey-02' : ''
                      }`}
                    >
                      {isEditing ? (
                        <EditableEntityTableCell
                          entityId={row.entityId}
                          spaceId={cellSpaceId}
                          property={property}
                          isPlaceholderRow={false}
                          name={entityName}
                          currentSpaceId={spaceId}
                          collectionId={nameCell?.collectionId}
                          relationId={nameCell?.relationId}
                          toSpaceId={nameCell?.space}
                          verified={nameCell?.verified}
                          onChangeEntry={onChangeEntry}
                          onLinkEntry={onLinkEntry}
                          source={source}
                          autoFocus={false}
                        />
                      ) : (
                        <EntityTableCell
                          entityId={row.entityId}
                          spaceId={cellSpaceId}
                          property={property}
                          isExpanded={false}
                          name={entityName}
                          href={NavUtils.toEntity(nameCell?.space ?? spaceId, row.entityId)}
                          currentSpaceId={spaceId}
                          collectionId={nameCell?.collectionId}
                          relationId={nameCell?.relationId}
                          verified={nameCell?.verified}
                          onLinkEntry={onLinkEntry}
                          source={source}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Entity Side Panel */}
      {selectedEntity && (
        <EntitySidePanel
          entityId={selectedEntity.entityId}
          spaceId={selectedEntity.spaceId}
          isOpen={sidePanelOpen}
          onClose={handleCloseSidePanel}
        />
      )}
    </div>
  );
}