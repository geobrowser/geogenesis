'use client';

import {
  ColumnDef,
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { cx } from 'class-variance-authority';
import { useAtomValue } from 'jotai';

import * as React from 'react';
import { useState } from 'react';

import { SystemIds } from '@graphprotocol/grc-20';
import { Source } from '~/core/blocks/data/source';
import { useUserIsEditing } from '~/core/hooks/use-user-is-editing';
import { useName } from '~/core/state/entity-page-store/entity-store';
import { NavUtils } from '~/core/utils/utils';
import { Cell, Property, Row } from '~/core/v2.types';

import { TableCell } from '~/design-system/table/cell';
import { Text } from '~/design-system/text';

import { EntityTableCell } from '~/partials/entities-page/entity-table-cell';
import { EditableEntityTableCell } from '~/partials/entity-page/editable-entity-table-cell';
import { EditableEntityTableColumnHeader } from '~/partials/entity-page/editable-entity-table-column-header';

import type { onChangeEntryFn, onLinkEntryFn } from '~/partials/blocks/table/change-entry';
import { editingPropertiesAtom } from '~/atoms';

interface Props {
  rows: Row[];
  properties: Property[];
  propertiesSchema: Record<string, Property> | null;
  spaceId: string;
  hasMore: boolean;
  loadMore: () => void;
  selectedRows: Set<string>;
  onSelectRow: (entityId: string, selected: boolean) => void;
  onSelectAll: (selected: boolean) => void;
  onSelectRange?: (startIndex: number, endIndex: number, selected: boolean) => void;
  source: Source;
}

const columnHelper = createColumnHelper<Row>();

// Dummy handlers for table callbacks that we don't need in Power Tools
const dummyOnChangeEntry: onChangeEntryFn = () => {};
const dummyOnLinkEntry: onLinkEntryFn = () => {};

export function PowerToolsEnhancedTable({
  rows,
  properties,
  propertiesSchema,
  spaceId,
  hasMore,
  loadMore,
  selectedRows,
  onSelectRow,
  onSelectAll,
  onSelectRange,
  source,
}: Props) {
  const tableRef = React.useRef<HTMLDivElement>(null);
  const [isLoadingMore, setIsLoadingMore] = React.useState(false);
  const [lastSelectedIndex, setLastSelectedIndex] = React.useState<number | null>(null);
  const isEditing = useUserIsEditing(spaceId);
  const isEditingColumns = useAtomValue(editingPropertiesAtom);
  const [expandedCells] = useState<Record<string, boolean>>({});

  // Calculate selection state
  const allRowsSelected = rows.length > 0 && rows.every(row => selectedRows.has(row.entityId));
  const someRowsSelected = rows.some(row => selectedRows.has(row.entityId));

  const handleSelectAll = (checked: boolean) => {
    onSelectAll(checked);
  };

  const handleRowSelect = (entityId: string, checked: boolean, rowIndex?: number, event?: React.MouseEvent) => {
    // Handle keyboard shortcuts
    if (event && rowIndex !== undefined && onSelectRange) {
      const isShiftClick = event.shiftKey;
      const isMetaOrCtrlClick = event.metaKey || event.ctrlKey;

      if (isShiftClick && lastSelectedIndex !== null) {
        // Range selection
        const startIndex = Math.min(lastSelectedIndex, rowIndex);
        const endIndex = Math.max(lastSelectedIndex, rowIndex);
        onSelectRange(startIndex, endIndex, true);
        return;
      } else if (isMetaOrCtrlClick) {
        // Multi-selection (toggle)
        onSelectRow(entityId, !selectedRows.has(entityId));
        setLastSelectedIndex(rowIndex);
        return;
      }
    }

    // Normal selection
    onSelectRow(entityId, checked);
    if (rowIndex !== undefined) {
      setLastSelectedIndex(rowIndex);
    }
  };

  // Infinite scroll handler
  React.useEffect(() => {
    const handleScroll = () => {
      if (!tableRef.current || !hasMore || isLoadingMore) return;

      const { scrollTop, scrollHeight, clientHeight } = tableRef.current;

      // Load more when user scrolls to within 200px of bottom
      if (scrollHeight - scrollTop - clientHeight < 200) {
        setIsLoadingMore(true);
        loadMore();
        // Reset loading state after a short delay
        setTimeout(() => setIsLoadingMore(false), 500);
      }
    };

    const currentRef = tableRef.current;
    if (currentRef) {
      currentRef.addEventListener('scroll', handleScroll);
      return () => currentRef.removeEventListener('scroll', handleScroll);
    }
  }, [hasMore, loadMore, isLoadingMore]);

  // Show all columns in Power Tools
  const allPropertyIds = properties.map(p => p.id);

  // Create selection column
  const selectionColumn = columnHelper.display({
    id: 'selection',
    header: () => (
      <div className="flex items-center justify-center">
        <input
          type="checkbox"
          checked={allRowsSelected}
          ref={(el) => {
            if (el) el.indeterminate = someRowsSelected && !allRowsSelected;
          }}
          onChange={(e) => handleSelectAll(e.target.checked)}
          className="rounded border-grey-03 text-blue-04 focus:ring-blue-04"
        />
      </div>
    ),
    cell: ({ row }) => {
      const isSelected = selectedRows.has(row.original.entityId);
      const rowIndex = row.index;
      
      return (
        <div className="flex items-center justify-center">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={(e) => handleRowSelect(row.original.entityId, e.target.checked, rowIndex, e.nativeEvent as unknown as React.MouseEvent)}
            onClick={(e) => {
              // Prevent the default onChange behavior for keyboard shortcuts
              if (e.shiftKey || e.metaKey || e.ctrlKey) {
                e.preventDefault();
                handleRowSelect(row.original.entityId, e.currentTarget.checked, rowIndex, e);
              }
            }}
            className="rounded border-grey-03 text-blue-04 focus:ring-blue-04"
          />
        </div>
      );
    },
    size: 60,
  });

  // Format data columns (same as original TableBlockTable)
  const formatColumns = (columns: Property[]) => {
    const columnSize = 880 / columns.length;

    return columns.map((column) => {
      return columnHelper.accessor((row: Row) => row.columns[column.id] as Cell, {
        id: column.id,
        header: () => {
          const isNameColumn = column.id === SystemIds.NAME_PROPERTY;
          return <Text variant="smallTitle">{isNameColumn ? 'Name' : (column.name ?? column.id)}</Text>;
        },
        size: columnSize ? (columnSize < 150 ? 150 : columnSize) : 150,
      });
    });
  };

  // Create a component for table cells to avoid hook issues
  const TableCellComponent = React.memo(({ 
    cellData, 
    row, 
    space, 
    cellId, 
    isExpanded, 
    onChangeEntry, 
    onLinkEntry, 
    propertiesSchemaFromMeta, 
    sourceFromMeta, 
    isEditable 
  }: {
    cellData: Cell | undefined;
    row: any;
    space: string;
    cellId: string;
    isExpanded: boolean;
    onChangeEntry: onChangeEntryFn;
    onLinkEntry: onLinkEntryFn;
    propertiesSchemaFromMeta: Record<string, Property> | null;
    sourceFromMeta: Source;
    isEditable: boolean;
  }) => {
    if (!cellData) return null;

    const property = propertiesSchemaFromMeta?.[cellData.slotId];
    const propertyId = cellData.renderedPropertyId ? cellData.renderedPropertyId : cellData.slotId;

    const isNameCell = propertyId === SystemIds.NAME_PROPERTY;
    const spaceIdForCell = isNameCell ? (row.original.columns[SystemIds.NAME_PROPERTY]?.space ?? space) : space;

    const entityId = row.original.entityId;
    const nameCell = row.original.columns[SystemIds.NAME_PROPERTY];

    const name = useName(entityId);
    const href = NavUtils.toEntity(nameCell?.space ?? space, entityId);
    const verified = nameCell?.verified;
    const collectionId = nameCell?.collectionId;
    const relationId = nameCell?.relationId;

    if (!property) {
      return null;
    }

    if (isEditable && sourceFromMeta.type !== 'RELATIONS') {
      return (
        <EditableEntityTableCell
          key={entityId}
          entityId={entityId}
          spaceId={spaceIdForCell}
          property={property}
          isPlaceholderRow={Boolean(row.original.placeholder)}
          name={name}
          currentSpaceId={space}
          collectionId={collectionId}
          relationId={relationId}
          toSpaceId={nameCell?.space}
          verified={verified}
          onChangeEntry={onChangeEntry}
          onLinkEntry={onLinkEntry}
          source={sourceFromMeta}
        />
      );
    }

    return (
      <EntityTableCell
        key={entityId}
        entityId={entityId}
        spaceId={spaceIdForCell}
        property={property}
        isExpanded={isExpanded}
        name={name}
        href={href}
        currentSpaceId={space}
        collectionId={collectionId}
        relationId={relationId}
        verified={verified}
        onLinkEntry={onLinkEntry}
        source={sourceFromMeta}
      />
    );
  });

  // Default column cell renderer (same as original)
  const defaultColumn: Partial<ColumnDef<Row>> = {
    cell: ({ getValue, row, table, cell }) => {
      const space = table.options.meta!.space;
      const cellId = `${row.original.entityId}-${cell.column.id}`;
      const isExpanded = Boolean(table.options?.meta?.expandedCells[cellId]);
      const onChangeEntry = table.options.meta!.onChangeEntry;
      const onLinkEntry = table.options.meta!.onLinkEntry;
      const propertiesSchemaFromMeta = table.options.meta!.propertiesSchema;
      const sourceFromMeta = table.options.meta!.source;

      const cellData = getValue<Cell | undefined>();

      // Currently relations (rollup) blocks aren't editable.
      const isEditable = table.options.meta?.isEditable;

      return (
        <TableCellComponent
          cellData={cellData}
          row={row}
          space={space}
          cellId={cellId}
          isExpanded={isExpanded}
          onChangeEntry={onChangeEntry}
          onLinkEntry={onLinkEntry}
          propertiesSchemaFromMeta={propertiesSchemaFromMeta ?? null}
          sourceFromMeta={sourceFromMeta}
          isEditable={isEditable ?? false}
        />
      );
    },
  };

  const table = useReactTable({
    data: rows,
    columns: [selectionColumn, ...formatColumns(properties)],
    defaultColumn,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    meta: {
      expandedCells,
      space: spaceId,
      isEditable: false, // Power Tools is read-only
      onChangeEntry: dummyOnChangeEntry,
      onLinkEntry: dummyOnLinkEntry,
      propertiesSchema: propertiesSchema ?? undefined,
      source,
    },
  });

  const isEmpty = rows.length === 0;

  if (isEmpty) {
    return (
      <div className="block rounded-lg bg-grey-01">
        <div className="flex flex-col items-center justify-center gap-4 p-4 text-resultLink">
          <div>No data found</div>
        </div>
      </div>
    );
  }

  const tableRows = table.getRowModel().rows;

  return (
    <div ref={tableRef} className="h-full overflow-auto">
      <div className="overflow-hidden rounded-lg border border-grey-02 p-0">
        <div className="overflow-x-scroll rounded-lg">
          <table className="relative w-full border-collapse border-hidden bg-white" cellSpacing={0} cellPadding={0}>
            <thead>
              <tr>
                {table.getHeaderGroups()[0]?.headers.map((header) => {
                  const isSelectionColumn = header.id === 'selection';
                  return (
                    <th
                      key={header.id}
                      className={cx(
                        'group relative border-b border-grey-02 p-[10px] text-left',
                        isSelectionColumn ? 'min-w-[60px]' : 'min-w-[250px]'
                      )}
                    >
                      <div className="flex h-full w-full items-center gap-[10px]">
                        {flexRender(header.column.columnDef.header, header.getContext())}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {tableRows.map((row, index: number) => {
                const cells = row.getVisibleCells();
                const entityId = row.original.entityId;
                const isSelected = selectedRows.has(entityId);

                return (
                  <tr 
                    key={entityId ?? index} 
                    className={isSelected ? 'bg-blue-01 hover:bg-blue-01' : 'hover:bg-bg'}
                  >
                    {cells.map(cell => {
                      const cellId = `${row.original.entityId}-${cell.column.id}`;
                      const isSelectionCell = cell.column.id === 'selection';
                      const isShown = true; // Show all columns in Power Tools

                      const nameCell = row.original.columns[SystemIds.NAME_PROPERTY];
                      const href = NavUtils.toEntity(nameCell?.space ?? spaceId, entityId);

                      return (
                        <TableCell
                          key={`${cellId}-${index}-${row.original.entityId}`}
                          isLinkable={false} // Disable linking in Power Tools for now
                          href={href}
                          width={cell.column.getSize()}
                          isShown={isShown}
                          isEditMode={false} // Power Tools is read-only
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Loading indicator for infinite scroll */}
      {hasMore && (
        <div className="flex justify-center p-4">
          <Text variant="body" color="grey-04">
            {isLoadingMore ? 'Loading more rows...' : 'Scroll to load more'}
          </Text>
        </div>
      )}

      {!hasMore && rows.length > 0 && (
        <div className="flex justify-center p-4">
          <Text variant="body" color="grey-04">
            All {rows.length} rows loaded
          </Text>
        </div>
      )}
    </div>
  );
}