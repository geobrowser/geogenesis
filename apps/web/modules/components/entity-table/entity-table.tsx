import styled from '@emotion/styled';
import { A } from '@mobily/ts-belt';
import {
  ColumnDef,
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { memo, useState } from 'react';
import { Chip } from '../../design-system/chip';
import { Text } from '../../design-system/text';
import { Cell, Column, Row } from '../../types';
import { NavUtils } from '../../utils';
import { TableCell } from '../table/cell';
import { CellContent } from '../table/cell-content';
import { ChipCellContainer, EmptyTableText } from '../table/styles';

const columnHelper = createColumnHelper<Row>();

const formatColumns = (columns: Column[]) => {
  const columnSize = 1200 / columns.length;

  return columns.map(column =>
    columnHelper.accessor(row => row[column.id], {
      id: column.id,
      header: () => <Text variant="smallTitle">{column.name}</Text>,
      size: columnSize,
    })
  );
};

const Table = styled.table(props => ({
  width: '100%',
  borderStyle: 'hidden',
  borderCollapse: 'collapse',
  backgroundColor: props.theme.colors.white,
}));

const SpaceHeader = styled.th<{ width: number }>(props => ({
  border: `1px solid ${props.theme.colors['grey-02']}`,
  padding: props.theme.space * 2.5,
  textAlign: 'left',
  width: props.width,
}));

const TableRow = styled.tr(props => ({
  ':hover': {
    backgroundColor: props.theme.colors.bg,
  },
}));

// Using a container to wrap the table to make styling borders around
// the table easier. Otherwise we need to do some pseudoselector shenanigans
// or use box-shadow instead of border.
const Container = styled.div(props => ({
  padding: 0,
  border: `1px solid ${props.theme.colors['grey-02']}`,
  borderRadius: props.theme.radius,
  overflow: 'hidden',
}));

const Entities = styled.div(({ theme }) => ({
  display: 'flex',
  flexWrap: 'wrap',
  gap: theme.space * 3,
}));

const defaultColumn: Partial<ColumnDef<Row>> = {
  cell: ({ getValue, row, column: { id }, table, cell }) => {
    const space = table.options.meta!.space;

    const cellId = `${row.original.id}-${cell.column.id}`;

    const cellData = getValue<Cell>();

    if (!cellData) {
      return null;
    }

    return (
      <Entities>
        {cellData.triples.map(({ value, entityId, entityName }) => {
          if (cellData.columnId === 'name') {
            const value = entityName ?? entityId;
            return (
              <CellContent
                key={value}
                isEntity
                href={NavUtils.toEntity(space, entityId)}
                isExpanded={table.options?.meta?.expandedCells[cellId]}
                value={value}
              />
            );
          } else if (value.type === 'entity') {
            return (
              <ChipCellContainer key={value.id}>
                <Chip href={NavUtils.toEntity(space, value.id)}>{value.name ?? value.id}</Chip>
              </ChipCellContainer>
            );
          } else {
            return (
              <CellContent key={value.id} isExpanded={table.options?.meta?.expandedCells[cellId]} value={value.value} />
            );
          }
        })}
      </Entities>
    );
  },
};

interface Props {
  space: string;
  columns: Column[];
  rows: Row[];
}

export const EntityTable = memo(function EntityTable({ rows, space, columns }: Props) {
  const [expandedCells, setExpandedCells] = useState<Record<string, boolean>>({});

  const table = useReactTable({
    data: rows,
    columns: formatColumns(columns),
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
    },
  });

  return (
    <Container>
      <Table cellSpacing={0} cellPadding={0}>
        <thead>
          {table.getHeaderGroups().map(headerGroup => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map(header => (
                <SpaceHeader width={header.column.getSize()} key={header.id}>
                  {flexRender(header.column.columnDef.header, header.getContext())}
                </SpaceHeader>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {A.isEmpty(table.getRowModel().rows) && (
            <tr>
              <EmptyTableText>No results found</EmptyTableText>
            </tr>
          )}
          {table.getRowModel().rows.map(row => (
            <TableRow key={row.id}>
              {row.getVisibleCells().map(cell => {
                const cellId = `${row.original.id}-${cell.column.id}`;
                const firstTriple = cell.getValue<Cell>()?.triples[0];
                const isExpandable = firstTriple && firstTriple.value.type === 'string';

                return (
                  <TableCell
                    isExpandable={isExpandable}
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
    </Container>
  );
});
