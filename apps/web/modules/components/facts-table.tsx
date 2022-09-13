import styled from '@emotion/styled';
import { createColumnHelper, flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { Spacer } from '../design-system/spacer';
import { Text } from '../design-system/text';
import { colors } from '../design-system/theme/colors';
import { typography } from '../design-system/theme/typography';

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

const Input = styled.input({
  ...typography.input,
  border: `1px solid ${colors['grey-02']}`,
  borderRadius: '6px',
  padding: '9px 12px',
});

export function FactsTable() {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <Input placeholder="Search facts..." />

      <Spacer height={20} />

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
    </div>
  );
}
