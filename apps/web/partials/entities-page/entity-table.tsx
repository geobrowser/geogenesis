'use client';

import { SYSTEM_IDS } from '@geogenesis/sdk';
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

import { useState } from 'react';

import { getRelations } from '~/core/database/relations';
import { getTriples } from '~/core/database/triples';
import { useUserIsEditing } from '~/core/hooks/use-user-is-editing';
import { DEFAULT_PAGE_SIZE } from '~/core/state/entity-table-store/entity-table-store';
import { useEntityTable } from '~/core/state/entity-table-store/entity-table-store';
import { Cell, PropertySchema, Row } from '~/core/types';
import { Entities } from '~/core/utils/entity';
import { toRenderables } from '~/core/utils/to-renderables';
import { NavUtils } from '~/core/utils/utils';
import { valueTypes } from '~/core/value-types';

import { TableCell } from '~/design-system/table/cell';
import { EmptyTableText } from '~/design-system/table/styles';
import { Text } from '~/design-system/text';

import { columnName, columnValueType } from '../blocks/table/utils';
import { EditableEntityTableCell } from '../entity-page/editable-entity-table-cell';
import { EditableEntityTableColumnHeader } from '../entity-page/editable-entity-table-column-header';
import { AddNewColumn } from './add-new-column';
import { EntityTableCell } from './entity-table-cell';

const columnHelper = createColumnHelper<Row>();

const formatColumns = (columns: PropertySchema[] = [], isEditMode: boolean, unpublishedColumns: PropertySchema[]) => {
  const columnSize = 1200 / columns.length;

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
              // @TODO: fix later
              spaceId={''}
            />
          </div>
        ) : (
          <Text variant="smallTitle">{isNameColumn ? 'Name' : column.name ?? column.id}</Text>
        );
      },
      size: columnSize ? (columnSize < 300 ? 300 : columnSize) : 300,
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
    const { columns } = useEntityTable();

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

    const cellRelations = getRelations({
      mergeWith: cellData.relations,
      selector: relation => {
        const isRowCell = relation.fromEntity.id === cellData.entityId;
        const isColCell = relation.typeOf.id === cellData.columnId;

        return isRowCell && isColCell;
      },
    });

    const renderables = toRenderables({
      entityId: cellData.entityId,
      entityName: Entities.name(cellTriples),
      spaceId,
      triples: cellTriples,
      relations: cellRelations,
      // @TODO: Might need to add placeholders for each column that we're rendering
      placeholderRenderables: [],
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
          renderables={renderables}
          attributeId={cellData.columnId}
          entityId={cellData.entityId}
          spaceId={spaceId}
          columnRelationTypes={[]}
        />
      );
    } else if (cellData) {
      return (
        <EntityTableCell
          key={Entities.name(cellTriples)}
          entityId={cellData.entityId}
          columnId={cellData.columnId}
          renderables={renderables}
          space={spaceId}
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
  columns: PropertySchema[];
  rows: Row[];
}

export const EntityTable = ({ rows, space, columns }: Props) => {
  const [expandedCells, setExpandedCells] = useState<Record<string, boolean>>({});
  const { selectedType, unpublishedColumns } = useEntityTable();
  const isEditable = useUserIsEditing(space);

  const table = useReactTable({
    data: rows,
    columns: formatColumns(columns, isEditable, unpublishedColumns),
    defaultColumn,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    state: {
      pagination: {
        pageIndex: 0,
        pageSize: DEFAULT_PAGE_SIZE,
      },
    },
    meta: {
      expandedCells,
      space,
      isEditable,
    },
  });

  return (
    <div className="overflow-x-scroll rounded">
      <table className="relative w-full border-collapse border-hidden bg-white" cellSpacing={0} cellPadding={0}>
        <thead>
          {table.getHeaderGroups().map(headerGroup => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map(header => (
                <th
                  key={header.id}
                  className="lg:min-w-none min-w-[300px] border border-b-0 border-grey-02 p-[10px] text-left"
                  style={{ minWidth: header.column.getSize() }}
                >
                  {flexRender(header.column.columnDef.header, header.getContext())}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        {isEditable && selectedType && <AddNewColumn space={space} selectedType={selectedType} />}
        <tbody>
          {table.getRowModel().rows.length === 0 && (
            <tr>
              <EmptyTableText>No results found</EmptyTableText>
            </tr>
          )}
          {table.getRowModel().rows.map((row, index: number) => {
            const cells = row.getVisibleCells();
            const entityId = cells?.[0]?.getValue<Cell>()?.entityId;

            return (
              <tr key={entityId ?? index} className="hover:bg-bg">
                {cells.map(cell => {
                  const cellId = `${row.original.entityId}-${cell.column.id}`;
                  const firstTriple = cell.getValue<Cell>()?.triples[0];
                  const isExpandable = firstTriple && firstTriple.value.type === 'TEXT';

                  return (
                    <TableCell
                      key={cellId}
                      isLinkable={Boolean(firstTriple?.attributeId === SYSTEM_IDS.NAME_ATTRIBUTE) && isEditable}
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
  );
};
