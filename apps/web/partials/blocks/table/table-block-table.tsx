'use client';

import { SYSTEM_IDS } from '@geogenesis/ids';
import { A, pipe } from '@mobily/ts-belt';
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
import Link from 'next/link';

import { useState } from 'react';

import { useAccessControl } from '~/core/hooks/use-access-control';
import { useActionsStore } from '~/core/hooks/use-actions-store';
import { ID } from '~/core/id';
import { useEditable } from '~/core/state/editable-store';
import { useTableBlock } from '~/core/state/table-block-store';
import { Cell, Column, Row } from '~/core/types';
import { Entity } from '~/core/utils/entity';
import { Triple } from '~/core/utils/triple';
import { NavUtils } from '~/core/utils/utils';
import { valueTypes } from '~/core/value-types';

import { EyeHide } from '~/design-system/icons/eye-hide';
import { TableCell } from '~/design-system/table/cell';
import { Text } from '~/design-system/text';

import { EntityTableCell } from '~/partials/entities-page/entity-table-cell';
import { EditableEntityTableCell } from '~/partials/entity-page/editable-entity-table-cell';
import { EditableEntityTableColumnHeader } from '~/partials/entity-page/editable-entity-table-column-header';

import { columnName, columnValueType } from './utils';
import { editingColumnsAtom } from '~/atoms';

const columnHelper = createColumnHelper<Row>();

const formatColumns = (columns: Column[] = [], isEditMode: boolean, unpublishedColumns: Column[]) => {
  const columnSize = 784 / columns.length;

  return columns.map((column, i) =>
    columnHelper.accessor(row => row[column.id], {
      id: column.id,
      header: () => {
        const isNameColumn = column.id === SYSTEM_IDS.NAME;

        /* Add some right padding for the last column to account for the add new column button */
        const isLastColumn = i === columns.length - 1;

        return isEditMode && !isNameColumn ? (
          <div className={cx(isLastColumn ? 'pr-12' : '')}>
            <EditableEntityTableColumnHeader
              unpublishedColumns={unpublishedColumns}
              column={column}
              entityId={column.id}
              spaceId={Entity.nameTriple(column.triples)?.space}
            />
          </div>
        ) : (
          <Text variant="smallTitle">{isNameColumn ? 'Name' : Entity.name(column.triples)}</Text>
        );
      },
      size: columnSize ? (columnSize < 150 ? 150 : columnSize) : 150,
    })
  );
};

const defaultColumn: Partial<ColumnDef<Row>> = {
  cell: ({ getValue, row, table, cell }) => {
    const space = table.options.meta!.space;
    const cellId = `${row.original.id}-${cell.column.id}`;
    const isExpanded = Boolean(table.options?.meta?.expandedCells[cellId]);
    const editable = table.options.meta?.editable;
    const isEditor = table.options.meta?.isEditor;

    // We know that cell is rendered as a React component by react-table
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const { create, update, remove, actions } = useActionsStore();

    // We know that cell is rendered as a React component by react-table
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const { columns, columnRelationTypes } = useTableBlock();

    const cellData = getValue<Cell | undefined>();
    const isEditMode = isEditor && editable;
    const isPlaceholderCell = cellData?.triples[0]?.placeholder;

    if (!cellData) return null;

    const valueType = columnValueType(cellData.columnId, columns);

    const cellTriples = pipe(
      actions[space],
      actions => Triple.fromActions(actions, cellData.triples),
      A.filter(triple => {
        const isRowCell = triple.entityId === cellData.entityId;
        const isColCell = triple.attributeId === cellData.columnId;
        const isCurrentValueType = triple.value.type === valueTypes[valueType];

        return isRowCell && isColCell && isCurrentValueType;
      })
    );

    if (isEditMode) {
      return (
        <EditableEntityTableCell
          // HACK (baiirun): For some reason the table value for the name field is stale
          // when changing the selectedType in edit mode. When debugging it looks like the
          // cell has the correct data, but the value of the name is the value of the last
          // cell in the previous selectedType. For now we can use a key to force the
          // cell to re-mount when the selectedType and name changes.
          key={Entity.name(cellTriples)}
          triples={cellTriples}
          cell={cellData}
          create={create}
          update={update}
          remove={remove}
          space={space}
          valueType={valueType}
          columnName={columnName(cellData.columnId, columns)}
          columnRelationTypes={columnRelationTypes[cellData.columnId]}
        />
      );
    } else if (cellData && !isPlaceholderCell) {
      return (
        <EntityTableCell
          key={Entity.name(cellTriples)}
          cell={cellData}
          triples={cellTriples}
          space={space}
          isExpanded={isExpanded}
        />
      );
    } else {
      return null;
    }
  },
};

interface Props {
  space: string;
  typeId: string;
  columns: Column[];
  rows: Row[];
  shownIndexes: Array<number>;
  placeholderText: string;
  placeholderImage: string;
}

export const TableBlockTable = ({
  rows,
  space,
  typeId,
  columns,
  shownIndexes,
  placeholderText,
  placeholderImage,
}: Props) => {
  const isEditingColumns = useAtomValue(editingColumnsAtom);

  const [expandedCells, setExpandedCells] = useState<Record<string, boolean>>({});
  const { editable } = useEditable();
  const { isEditor } = useAccessControl(space);
  const isEditMode = isEditor && editable;

  const table = useReactTable({
    data: rows,
    columns: formatColumns(columns, isEditMode, []),
    defaultColumn,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    state: {
      pagination: {
        pageIndex: 0,
        pageSize: 10,
      },
    },
    meta: {
      expandedCells,
      space,
      editable,
      isEditor,
    },
  });

  const isEmpty = table.getRowModel().rows.length === 0;

  if (isEmpty) {
    if (isEditMode) {
      return (
        <Link href={NavUtils.toEntity(space, ID.createEntityId(), typeId)} className="block rounded-lg bg-grey-01">
          <div className="flex flex-col items-center justify-center gap-4 p-4 text-lg">
            <div>{placeholderText}</div>
            <div>
              <img src={placeholderImage} className="!h-[64px] w-auto object-contain" alt="" />
            </div>
          </div>
        </Link>
      );
    }

    return (
      <div className="block rounded-lg bg-grey-01">
        <div className="flex flex-col items-center justify-center gap-4 p-4 text-lg">
          <div>{placeholderText}</div>
          <div>
            <img src={placeholderImage} className="!h-[64px] w-auto object-contain" alt="" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-grey-02 p-0 shadow-button">
      <div className="overflow-x-scroll rounded-lg">
        <table className="relative w-full border-collapse border-hidden bg-white" cellSpacing={0} cellPadding={0}>
          <thead>
            {table.getHeaderGroups().map(headerGroup => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header, index: number) => {
                  const isShown = shownIndexes.includes(index);

                  return (
                    <th
                      key={header.id}
                      className={cx(
                        !isShown ? (!isEditingColumns || !isEditMode ? 'hidden' : '!bg-grey-01 !text-grey-03') : null,
                        'group relative min-w-[250px] border border-b-0 border-grey-02 p-[10px] text-left'
                      )}
                    >
                      <div className="flex h-full w-full items-center gap-[10px]">
                        {isEditMode && !isShown ? <EyeHide /> : null}
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
              const entityId = cells?.[0]?.getValue<Cell>()?.entityId;

              return (
                <tr key={entityId ?? index} className="hover:bg-bg">
                  {cells.map((cell, index: number) => {
                    const cellId = `${row.original.id}-${cell.column.id}`;
                    const firstTriple = cell.getValue<Cell>()?.triples[0];
                    const isExpandable = firstTriple && firstTriple.value.type === 'string';
                    const isShown = shownIndexes.includes(index);

                    return (
                      <TableCell
                        key={cellId}
                        isLinkable={Boolean(firstTriple?.attributeId === SYSTEM_IDS.NAME) && editable}
                        href={NavUtils.toEntity(space, entityId)}
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
                        isEditMode={isEditMode}
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
  );
};
