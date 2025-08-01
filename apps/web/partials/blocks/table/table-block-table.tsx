import { SystemIds } from '@graphprotocol/grc-20';
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

import { Source } from '~/core/blocks/data/source';
import { useUserIsEditing } from '~/core/hooks/use-user-is-editing';
import { useName } from '~/core/state/entity-page-store/entity-store';
import { NavUtils } from '~/core/utils/utils';
import { Cell, Property, Row } from '~/core/v2.types';

import { EyeHide } from '~/design-system/icons/eye-hide';
import { TableCell } from '~/design-system/table/cell';
import { Text } from '~/design-system/text';

import { EntityTableCell } from '~/partials/entities-page/entity-table-cell';
import { EditableEntityTableCell } from '~/partials/entity-page/editable-entity-table-cell';
import { EditableEntityTableColumnHeader } from '~/partials/entity-page/editable-entity-table-column-header';

import type { onChangeEntryFn, onLinkEntryFn } from './change-entry';
import { editingPropertiesAtom } from '~/atoms';

const columnHelper = createColumnHelper<Row>();

const ColumnHeader = ({
  column,
  isEditMode,
  spaceId,
  isLastColumn,
}: {
  column: Property;
  isEditMode: boolean;
  spaceId: string;
  isLastColumn: boolean;
}) => {
  const isNameColumn = column.id === SystemIds.NAME_PROPERTY;

  return isEditMode && !isNameColumn ? (
    <div className={cx(isLastColumn ? 'pr-12' : '')}>
      <EditableEntityTableColumnHeader unpublishedColumns={[]} column={column} entityId={column.id} spaceId={spaceId} />
    </div>
  ) : (
    <Text variant="smallTitle">{isNameColumn ? 'Name' : (column.name ?? column.id)}</Text>
  );
};

const formatColumns = (
  columns: { id: string; name: string | null }[] = [],
  isEditMode: boolean,
  unpublishedColumns: { id: string }[],
  spaceId: string
) => {
  const columnSize = 880 / columns.length;

  return columns.map((column, i) => {
    return columnHelper.accessor(row => row.columns[column.id], {
      id: column.id,
      header: () => {
        const isNameColumn = column.id === SystemIds.NAME_PROPERTY;

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
    });
  });
};

const defaultColumn: Partial<ColumnDef<Row>> = {
  cell: ({ getValue, row, table, cell }) => {
    const space = table.options.meta!.space;
    const cellId = `${row.original.entityId}-${cell.column.id}`;
    const isExpanded = Boolean(table.options?.meta?.expandedCells[cellId]);
    const onChangeEntry = table.options.meta!.onChangeEntry;
    const onLinkEntry = table.options.meta!.onLinkEntry;
    const propertiesSchema = table.options.meta!.propertiesSchema;
    const source = table.options.meta!.source;

    const cellData = getValue<Cell | undefined>();

    // Currently relations (rollup) blocks aren't editable.
    const isEditable = table.options.meta?.isEditable;

    if (!cellData) return null;

    const property = propertiesSchema?.[cellData.slotId];
    const propertyId = cellData.renderedPropertyId ? cellData.renderedPropertyId : cellData.slotId;

    const isNameCell = propertyId === SystemIds.NAME_PROPERTY;
    const spaceId = isNameCell ? (row.original.columns[SystemIds.NAME_PROPERTY]?.space ?? space) : space;

    const entityId = row.original.entityId;
    const nameCell = row.original.columns[SystemIds.NAME_PROPERTY];

    // We are in a component internally within react-table. eslint isn't
    // able to infer that this is a valid React component.
    // eslint-disable-next-line
    const name = useName(entityId);
    const href = NavUtils.toEntity(nameCell.space ?? space, entityId);
    const verified = nameCell?.verified;
    const collectionId = nameCell?.collectionId;
    const relationId = nameCell?.relationId;

    if (!property) {
      return null;
    }

    if (isEditable && source.type !== 'RELATIONS') {
      return (
        <EditableEntityTableCell
          key={entityId}
          entityId={entityId}
          spaceId={spaceId}
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
          source={source}
        />
      );
    }

    return (
      <EntityTableCell
        key={entityId}
        entityId={entityId}
        spaceId={spaceId}
        property={property}
        isExpanded={isExpanded}
        name={name}
        href={href}
        currentSpaceId={space}
        collectionId={collectionId}
        relationId={relationId}
        verified={verified}
        onLinkEntry={onLinkEntry}
        source={source}
      />
    );
  },
};

type TableBlockTableProps = {
  space: string;
  properties: Property[];
  propertiesSchema?: Record<string, Property>;
  rows: Row[];
  shownColumnIds: string[];
  placeholder: { text: string; image: string };
  onChangeEntry: onChangeEntryFn;
  onLinkEntry: onLinkEntryFn;
  source: Source;
};

export const TableBlockTable = ({
  rows,
  space,
  properties,
  propertiesSchema,
  shownColumnIds,
  placeholder,
  onChangeEntry,
  onLinkEntry,
  source,
}: TableBlockTableProps) => {
  const isEditing = useUserIsEditing(space);
  const isEditingColumns = useAtomValue(editingPropertiesAtom);
  const [expandedCells] = useState<Record<string, boolean>>({});

  const table = useReactTable({
    data: rows,
    columns: formatColumns(properties, isEditing, [], space),
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
      onChangeEntry,
      onLinkEntry,
      propertiesSchema,
      source,
    },
  });

  const isEmpty = rows.length === 0;

  if (isEmpty) {
    return (
      <div className="block rounded-lg bg-grey-01">
        <div className="flex flex-col items-center justify-center gap-4 p-4 text-resultLink">
          <div>{placeholder.text}</div>
          <div>
            <img src={placeholder.image} className="!h-[64px] w-auto object-contain" alt="" />
          </div>
        </div>
      </div>
    );
  }

  /**
   * We don't use headers from the react table instance. There's a bug where
   * on initial load of collections with additional properties, the content
   * of the table won't render. The data _is_ there, but for some reason the
   * table is stale and doesn't re-render with the appropriate data. Using our
   * own header implementation seems to fix it for some reason.
   */
  const tableRows = table.getRowModel().rows;

  return (
    <div className="overflow-hidden rounded-lg border border-grey-02 p-0">
      <div className="overflow-x-scroll rounded-lg">
        <table className="relative w-full border-collapse border-hidden bg-white" cellSpacing={0} cellPadding={0}>
          <thead>
            <tr>
              {properties.map((column, i) => {
                const isShown = shownColumnIds.includes(column.id);
                const headerClassNames = isShown
                  ? null
                  : !isEditingColumns || !isEditing
                    ? 'hidden'
                    : '!bg-grey-01 !text-grey-03';

                const isEditingDateTime = column.dataType === 'TIME';

                return (
                  <th
                    key={column.id}
                    className={cx(
                      'group relative border-b border-grey-02 p-[10px] text-left',
                      headerClassNames,
                      !isEditingDateTime ? 'min-w-[250px]' : 'min-w-[300px]'
                    )}
                  >
                    <div className="flex h-full w-full items-center gap-[10px]">
                      {isEditing && !isShown ? <EyeHide /> : null}
                      <ColumnHeader
                        key={column.id}
                        column={column}
                        isEditMode={isEditing}
                        isLastColumn={i === properties.length - 1}
                        spaceId={space}
                      />
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {tableRows.map((row, index: number) => {
              const cells = row.getVisibleCells();
              const entityId = cells?.[0]?.getValue<Cell>()?.propertyId;

              return (
                <tr key={entityId ?? index} className="hover:bg-bg">
                  {cells.map(cell => {
                    const cellId = `${row.original.entityId}-${cell.column.id}`;
                    const propertyId = cell.getValue<Cell>().propertyId;

                    const isNameCell = propertyId === SystemIds.NAME_PROPERTY;
                    const isShown = shownColumnIds.includes(cell.column.id);

                    const nameCell = row.original.columns[SystemIds.NAME_PROPERTY];
                    const href = NavUtils.toEntity(nameCell.space ?? space, entityId);

                    return (
                      <TableCell
                        key={`${cellId}-${index}-${row.original.entityId}`}
                        isLinkable={isNameCell && isEditing}
                        href={href}
                        width={cell.column.getSize()}
                        isShown={isShown}
                        isEditMode={isEditing}
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

// @TODO(migration): Do we still need these?
// const DATETIME_VALUE_TYPES = ['3mswMrL91GuYTfBq29EuNE', 'WDD55r9x6FHTayQnEmTn5S'];
