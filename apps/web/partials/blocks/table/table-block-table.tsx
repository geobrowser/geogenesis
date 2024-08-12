'use client';

import { SYSTEM_IDS } from '@geogenesis/sdk';
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
import Image from 'next/image';
import Link from 'next/link';

import { useState } from 'react';

import { useAccessControl } from '~/core/hooks/use-access-control';
import { useActionsStore } from '~/core/hooks/use-actions-store';
import { ID } from '~/core/id';
import { useEditable } from '~/core/state/editable-store';
import { DataBlockView, useTableBlock } from '~/core/state/table-block-store';
import { Cell, Column, Row } from '~/core/types';
import { Entities } from '~/core/utils/entity';
import { EntityCell } from '~/core/utils/entity-table/entity-table';
import { Triples } from '~/core/utils/triples';
import { NavUtils, getImagePath } from '~/core/utils/utils';
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
              spaceId={Entities.nameTriple(column.triples)?.space}
            />
          </div>
        ) : (
          <Text variant="smallTitle">{isNameColumn ? 'Name' : Entities.name(column.triples)}</Text>
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
    const { upsert, remove, actions, upsertMany } = useActionsStore();

    // We know that cell is rendered as a React component by react-table
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const { columns, columnRelationTypes } = useTableBlock();

    const cellData = getValue<Cell | undefined>();
    const isEditMode = isEditor && editable;

    if (!cellData) return null;

    const valueType = columnValueType(cellData.columnId, columns);

    const cellTriples = pipe(
      actions[space] ?? [],
      // @TODO(migration): Each cell only has one triple for a given (S,E,A)
      actions => Triples.merge(actions, cellData.triples),
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
          key={Entities.name(cellTriples)}
          triples={cellTriples}
          cell={cellData}
          upsert={upsert}
          upsertMany={upsertMany}
          remove={remove}
          space={space}
          valueType={valueType}
          columnName={columnName(cellData.columnId, columns)}
          columnRelationTypes={columnRelationTypes[cellData.columnId]}
        />
      );
    }

    return (
      <EntityTableCell
        key={Entities.name(cellTriples)}
        cell={cellData}
        triples={cellTriples}
        space={space}
        isExpanded={isExpanded}
      />
    );
  },
};

interface Props {
  space: string;
  typeId: string;
  columns: Column[];
  rows: Row[];
  shownColumnIds: string[];
  view: DataBlockView;
  placeholder: { text: string; image: string };
}

export const TableBlockTable = ({ rows, space, typeId, columns, shownColumnIds, placeholder, view }: Props) => {
  const isEditingColumns = useAtomValue(editingColumnsAtom);

  const [expandedCells, setExpandedCells] = useState<Record<string, boolean>>({});
  const { editable } = useEditable();
  const { isEditor, isMember } = useAccessControl(space);
  const isEditMode = (isEditor || isMember) && editable;

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
        pageSize: 9,
      },
    },
    meta: {
      expandedCells,
      space,
      editable,
      isEditor: isEditor || isMember,
    },
  });

  const isEmpty = rows.length === 0;

  if (isEmpty) {
    if (isEditMode) {
      return (
        <Link href={NavUtils.toEntity(space, ID.createEntityId(), typeId)} className="block rounded-lg bg-grey-01">
          <div className="flex flex-col items-center justify-center gap-4 p-4 text-lg">
            <div>{placeholder.text}</div>
            <div>
              <img src={placeholder.image} className="!h-[64px] w-auto object-contain" alt="" />
            </div>
          </div>
        </Link>
      );
    }

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

  switch (view) {
    case 'TABLE':
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
                        : !isEditingColumns || !isEditMode
                        ? 'hidden'
                        : '!bg-grey-01 !text-grey-03';

                      return (
                        <th
                          key={header.id}
                          className={cx(
                            'group relative min-w-[250px] border border-b-0 border-grey-02 p-[10px] text-left',
                            headerClassNames
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
                      {cells.map(cell => {
                        const cellId = `${row.original.id}-${cell.column.id}`;
                        const firstTriple = cell.getValue<Cell>()?.triples[0];
                        const isExpandable = firstTriple && firstTriple.value.type === 'TEXT';
                        const isShown = shownColumnIds.includes(cell.column.id);

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
    case 'LIST':
      return (
        <div className="flex flex-col gap-4">
          {rows.map((row, index: number) => {
            const nameCell = row[SYSTEM_IDS.NAME] as EntityCell;
            const { entityId, name, description, image } = nameCell;

            return (
              <div key={index}>
                <Link href={NavUtils.toEntity(space, entityId)} className="group inline-flex items-center gap-6 pr-6">
                  <div className="relative h-20 w-20 flex-shrink-0 overflow-clip rounded-lg bg-grey-01">
                    {image && (
                      <Image
                        src={getImagePath(image)}
                        className="object-cover transition-transform duration-150 ease-in-out group-hover:scale-105"
                        alt=""
                        fill
                      />
                    )}
                  </div>
                  <div>
                    <div className="truncate text-tableCell font-medium text-text">{name}</div>
                    {description && <div className="mt-0.5 text-metadata text-grey-04">{description}</div>}
                  </div>
                </Link>
              </div>
            );
          })}
        </div>
      );
    case 'GALLERY':
      return (
        <div className="grid grid-cols-3 gap-x-4 gap-y-10">
          {rows.map((row, index: number) => {
            const nameCell = row[SYSTEM_IDS.NAME] as EntityCell;
            const { entityId, name, image } = nameCell;

            return (
              <Link key={index} href={NavUtils.toEntity(space, entityId)} className="group flex flex-col gap-3">
                <div className="relative aspect-[2/1] w-full overflow-clip rounded-lg bg-grey-01">
                  {image && (
                    <Image
                      src={getImagePath(image)}
                      className="object-cover transition-transform duration-150 ease-in-out group-hover:scale-105"
                      alt=""
                      fill
                    />
                  )}
                </div>
                <div className={cx('truncate text-tableCell font-medium text-text')}>{name}</div>
              </Link>
            );
          })}
        </div>
      );
  }
};
