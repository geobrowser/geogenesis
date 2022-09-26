import styled from '@emotion/styled';
import { rankItem } from '@tanstack/match-sorter-utils';
import {
  ColumnDef,
  createColumnHelper,
  FilterFn,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  RowData,
  useReactTable,
} from '@tanstack/react-table';
import { useEffect, useState } from 'react';
import { Text } from '../design-system/text';
import { useTriples } from '../state/hook';
import { Triple, Value } from '../types';

declare module '@tanstack/react-table' {
  interface TableMeta<TData extends RowData> {
    updateData: (rowIndex: number, columnId: string, value: unknown) => void;
  }
}

const columnHelper = createColumnHelper<Triple>();

const columns = [
  columnHelper.accessor(row => row.entityId, {
    id: 'entity',
    header: () => <Text variant="smallTitle">Entity ID</Text>,
    // cell: info => (
    //   <Text color="ctaPrimary" variant="tableCell" ellipsize>
    //     {info.getValue()}
    //   </Text>
    // ),
    size: 160,
  }),
  columnHelper.accessor(row => row.attributeId, {
    id: 'attribute',
    header: () => <Text variant="smallTitle">Attribute</Text>,
    // cell: info => <Text variant="tableCell">{info.getValue()}</Text>,
    size: 450,
  }),
  columnHelper.accessor(row => row.value, {
    id: 'value',
    header: () => <Text variant="smallTitle">Value</Text>,
    // cell: info => <Text variant="tableCell">{info.getValue().value}</Text>,
    size: 450,
  }),
];

const Table = styled.table(props => ({
  border: `1px solid ${props.theme.colors['grey-02']}`,
  width: '100%',
  borderStyle: 'hidden',
  borderCollapse: 'collapse',
}));

const TableHeader = styled.th<{ width: number }>(props => ({
  border: `1px solid ${props.theme.colors['grey-02']}`,
  padding: props.theme.space * 2.5,
  textAlign: 'left',
  width: props.width,
}));

const TableCell = styled.input(props => ({
  ...props.theme.typography.tableCell,
  border: `1px solid ${props.theme.colors['grey-02']}`,
  padding: props.theme.space * 2.5,
  // maxWidth: `${props.width}px`,
  width: '100%',
}));

// Using a container to wrap the table to make styling borders around
// the table easier. Otherwise we need to do some pseudoselector shenanigans
// or use box-shadow instead of border.
const Container = styled.div(props => ({
  border: `1px solid ${props.theme.colors['grey-02']}`,
  borderRadius: props.theme.radius,
  overflow: 'hidden',
}));

// Give our default column cell renderer editing superpowers!
const defaultColumn: Partial<ColumnDef<Triple>> = {
  cell: ({ getValue, row: { index }, column: { id }, table }) => {
    const initialValue = getValue();
    // We need to keep and update the state of the cell normally
    const [value, setValue] = useState(initialValue);

    // When the input is blurred, we'll call our table meta's updateData function
    const onBlur = () => {
      table.options.meta?.updateData(index, id, value);
    };

    // If the initialValue is changed external, sync it up with our state
    useEffect(() => {
      setValue(initialValue);
    }, [initialValue]);

    switch (id) {
      case 'entity':
        return (
          <Text color="ctaPrimary" variant="tableCell">
            <TableCell value={value} onChange={e => setValue(e.target.value)} onBlur={onBlur} />
          </Text>
        );
      case 'attribute':
        return (
          <Text variant="tableCell">
            <TableCell value={value} onChange={e => setValue(e.target.value)} onBlur={onBlur} />
          </Text>
        );
      case 'value':
        return (
          <Text variant="tableCell">
            <TableCell value={value.value} onChange={e => setValue(e.target.value)} onBlur={onBlur} />
          </Text>
        );
    }
  },
};

interface Props {
  triples: Triple[];
  globalFilter: string;
}

export function TripleTable({ globalFilter, triples }: Props) {
  // TODO: Should this live in /triples or here?
  const { setTriples } = useTriples();

  const table = useReactTable({
    data: triples,
    columns,
    defaultColumn,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    state: {
      globalFilter,
    },
    globalFilterFn: fuzzyFilter,
    filterFns: {
      fuzzy: fuzzyFilter,
    },
    meta: {
      updateData: (rowIndex, columnId, value) => {
        // Skip age index reset until after next rerender
        console.log(value);
        const newTriples: Triple[] = triples.map((row: Triple, index: number, oldTriples: Triple[]) => {
          if (index === rowIndex) {
            return {
              ...oldTriples[rowIndex],
              // TODO: Map to correct object based on column type
              [columnId]: value,
            };
          }
          return row;
        });

        setTriples(newTriples);
      },
    },
    debugTable: true,
  });

  return (
    <Container>
      <Table>
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
          {table.getRowModel().rows.map(row => (
            <tr key={row.id}>
              {row.getVisibleCells().map(cell => (
                // <TableCell width={cell.column.getSize()} key={cell.id}>
                //   {flexRender(cell.column.columnDef.cell, cell.getContext())}
                // </TableCell>
                <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </Table>
    </Container>
  );
}

const fuzzyFilter: FilterFn<any> = (row, columnId, value, addMeta) => {
  // Rank the item
  const itemRank = rankItem(row.getValue(columnId), value);

  // Store the itemRank info
  addMeta({
    itemRank,
  });

  // Return if the item should be filtered in/out
  return itemRank.passed;
};
