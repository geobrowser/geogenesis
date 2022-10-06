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
import { useSigner } from 'wagmi';
import { Text } from '../design-system/text';
import { createTripleId } from '../services/create-id';
import { useTriples } from '../state/hook';
import { Triple, Value } from '../types';

// We declare a new function that we will define and pass into the useTable hook.
// See: https://tanstack.com/table/v8/docs/examples/react/editable-data
declare module '@tanstack/react-table' {
  interface TableMeta<TData extends RowData> {
    updateData: (rowIndex: number, columnId: string, value: unknown) => void;
  }
}

const columnHelper = createColumnHelper<Triple>();

const columns = [
  columnHelper.accessor(row => row.entityId, {
    id: 'entityId',
    header: () => <Text variant="smallTitle">Entity ID</Text>,
    size: 160,
  }),
  columnHelper.accessor(row => row.attributeId, {
    id: 'attributeId',
    header: () => <Text variant="smallTitle">Attribute</Text>,
    size: 450,
  }),
  columnHelper.accessor(row => row.value, {
    id: 'value',
    header: () => <Text variant="smallTitle">Value</Text>,
    size: 450,
  }),
];

const Table = styled.table(props => ({
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

const TableCell = styled.td(props => ({
  backgroundColor: 'transparent', // To allow the row to be styled on hover
  border: `1px solid ${props.theme.colors['grey-02']}`,
  maxWidth: `${props.width}px`,
}));

const TableCellInput = styled.input(props => ({
  ...props.theme.typography.tableCell,
  backgroundColor: 'transparent', // To allow the row to be styled on hover
  padding: props.theme.space * 2.5,
  width: '100%',

  ':focus': {
    outline: `1px solid ${props.theme.colors.text}`,
  },

  '::placeholder': {
    color: props.theme.colors['grey-03'],
  },
}));

const TableEntityCell = styled.div(props => ({
  padding: props.theme.space * 2.5,
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
  border: `1px solid ${props.theme.colors['grey-02']}`,
  borderRadius: props.theme.radius,
  overflow: 'hidden',
}));

// Give our default column cell renderer editing superpowers!
const defaultColumn: Partial<ColumnDef<Triple>> = {
  cell: ({ getValue, row: { index }, column: { id }, table }) => {
    const initialCellData = getValue();
    // We need to keep and update the state of the cell normally
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const [cellData, setCellData] = useState<string | Value | unknown>(initialCellData);

    // When the input is blurred, we'll call our table meta's updateData function
    const onBlur = () => table.options.meta?.updateData(index, id, cellData);

    // If the initialValue is changed external, sync it up with our state
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useEffect(() => {
      setCellData(initialCellData);
    }, [initialCellData]);

    switch (id) {
      case 'entityId':
        const entityId = cellData as string;
        return (
          <TableEntityCell>
            <Text color="ctaPrimary" variant="tableCell" ellipsize>
              {entityId}
            </Text>
          </TableEntityCell>
        );
      case 'attributeId':
        const attributeId = cellData as string;
        return (
          <TableCellInput
            placeholder="Add an attribute..."
            value={attributeId}
            onChange={e => setCellData(e.target.value)}
            onBlur={onBlur}
          />
        );
      case 'value':
        const value = cellData as Value;
        return (
          <TableCellInput
            placeholder="Add text..."
            value={value.value}
            onChange={e =>
              setCellData({
                type: 'string',
                value: e.target.value,
              })
            }
            onBlur={onBlur}
          />
        );
    }
  },
};

interface Props {
  globalFilter: string;
}

// Using a default export here instead of named import to play better with Next's
// dynamic import syntax. We're dynamically importing TripleTable in the /triples
// route. Check the comment there for more context.
//
// When using a named export Next might fail on the TypeScript type checking during
// build. Using default export works.
export default function TripleTable({ globalFilter }: Props) {
  const tripleStore = useTriples();

  const table = useReactTable({
    data: tripleStore.triples,
    columns,
    defaultColumn,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    enableColumnFilters: false,
    state: {
      globalFilter,
    },
    globalFilterFn: fuzzyFilter,
    filterFns: {
      fuzzy: fuzzyFilter,
    },
    meta: {
      updateData: (rowIndex, columnId, cellValue) => {
        const tripleId = tripleStore.triples[rowIndex].id;
        const oldEntityId = tripleStore.triples[rowIndex].entityId;
        const oldAttributeId = tripleStore.triples[rowIndex].attributeId;
        const oldValue = tripleStore.triples[rowIndex].value;

        console.log('Old triple', { tripleId, oldEntityId, oldAttributeId, oldValue });

        const isAttributeColumn = columnId === 'attributeId';
        const isValueColumn = columnId === 'value';
        const attributeId = isAttributeColumn ? (cellValue as Triple['attributeId']) : oldAttributeId;
        const value = isValueColumn ? (cellValue as Triple['value']) : oldValue;

        const newTriple: Triple = {
          id: tripleId, // We need to keep the ID stable so we can replace the old triple with the new one in state
          entityId: oldEntityId,
          attributeId,
          value,
        };

        tripleStore.update(newTriple, tripleStore.triples[rowIndex]);
      },
    },
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
            <TableRow key={row.id}>
              {row.getVisibleCells().map(cell => (
                <TableCell width={cell.column.getSize()} key={cell.id}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TableCell>
              ))}
            </TableRow>
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
