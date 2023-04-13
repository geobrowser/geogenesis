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
import { useState } from 'react';

import { useActionsStoreContext } from '~/modules/action';
import { useAccessControl } from '~/modules/auth/use-access-control';
import { DEFAULT_PAGE_SIZE, Entity, useEntityTable } from '~/modules/entity';
import { useEditable } from '~/modules/stores/use-editable';
import { Triple } from '~/modules/triple';
import { NavUtils } from '~/modules/utils';
import { valueTypes } from '~/modules/value-types';
import { Text } from '../../design-system/text';
import { Cell, Column, Row } from '../../types';
import { TableCell } from '../table/cell';
import { EmptyTableText } from '../table/styles';
import { AddNewColumn } from './add-new-column';
import { EditableEntityTableCell } from './editable-entity-table-cell';
import { EditableEntityTableColumnHeader } from './editable-entity-table-column-header';
import { EntityTableCell } from './entity-table-cell';
import { columnName, columnValueType } from '../editor/blocks/table/utils';

const columnHelper = createColumnHelper<Row>();

const formatColumns = (columns: Column[] = [], isEditMode: boolean, unpublishedColumns: Column[]) => {
  const columnSize = 1200 / columns.length;

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
      size: columnSize ? (columnSize < 300 ? 300 : columnSize) : 300,
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
    const { create, update, remove, actions$ } = useActionsStoreContext();
    // We know that cell is rendered as a React component by react-table

    // eslint-disable-next-line react-hooks/rules-of-hooks
    const { columns } = useEntityTable();

    const cellData = getValue<Cell | undefined>();
    const isEditMode = isEditor && editable;
    const isPlaceholderCell = cellData?.triples[0]?.placeholder;

    if (!cellData) return null;

    const valueType = columnValueType(cellData.columnId, columns);

    const cellTriples = pipe(
      actions$.get()[space],
      actions => Triple.fromActions(actions, cellData.triples),
      A.filter(triple => {
        const isRowCell = triple.entityId === cellData.entityId;
        const isColCell = triple.attributeId === cellData.columnId;
        const isCurrentValueType = triple.value.type === valueTypes[valueType];

        return isRowCell && isColCell && isCurrentValueType;
      }),
      A.uniqBy(triple => triple.id)
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
        />
      );
    } else if (cellData && !isPlaceholderCell) {
      return (
        <EntityTableCell
          key={Entity.name(cellData.triples)}
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
  columns: Column[];
  rows: Row[];
}

export const EntityTable = ({ rows, space, columns }: Props) => {
  const [expandedCells, setExpandedCells] = useState<Record<string, boolean>>({});
  const { editable } = useEditable();
  const { isEditor } = useAccessControl(space);
  const { selectedType, unpublishedColumns } = useEntityTable();
  const isEditMode = isEditor && editable;

  const table = useReactTable({
    data: rows,
    columns: formatColumns(columns, isEditMode, unpublishedColumns),
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
      editable,
      isEditor,
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
        {editable && selectedType && <AddNewColumn space={space} selectedType={selectedType} />}
        <tbody>
          {table.getRowModel().rows.length === 0 && (
            <tr>
              <EmptyTableText>No results found</EmptyTableText>
            </tr>
          )}
          {table.getRowModel().rows.map(row => {
            const cells = row.getVisibleCells();

            const entityId = cells[0].getValue<Cell>()?.entityId;

            return (
              <tr key={entityId} className="hover:bg-bg">
                {cells.map(cell => {
                  const cellId = `${row.original.id}-${cell.column.id}`;
                  const firstTriple = cell.getValue<Cell>()?.triples[0];
                  const isExpandable = firstTriple && firstTriple.value.type === 'string';

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
