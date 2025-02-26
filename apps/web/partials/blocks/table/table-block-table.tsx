'use client';

import { SYSTEM_IDS } from '@graphprotocol/grc-20';
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

import { useDataBlock } from '~/core/blocks/data/use-data-block';
import { PropertyId } from '~/core/hooks/use-properties';
import { useUserIsEditing } from '~/core/hooks/use-user-is-editing';
import { SpaceId } from '~/core/io/schema';
import { Cell, PropertySchema, Row } from '~/core/types';
import { NavUtils } from '~/core/utils/utils';

import { CheckCircle } from '~/design-system/icons/check-circle';
import { EyeHide } from '~/design-system/icons/eye-hide';
import { TableCell } from '~/design-system/table/cell';
import { Text } from '~/design-system/text';

import { EntityTableCell } from '~/partials/entities-page/entity-table-cell';
import { EditableEntityTableCell } from '~/partials/entity-page/editable-entity-table-cell';
import { EditableEntityTableColumnHeader } from '~/partials/entity-page/editable-entity-table-column-header';

import { editingPropertiesAtom } from '~/atoms';

const columnHelper = createColumnHelper<Row>();

const formatColumns = (
  columns: PropertySchema[] = [],
  isEditMode: boolean,
  unpublishedColumns: PropertySchema[],
  spaceId: SpaceId
) => {
  const columnSize = 784 / columns.length;

  return columns.map((column, i) =>
    columnHelper.accessor(row => row.columns[column.id], {
      id: column.id,
      header: () => {
        const isNameColumn = column.id === SYSTEM_IDS.NAME_ATTRIBUTE;

        /* Add some right padding for the last column to account for the add new column button */
        const isLastColumn = i === columns.length - 1;

        return isEditMode && !isNameColumn ? (
          <div className={cx(isLastColumn ? 'pr-12' : '')}>
            <EditableEntityTableColumnHeader
              unpublishedColumns={unpublishedColumns}
              column={column}
              entityId={column.id}
              spaceId={spaceId}
            />
          </div>
        ) : (
          <Text variant="smallTitle">{isNameColumn ? 'Name' : (column.name ?? column.id)}</Text>
        );
      },
      size: columnSize ? (columnSize < 150 ? 150 : columnSize) : 150,
    })
  );
};

const defaultColumn: Partial<ColumnDef<Row>> = {
  cell: ({ getValue, row, table, cell }) => {
    const spaceId = table.options.meta!.space;
    const cellId = `${row.original.entityId}-${cell.column.id}`;
    const isExpanded = Boolean(table.options?.meta?.expandedCells[cellId]);

    // We know that cell is rendered as a React component by react-table
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const { propertiesSchema } = useDataBlock();

    const cellData = getValue<Cell | undefined>();

    // Currently relations (rollup) blocks aren't editable.
    const isEditable = table.options.meta?.isEditable;

    if (!cellData) return null;

    const maybePropertiesSchema = propertiesSchema?.[PropertyId(cellData.slotId)];
    const filterableRelationType = maybePropertiesSchema?.relationValueTypeId;
    const propertyId = cellData.renderedPropertyId ? cellData.renderedPropertyId : cellData.slotId;

    const renderables = cellData.renderables;

    if (isEditable) {
      return (
        <EditableEntityTableCell
          renderables={renderables}
          attributeId={propertyId}
          entityId={cellData.cellId}
          spaceId={spaceId}
          filterSearchByTypes={filterableRelationType ? [filterableRelationType] : undefined}
        />
      );
    }

    return (
      <EntityTableCell
        entityId={cellData.cellId}
        columnId={propertyId}
        // Don't want to render placeholders in edit mode
        renderables={renderables.filter(r => r.placeholder !== true)}
        space={spaceId}
        isExpanded={isExpanded}
      />
    );
  },
};

interface Props {
  space: string;
  properties: PropertySchema[];
  rows: Row[];
  shownColumnIds: string[];
  placeholder: { text: string; image: string };
}

// eslint-disable-next-line react/display-name
export const TableBlockTable = React.memo(({ rows, space, properties, shownColumnIds, placeholder }: Props) => {
  const isEditing = useUserIsEditing(space);
  const isEditingColumns = useAtomValue(editingPropertiesAtom);
  const [expandedCells, setExpandedCells] = useState<Record<string, boolean>>({});

  const table = useReactTable({
    data: rows,
    columns: formatColumns(properties, isEditing, [], SpaceId(space)),
    defaultColumn,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    state: {
      pagination: {
        pageIndex: 0,
        pageSize: 9,
      },
    },
    meta: {
      expandedCells,
      space,
      isEditable: isEditing,
    },
  });

  const isEmpty = rows.length === 0;

  if (isEmpty) {
    return (
      <div className="block rounded-lg bg-grey-01">
        <div className="flex flex-col items-center justify-center gap-4 p-4 text-lg">
          <div>{placeholder.text}</div>
          <div>
            <img src={placeholder.image} className="!h-[64px] w-auto object-contain" alt="" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-grey-02 p-0">
      <div className="overflow-x-scroll rounded-lg">
        <table className="relative w-full border-collapse border-hidden bg-white" cellSpacing={0} cellPadding={0}>
          <thead>
            {table.getHeaderGroups().map(headerGroup => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map(header => {
                  const isShown = shownColumnIds.includes(header.id);
                  const headerClassNames = isShown
                    ? null
                    : !isEditingColumns || !isEditing
                      ? 'hidden'
                      : '!bg-grey-01 !text-grey-03';

                  return (
                    <th
                      key={header.id}
                      className={cx(
                        'group relative min-w-[250px] border-b border-grey-02 p-[10px] text-left',
                        headerClassNames
                      )}
                    >
                      <div className="flex h-full w-full items-center gap-[10px]">
                        {isEditing && !isShown ? <EyeHide /> : null}
                        {flexRender(header.column.columnDef.header, header.getContext())}
                      </div>
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row, index: number) => {
              const cells = row.getVisibleCells();
              const entityId = cells?.[0]?.getValue<Cell>()?.cellId;

              return (
                <tr key={entityId ?? index} className="hover:bg-bg">
                  {cells.map(cell => {
                    const cellId = `${row.original.entityId}-${cell.column.id}`;
                    const firstTriple = cell.getValue<Cell>()?.renderables.find(r => r.type === 'TEXT');

                    const isNameCell = Boolean(firstTriple?.attributeId === SYSTEM_IDS.NAME_ATTRIBUTE);
                    const isExpandable = firstTriple && firstTriple.type === 'TEXT';
                    const isShown = shownColumnIds.includes(cell.column.id);

                    const href = NavUtils.toEntity(
                      isNameCell ? (row.original.columns[SYSTEM_IDS.NAME_ATTRIBUTE]?.space ?? space) : space,
                      entityId
                    );
                    const { verified } = row.original.columns[SYSTEM_IDS.NAME_ATTRIBUTE];

                    return (
                      <TableCell
                        key={cellId}
                        isLinkable={isNameCell && isEditing}
                        href={href}
                        isExpandable={isExpandable}
                        isExpanded={expandedCells[cellId]}
                        width={cell.column.getSize()}
                        toggleExpanded={() =>
                          setExpandedCells(prev => ({
                            ...prev,
                            [cellId]: !prev[cellId],
                          }))
                        }
                        isShown={isShown}
                        isEditMode={isEditing}
                      >
                        {isNameCell && verified && (
                          <span>
                            <CheckCircle color={isEditing ? 'text' : 'ctaPrimary'} />
                          </span>
                        )}
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
  );
});
