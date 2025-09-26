'use client';

import { SystemIds } from '@graphprotocol/grc-20';
import { useVirtualizer } from '@tanstack/react-virtual';

import * as React from 'react';

import { Property, Row } from '~/core/v2.types';
import { useQueryEntity } from '~/core/sync/use-store';
import { useName } from '~/core/state/entity-page-store/entity-store';
import { NavUtils } from '~/core/utils/utils';

import { LinkableRelationChip } from '~/design-system/chip';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';
import { Checkbox } from '~/design-system/checkbox';
import { Text } from '~/design-system/text';
import { PowerToolsRelationChip } from './power-tools-relation-chip';
import { EntitySidePanel } from './entity-side-panel';

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
}

// Component to render a single relation chip
function RelationChip({
  relationId,
  relationName,
  spaceId,
  relationSpaceId,
  onEntityClick
}: {
  relationId: string;
  relationName?: string;
  spaceId: string;
  relationSpaceId?: string;
  onEntityClick: (entityId: string, entitySpaceId?: string) => void;
}) {
  return (
    <PowerToolsRelationChip
      relationId={relationId}
      relationName={relationName}
      spaceId={spaceId}
      relationSpaceId={relationSpaceId}
      onClick={onEntityClick}
    />
  );
}

// Component to render a relation cell with multiple relations
function RelationCell({
  relations,
  spaceId,
  onEntityClick,
}: {
  relations: string[];
  spaceId: string;
  onEntityClick: (entityId: string, entitySpaceId?: string) => void;
}) {
  if (!relations || relations.length === 0) {
    return <div className="text-grey-04">—</div>;
  }

  // Show first 3 relations and a count if there are more
  const displayRelations = relations.slice(0, 3);
  const remainingCount = relations.length - 3;

  return (
    <div className="flex flex-wrap gap-1">
      {displayRelations.map((relationId) => (
        <RelationChip
          key={relationId}
          relationId={relationId}
          spaceId={spaceId}
          onEntityClick={onEntityClick}
        />
      ))}
      {remainingCount > 0 && (
        <div className="inline-flex items-center rounded bg-grey-01 px-2 py-1">
          <Text variant="body">+{remainingCount} more</Text>
        </div>
      )}
    </div>
  );
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
        widths[prop.id] = 200; // Default width
      }
    });
    if (Object.keys(widths).length > 0) {
      setColumnWidths(prev => ({ ...prev, ...widths }));
    }
  }, [visibleProperties]);

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
        style={{ minWidth: '100%' }}
      >
        <div className="grid border-b border-grey-02" style={{
          gridTemplateColumns,
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
          width: '100%',
          position: 'relative',
        }}
      >
        {/* Virtual Rows */}
        {virtualItems.map((virtualRow) => {
          const row = rows[virtualRow.index];
          const rowId = row.entityId;
          const isSelected = selectedRows.has(rowId);

          return (
            <div
              key={virtualRow.key}
              data-index={virtualRow.index}
              ref={(node) => virtualizer.measureElement(node)}
              className={`absolute left-0 top-0 w-full ${
                isSelected ? 'bg-action-bg' : 'hover:bg-grey-01'
              }`}
              style={{
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <div
                className="grid border-b border-grey-02"
                style={{
                  gridTemplateColumns,
                }}
              >
                {/* Selection checkbox */}
                <div
                  className="flex items-center justify-center border-r border-grey-02 p-3"
                  onClick={(e) => {
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
                  <Checkbox
                    checked={isSelected}
                  />
                </div>

                {/* Cell values */}
                {visibleProperties.map((property, cellIndex) => {
                  const cell = row.columns?.[property.id];
                  const isLastColumn = cellIndex === visibleProperties.length - 1;

                  return (
                    <div
                      key={property.id}
                      className={`flex items-start p-3 ${
                        !isLastColumn ? 'border-r border-grey-02' : ''
                      }`}
                    >
                      {!cell ? (
                        <Text variant="body" color="grey-04">
                          —
                        </Text>
                      ) : (cell as any).relation || (cell as any).relations ? (
                        <div className="flex flex-wrap gap-1">
                          {(cell as any).relations ? (
                            (cell as any).relations.map((rel: any, index: number) => (
                              console.log('Rendering relation:', { rowId, propertyId: property.id, rel }),
                              <RelationChip
                                key={`${row.entityId}-${property.id}-${rel.id}-${index}`}
                                relationId={rel.id}
                                relationName={rel.name}
                                spaceId={spaceId}
                                relationSpaceId={rel.toSpaceId || rel.spaceId}
                                onEntityClick={handleEntityClick}
                              />
                            ))
                          ) : (
                            <RelationChip
                              key={`${row.entityId}-${property.id}-${(cell as any).relation.id}`}
                              relationId={(cell as any).relation.id}
                              relationName={(cell as any).relation.name}
                              spaceId={spaceId}
                              relationSpaceId={(cell as any).relation.toSpaceId || (cell as any).relation.spaceId}
                              onEntityClick={handleEntityClick}
                            />
                          )}
                        </div>
                      ) : property.id === SystemIds.NAME_PROPERTY ? (
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleEntityClick(row.entityId, (cell as any).space);
                          }}
                          className="text-left text-blue-04 hover:underline"
                        >
                          <Text variant="body">
                            {(cell as any).name || (cell as any).value || 'Untitled'}
                          </Text>
                        </button>
                      ) : (
                        <Text
                          variant="body"
                          className="line-clamp-2"
                        >
                          {(cell as any).value || (cell as any).name || '—'}
                        </Text>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Loading indicators */}
      {isFetchingNextPage && (
        <div className="flex justify-center p-4">
          <Text variant="body" color="grey-04">
            Loading more rows...
          </Text>
        </div>
      )}

      {!hasNextPage && rows.length > 0 && (
        <div className="flex justify-center p-4">
          <Text variant="body" color="grey-04">
            All {totalDBRowCount} rows loaded ({totalFetched} fetched)
          </Text>
        </div>
      )}

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