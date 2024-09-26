'use client';

import { SYSTEM_IDS } from '@geobrowser/gdk';
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

import * as React from 'react';
import { useState } from 'react';

import { getTriples } from '~/core/database/triples';
import { useUserIsEditing } from '~/core/hooks/use-user-is-editing';
import { SearchResult } from '~/core/io/dto/search';
import { EntityId, SpaceId } from '~/core/io/schema';
import { upsertCollectionItemRelation } from '~/core/state/editor/data-entity';
import { Source } from '~/core/state/editor/types';
import { DataBlockView, useTableBlock } from '~/core/state/table-block-store';
import { Cell, Row, Schema } from '~/core/types';
import { Entities } from '~/core/utils/entity';
import { EntityCell } from '~/core/utils/entity-table/entity-table';
import { NavUtils, getImagePath } from '~/core/utils/utils';
import { valueTypes } from '~/core/value-types';

import { EyeHide } from '~/design-system/icons/eye-hide';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';
import { SelectEntity } from '~/design-system/select-entity';
import { TableCell } from '~/design-system/table/cell';
import { Text } from '~/design-system/text';

import { EntityTableCell } from '~/partials/entities-page/entity-table-cell';
import { EditableEntityTableCell } from '~/partials/entity-page/editable-entity-table-cell';
import { EditableEntityTableColumnHeader } from '~/partials/entity-page/editable-entity-table-column-header';

import { columnName, columnValueType } from './utils';
import { editingColumnsAtom } from '~/atoms';

const columnHelper = createColumnHelper<Row>();

const formatColumns = (columns: Schema[] = [], isEditMode: boolean, unpublishedColumns: Schema[], spaceId: SpaceId) => {
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
              spaceId={spaceId}
            />
          </div>
        ) : (
          <Text variant="smallTitle">{isNameColumn ? 'Name' : column.name ?? column.id}</Text>
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

    // We know that cell is rendered as a React component by react-table
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const { columns, columnRelationTypes } = useTableBlock();

    const cellData = getValue<Cell | undefined>();
    const isEditable = table.options.meta?.isEditable;

    if (!cellData) return null;

    const valueType = columnValueType(cellData.columnId, columns);

    const cellTriples = getTriples({
      mergeWith: cellData.triples,
      selector: triple => {
        const isRowCell = triple.entityId === cellData.entityId;
        const isColCell = triple.attributeId === cellData.columnId;
        const isCurrentValueType = triple.value.type === valueTypes[valueType];

        return isRowCell && isColCell && isCurrentValueType;
      },
    });

    if (isEditable) {
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
  columns: Schema[];
  rows: Row[];
  shownColumnIds: string[];
  view: DataBlockView;
  source: Source;
  placeholder: { text: string; image: string };
}

// eslint-disable-next-line react/display-name
export const TableBlockTable = React.memo(
  ({ rows, space, columns, shownColumnIds, placeholder, view, source }: Props) => {
    const isEditingColumns = useAtomValue(editingColumnsAtom);

    const [expandedCells, setExpandedCells] = useState<Record<string, boolean>>({});
    const isEditable = useUserIsEditing(space);

    // @TODO(data blocks): Somehow need to make a placeholder row
    // For now we'll make a button where someone can create a new row easily

    const table = useReactTable({
      data: rows,
      columns: formatColumns(columns, isEditable, [], SpaceId(space)),
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
        isEditable: isEditable,
      },
    });

    const onSelectCollectionItem = (entity: Pick<SearchResult, 'id' | 'name'>) => {
      if (source.type === 'COLLECTION') {
        upsertCollectionItemRelation({
          collectionId: EntityId(source.value),
          spaceId: SpaceId(space),
          toEntity: {
            id: entity.id,
            name: entity.name,
          },
        });
      }
    };

    const isEmpty = rows.length === 0;

    if (isEmpty && source.type !== 'COLLECTION') {
      if (isEditable) {
        return (
          <div className="block rounded-lg bg-grey-01">
            <div className="flex flex-col items-center justify-center gap-4 p-4 text-lg">
              <div>{placeholder.text}</div>
              <img src={placeholder.image} className="!h-[64px] w-auto object-contain" alt="" />
            </div>
          </div>
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
                          : !isEditingColumns || !isEditable
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
                              {isEditable && !isShown ? <EyeHide /> : null}
                              {flexRender(header.column.columnDef.header, header.getContext())}
                            </div>
                          </th>
                        );
                      })}
                    </tr>
                  ))}
                </thead>
                <tbody>
                  {source.type === 'COLLECTION' && isEditable && (
                    <TableCell width={784} isExpanded={false} toggleExpanded={() => {}} isShown>
                      <SelectEntity spaceId={space} onDone={onSelectCollectionItem} />
                    </TableCell>
                  )}
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
                              isLinkable={Boolean(firstTriple?.attributeId === SYSTEM_IDS.NAME) && isEditable}
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
                              isEditMode={isEditable}
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
  }
);
