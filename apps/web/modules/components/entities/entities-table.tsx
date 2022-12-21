import styled from '@emotion/styled';
import {
  ColumnDef,
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  RowData,
  useReactTable,
} from '@tanstack/react-table';
import { memo, useEffect, useState } from 'react';
import { Chip } from '../../design-system/chip';
import { Text } from '../../design-system/text';
import { Cell, Column, Row, Value } from '../../types';
import { NavUtils } from '../../utils';
import { TableCell } from '../table/cell';
import { CellContent } from '../table/cell-content';
import { EmptyTableText } from '../table/styles';

// We declare a new function that we will define and pass into the useTable hook.
// See: https://tanstack.com/table/v8/docs/examples/react/editable-data
declare module '@tanstack/react-table' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface TableMeta<TData extends RowData> {
    space: string;
    expandedCells: Record<string, boolean>;
  }
}

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

// Negative margin so table row height matches a single line of text
const ChipCellContainer = styled.div({
  margin: '-1px 0',
});

// Give our default column cell renderer editing superpowers!
const defaultColumn: Partial<ColumnDef<Row>> = {
  cell: ({ getValue, row, column: { id }, table, cell }) => {
    const space = table.options.meta!.space;

    const cellId = `${row.original.id}-${cell.column.id}`;

    const initialCellData = getValue<Cell>();

    // We need to keep and update the state of the cell normally
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const [cellData, setCellData] = useState<Cell>(initialCellData);

    // If the initialValue is changed external, sync it up with our state
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useEffect(() => {
      setCellData(initialCellData);
    }, [initialCellData]);

    if (!cellData) {
      return <div />;
    }

    return (
      <div>
        {cellData.triples.map(({ value, attributeId, entityId, entityName }) => {
          if (attributeId === 'name') {
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
          }
          if (value.type === 'entity') {
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
      </div>
    );
  },
};

interface Props {
  space: string;
  columns: Column[];
  rows: Row[];
}

export const EntitiesTable = memo(function EntitiesTable({ rows, space, columns }: Props) {
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
    </Container>
  );
});
