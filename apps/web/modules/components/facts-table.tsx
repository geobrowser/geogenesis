import styled from '@emotion/styled';
import {
  createColumnHelper,
  FilterFn,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { rankItem } from '@tanstack/match-sorter-utils';
import { Text } from '../design-system/text';
import { colors } from '../design-system/theme/colors';

type Fact = {
  id: string;
  entityId: string;
  attribute: string;
  value: string | number;
};

const data: Fact[] = [
  {
    id: '1',
    entityId: 'askldjasd',
    attribute: 'Died in',
    value: 0,
  },
  {
    id: '2',
    entityId: 'askldjasd',
    attribute: 'name',
    value: 'Jesus Christ',
  },
];

const columnHelper = createColumnHelper<Fact>();

const columns = [
  columnHelper.accessor(row => row.entityId, {
    id: 'entityId',
    header: () => <Text variant="smallTitle">Entity ID</Text>,
    cell: info => (
      <Text color="ctaPrimary" variant="tableCell">
        {info.getValue()}
      </Text>
    ),
  }),
  columnHelper.accessor(row => row.attribute, {
    id: 'attribute',
    header: () => <Text variant="smallTitle">Attribute</Text>,
    cell: info => <Text variant="tableCell">{info.getValue()}</Text>,
  }),
  columnHelper.accessor('value', {
    header: () => <Text variant="smallTitle">Value</Text>,
    cell: info => <Text variant="tableCell">{info.getValue()}</Text>,
  }),
];

const Table = styled.table({
  border: `1px solid ${colors['grey-02']}`,
  width: '100%',
  borderRadius: '6px',
  borderStyle: 'hidden',
  borderCollapse: 'collapse',

  // Adding borders to a table is complex, so we can use box-shadow instead
  boxShadow: `0 0 0 1px ${colors['grey-02']}`,
});

const TableHeader = styled.th({
  border: `1px solid ${colors['grey-02']}`,
  padding: '10px',
  textAlign: 'left',
});

const TableCell = styled.td({
  border: `1px solid ${colors['grey-02']}`,
  padding: '10px',
});

interface Props {
  globalFilter: string;
}

export function FactsTable({ globalFilter }: Props) {
  const table = useReactTable({
    data,
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
    <Table>
      <thead>
        {table.getHeaderGroups().map(headerGroup => (
          <tr key={headerGroup.id}>
            {headerGroup.headers.map(header => (
              <TableHeader key={header.id}>
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
              <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
            ))}
          </tr>
        ))}
      </tbody>
    </Table>
  );
}

const fuzzyFilter: FilterFn<any> = (row, columnId, value, addMeta) => {
  console.log('Running fuzzyFilter');

  // Rank the item
  const itemRank = rankItem(row.getValue(columnId), value);

  // Store the itemRank info
  addMeta({
    itemRank,
  });

  // Return if the item should be filtered in/out
  return itemRank.passed;
};
