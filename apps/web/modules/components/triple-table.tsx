import * as React from 'react';
import { memo, useState } from 'react';
import {
  ColumnDef,
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  useReactTable,
} from '@tanstack/react-table';

import { LinkableChip } from '../design-system/chip';
import { Text } from '../design-system/text';
import { Triple, Value } from '../types';
import { NavUtils } from '../utils';
import { TableCell } from './table/cell';
import { CellContent } from './table/cell-content';
import { EmptyTableText, Table, TableHeader, TableRow } from './table/styles';

const columnHelper = createColumnHelper<Triple>();

// Table width, minus cell borders
const COLUMN_SIZE = 1200 / 3;

const columns = [
  columnHelper.accessor(row => row.entityId, {
    id: 'entityId',
    header: () => <Text variant="smallTitle">Entity</Text>,
    size: COLUMN_SIZE,
  }),
  columnHelper.accessor(row => row.attributeName, {
    id: 'attributeId',
    header: () => <Text variant="smallTitle">Attribute</Text>,
    size: COLUMN_SIZE,
  }),
  columnHelper.accessor(row => row.value, {
    id: 'value',
    header: () => <Text variant="smallTitle">Value</Text>,
    size: COLUMN_SIZE,
  }),
];

// Give our default column cell renderer editing superpowers!
const defaultColumn: Partial<ColumnDef<Triple>> = {
  cell: ({ getValue, row, column: { id }, table, cell }) => {
    const space = table.options.meta!.space;
    const cellData = getValue();
    const triple = row.original;
    const cellId = `${row.original.id}-${cell.column.id}`;

    switch (id) {
      case 'entityId': {
        const entityId = cellData as string;
        const value = triple.entityName ?? triple.entityId;

        return (
          <CellContent
            isEntity
            href={NavUtils.toEntity(space, entityId)}
            isExpanded={table.options?.meta?.expandedCells[cellId]}
            value={value}
          />
        );
      }
      case 'attributeId': {
        const attributeName = cellData as string;
        const value = attributeName ?? triple.attributeId;

        return <CellContent value={value} />;
      }
      case 'value': {
        const value = cellData as Value;

        if (value.type === 'entity') {
          return <LinkableChip href={NavUtils.toEntity(space, value.id)}>{value.name ?? value.id}</LinkableChip>;
        }

        return <CellContent isExpanded={table.options?.meta?.expandedCells[cellId]} value={value.value} />;
      }
    }
  },
};

interface Props {
  triples: Triple[];
  space: string;
}

export const TripleTable = memo(function TripleTable({ triples, space }: Props) {
  const [expandedCells, setExpandedCells] = useState<Record<string, boolean>>({});

  const table = useReactTable({
    data: triples,
    columns,
    defaultColumn,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    state: {
      pagination: {
        pageIndex: 0,
        pageSize: 100,
      },
    },
    meta: {
      expandedCells,
      space,
      isEditor: false,
      editable: false,
    },
  });

  return (
    <div className="overflow-hidden overflow-x-hidden rounded border border-grey-02 p-0 xl:overflow-x-scroll">
      <Table cellSpacing={0} cellPadding={0}>
        <thead>
          {table.getHeaderGroups().map(headerGroup => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map(header => (
                <TableHeader width={header.column.getSize()} key={header.id}>
                  {flexRender(header.column.columnDef.header, header.getContext())}
                </TableHeader>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.length === 0 && (
            <tr style={{ textAlign: 'center' }}>
              <td />
              <EmptyTableText>No results found</EmptyTableText>
              <td />
            </tr>
          )}
          {table.getRowModel().rows.map(row => (
            <TableRow key={row.id}>
              {row.getVisibleCells().map(cell => {
                const cellId = `${row.original.id}-${cell.column.id}`;

                return (
                  <TableCell
                    isExpandable={cell.column.id === 'value' && (cell.getValue() as Value).type === 'string'}
                    isExpanded={expandedCells[cellId]}
                    width={cell.column.getSize()}
                    key={cell.id}
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
            </TableRow>
          ))}
        </tbody>
      </Table>
    </div>
  );
});
