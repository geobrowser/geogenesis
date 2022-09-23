import styled from '@emotion/styled';
import { rankItem } from '@tanstack/match-sorter-utils';
import {
  createColumnHelper,
  FilterFn,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { Text } from '../design-system/text';
import { ITriple, TripleValue } from '../types';

const columnHelper = createColumnHelper<ITriple>();

const columns = [
  columnHelper.accessor(row => row.entity.id, {
    id: 'entity',
    header: () => <Text variant="smallTitle">Entity ID</Text>,
    cell: info => (
      <Text color="ctaPrimary" variant="tableCell">
        {info.getValue()}
      </Text>
    ),
    size: 160,
  }),
  columnHelper.accessor(row => row.attribute, {
    id: 'attribute',
    header: () => <Text variant="smallTitle">Attribute</Text>,
    cell: info => <Text variant="tableCell">{info.getValue().id}</Text>,
    size: 450,
  }),
  columnHelper.accessor(
    (row): TripleValue => {
      switch (row.valueType) {
        case 'STRING':
          return { stringValue: row.stringValue, valueType: row.valueType };
        case 'NUMBER':
          return { numberValue: row.numberValue, valueType: row.valueType };
        case 'ENTITY':
          return { entityValue: row.entityValue, valueType: row.valueType };
      }
    },
    {
      id: 'value',
      header: () => <Text variant="smallTitle">Value</Text>,
      cell: info => {
        const value = info.getValue();
        const string =
          value.valueType === 'ENTITY'
            ? value.entityValue.id
            : value.valueType === 'STRING'
            ? value.stringValue
            : value.numberValue;

        return <Text variant="tableCell">{string}</Text>;
      },
      size: 450,
    }
  ),
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

const TableCell = styled.td(props => ({
  ...props.theme.typography.tableCell,
  border: `1px solid ${props.theme.colors['grey-02']}`,
  padding: props.theme.space * 2.5,
}));

// Using a container to wrap the table to make styling borders around
// the table easier. Otherwise we need to do some pseudoselector shenanigans
// or use box-shadow instead of border.
const Container = styled.div(props => ({
  border: `1px solid ${props.theme.colors['grey-02']}`,
  borderRadius: props.theme.radius,
  overflow: 'hidden',
}));

interface Props {
  triples: ITriple[];
  globalFilter: string;
}

export function TripleTable({ globalFilter, triples }: Props) {
  const table = useReactTable({
    data: triples,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    state: {
      globalFilter,
    },
    globalFilterFn: fuzzyFilter,
    filterFns: {
      fuzzy: fuzzyFilter,
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
            <tr key={row.id}>
              {row.getVisibleCells().map(cell => (
                <TableCell width={cell.column.getSize()} key={cell.id}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TableCell>
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
