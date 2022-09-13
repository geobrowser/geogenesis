import styled from '@emotion/styled';
import { createColumnHelper, flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table';

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
  columnHelper.accessor('entityId', {
    cell: info => info.getValue(),
  }),
  columnHelper.accessor(row => row.attribute, {
    id: 'attribute',
    cell: info => <i>{info.getValue()}</i>,
    header: () => <span>Attribute</span>,
  }),
  columnHelper.accessor('value', {
    header: () => 'Value',
    cell: info => info.renderValue(),
  }),
];

const Table = styled.table({
  border: '1px solid lightgray',
});

const TableHeader = styled.th({
  borderBottom: '1px solid lightgray',
  borderRight: '1px solid lightgray',
  padding: '2px 4px',
});

export function FactsTable() {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div>
      <Table>
        <thead>
          {table.getHeaderGroups().map(headerGroup => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map(header => (
                <TableHeader key={header.id}>
                  {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                </TableHeader>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map(row => (
            <tr key={row.id}>
              {row.getVisibleCells().map(cell => (
                <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
              ))}
            </tr>
          ))}
        </tbody>
        <tfoot>
          {table.getFooterGroups().map(footerGroup => (
            <tr key={footerGroup.id}>
              {footerGroup.headers.map(header => (
                <th key={header.id}>
                  {header.isPlaceholder ? null : flexRender(header.column.columnDef.footer, header.getContext())}
                </th>
              ))}
            </tr>
          ))}
        </tfoot>
      </Table>
    </div>
  );
}
