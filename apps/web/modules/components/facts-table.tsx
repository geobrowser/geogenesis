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
import { AnimatePresence, motion, useIsPresent } from 'framer-motion';
import useMeasure from 'react-use-measure';
import { Text } from '../design-system/text';
import { Fact } from '../state';

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
    size: 160,
  }),
  columnHelper.accessor(row => row.attribute, {
    id: 'attribute',
    header: () => <Text variant="smallTitle">Attribute</Text>,
    cell: info => <Text variant="tableCell">{info.getValue()}</Text>,
    size: 450,
  }),
  columnHelper.accessor('value', {
    header: () => <Text variant="smallTitle">Value</Text>,
    cell: info => <Text variant="tableCell">{info.getValue()}</Text>,
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
  padding: '10px',
  textAlign: 'left',
  width: props.width,
}));

const TableCell = styled.td(props => ({
  ...props.theme.typography.tableCell,
  border: `1px solid ${props.theme.colors['grey-02']}`,
  padding: '10px',
}));

const TBody = styled.tbody({
  position: 'relative',
});

interface Props {
  facts: Fact[];
  globalFilter: string;
}

export function FactsTable({ globalFilter, facts }: Props) {
  const table = useReactTable({
    data: facts,
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
    <ResizablePanel>
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
        <TBody>
          {table.getRowModel().rows.map(row => (
            <tr key={row.id}>
              {row.getVisibleCells().map(cell => (
                <TableCell width={cell.column.getSize()} key={cell.id}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TableCell>
              ))}
            </tr>
          ))}
        </TBody>
      </Table>
    </ResizablePanel>
  );
}

const Container = styled.div(props => ({
  // Adding borders to a table is complex, so we can use box-shadow instead
  boxShadow: `0 0 0 1px ${props.theme.colors['grey-02']}`,
  borderRadius: '6px',
  // overflow: 'hidden',
}));

const MotionContainer = motion(Container);

function ResizablePanel({ children }: { children: React.ReactNode }) {
  const [ref, { height }] = useMeasure();

  return (
    <MotionContainer layout animate={{ height }} transition={{ duration: 0.1 }}>
      <div ref={ref}>{children}</div>
    </MotionContainer>
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
