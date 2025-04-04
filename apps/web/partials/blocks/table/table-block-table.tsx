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
import { PropertyId } from '~/core/hooks/use-properties';
import { useUserIsEditing } from '~/core/hooks/use-user-is-editing';
import { EntityId, SpaceId } from '~/core/io/schema';
import { Cell, PropertySchema, Row } from '~/core/types';
import { NavUtils } from '~/core/utils/utils';

import { EyeHide } from '~/design-system/icons/eye-hide';
import { TableCell } from '~/design-system/table/cell';
import { Text } from '~/design-system/text';

import { TableBlockTableItem } from '~/partials/blocks/table/table-block-table-item';
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
  column: PropertySchema;
  isEditMode: boolean;
  spaceId: string;
  isLastColumn: boolean;
}) => {
  const isNameColumn = column.id === EntityId(SystemIds.NAME_ATTRIBUTE);

  return isEditMode && !isNameColumn ? (
    <div className={cx(isLastColumn ? 'pr-12' : '')}>
      <EditableEntityTableColumnHeader unpublishedColumns={[]} column={column} entityId={column.id} spaceId={spaceId} />
    </div>
  ) : (
    <Text variant="smallTitle">{isNameColumn ? 'Name' : (column.name ?? column.id)}</Text>
  );
};

const formatColumns = (
  columns: PropertySchema[] = [],
  isEditMode: boolean,
  unpublishedColumns: PropertySchema[],
  spaceId: SpaceId
) => {
  const columnSize = 880 / columns.length;

  return columns.map((column, i) => {
    return columnHelper.accessor(row => row.columns[column.id], {
      id: column.id,
      header: () => {
        const isNameColumn = column.id === EntityId(SystemIds.NAME_ATTRIBUTE);

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
    const propertiesSchema = table.options.meta!.propertiesSchema;
    const source = table.options.meta!.source;

    const cellData = getValue<Cell | undefined>();

    // Currently relations (rollup) blocks aren't editable.
    const isEditable = table.options.meta?.isEditable;

    if (!cellData) return null;

    const maybePropertiesSchema = propertiesSchema?.[PropertyId(cellData.slotId)];
    const filterableRelationType = maybePropertiesSchema?.relationValueTypeId;
    const propertyId = cellData.renderedPropertyId ? cellData.renderedPropertyId : cellData.slotId;

    const isNameCell = propertyId === SystemIds.NAME_ATTRIBUTE;
    const spaceId = isNameCell ? (row.original.columns[SystemIds.NAME_ATTRIBUTE]?.space ?? space) : space;

    const renderables = cellData.renderables;

    if (isEditable && source.type !== 'RELATIONS') {
      return (
        <EditableEntityTableCell
          source={source}
          renderables={renderables}
          attributeId={propertyId}
          entityId={row.original.entityId}
          spaceId={spaceId}
          filterSearchByTypes={filterableRelationType ? [filterableRelationType] : undefined}
          onChangeEntry={onChangeEntry}
          isPlaceholderRow={Boolean(row.original.placeholder)}
        />
      );
    }

    return (
      <EntityTableCell
        entityId={row.original.entityId}
        columnId={propertyId}
        // Don't want to render placeholders in edit mode
        renderables={renderables.filter(r => r.placeholder !== true)}
        space={spaceId}
        isExpanded={isExpanded}
      />
    );
  },
};

type TableBlockTableProps = {
  space: string;
  properties: PropertySchema[];
  propertiesSchema?: Record<PropertyId, PropertySchema>;
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
      onChangeEntry,
      propertiesSchema,
      source,
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

                return (
                  <th
                    key={column.id}
                    className={cx(
                      'group relative min-w-[250px] border-b border-grey-02 p-[10px] text-left',
                      headerClassNames
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
              const entityId = cells?.[0]?.getValue<Cell>()?.cellId;

              return (
                <tr key={entityId ?? index} className="hover:bg-bg">
                  {cells.map(cell => {
                    const cellId = `${row.original.entityId}-${cell.column.id}`;
                    const firstRenderable = cell.getValue<Cell>()?.renderables[0];

                    const isNameCell = Boolean(firstRenderable?.attributeId === SystemIds.NAME_ATTRIBUTE);
                    const isShown = shownColumnIds.includes(cell.column.id);

                    const nameCell = row.original.columns[SystemIds.NAME_ATTRIBUTE];
                    const { name, verified } = nameCell;
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
                        {isNameCell && !row.original.placeholder ? (
                          <TableBlockTableItem
                            isEditing={isEditing}
                            name={name}
                            href={href}
                            currentSpaceId={space}
                            entityId={entityId}
                            spaceId={nameCell?.space}
                            verified={verified}
                            collectionId={nameCell?.collectionId}
                            relationId={nameCell?.relationId}
                            onChangeEntry={onChangeEntry}
                            onLinkEntry={onLinkEntry}
                          />
                        ) : (
                          <>{flexRender(cell.column.columnDef.cell, cell.getContext())}</>
                        )}
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
