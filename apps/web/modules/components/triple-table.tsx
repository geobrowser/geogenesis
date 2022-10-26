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
import { useRouter } from 'next/router';
import { memo, useEffect, useState } from 'react';
import { Chip } from '../design-system/chip';
import { Text } from '../design-system/text';
import { createTripleWithId } from '../services/create-id';
import { useEditable } from '../state/use-editable';
import { useTriples } from '../state/use-triples';
import { EntityNames, Triple, Value } from '../types';
import { CellEditableInput } from './table/cell-editable-input';
import { CellTruncate } from './table/cell-truncate';

// We declare a new function that we will define and pass into the useTable hook.
// See: https://tanstack.com/table/v8/docs/examples/react/editable-data
declare module '@tanstack/react-table' {
  interface TableMeta<TData extends RowData> {
    updateData: (rowIndex: number, columnId: string, value: unknown) => void;
    entityNames: EntityNames;
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
  verticalAlign: 'top',
  backgroundColor: 'transparent', // To allow the row to be styled on hover
  border: `1px solid ${props.theme.colors['grey-02']}`,
  maxWidth: `${props.width}px`,
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

// Give our default column cell renderer editing superpowers!
const defaultColumn: Partial<ColumnDef<Triple>> = {
  cell: ({ getValue, row: { index }, column: { id }, table }) => {
    const entityNames = table.options?.meta?.entityNames || {};
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const { editable } = useEditable();

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

        // TODO: Instead of a direct input this should be an autocomplete field for entity names/ids

        return (
          <CellTruncate>
            <Text color="ctaPrimary" variant="tableCell" ellipsize>
              {entityNames[entityId] || entityId}
            </Text>
          </CellTruncate>
        );
      case 'attributeId':
        const attributeId = cellData as string;

        return (
          <CellEditableInput
            placeholder="Add an attribute..."
            isEditable={editable}
            value={entityNames[attributeId] || attributeId}
            onChange={e => setCellData(e.target.value)}
            onBlur={onBlur}
          />
        );
      case 'value':
        const value = cellData as Value;

        if (value.type === 'entity') {
          return (
            <CellTruncate>
              <Chip>{entityNames[value.value] || value.value}</Chip>
            </CellTruncate>
          );
        }

        return (
          <CellEditableInput
            placeholder="Add text..."
            isEditable={editable}
            value={entityNames[value.value] || value.value}
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
  update: (triple: Triple, oldTriple: Triple) => void;
  triples: Triple[];
  space: string;
}

// Using a default export here instead of named import to play better with Next's
// dynamic import syntax. We're dynamically importing TripleTable in the /triples
// route. Check the comment there for more context.
//
// When using a named export Next might fail on the TypeScript type checking during
// build. Using default export works.
const TripleTable = memo(function TripleTable({ update, triples, space }: Props) {
  const { entityNames } = useTriples();

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
        pageSize: 50,
      },
    },
    meta: {
      updateData: (rowIndex, columnId, cellValue) => {
        const oldEntityId = triples[rowIndex].entityId;
        const oldAttributeId = triples[rowIndex].attributeId;
        const oldValue = triples[rowIndex].value;

        const isEntityIdColumn = columnId === 'entityId';
        const isAttributeColumn = columnId === 'attributeId';
        const isValueColumn = columnId === 'value';

        // TODO: Is this a bug? entityId might be the name instead of the entityId
        const entityId = isEntityIdColumn ? (cellValue as Triple['entityId']) : oldEntityId;
        const attributeId = isAttributeColumn ? (cellValue as Triple['attributeId']) : oldAttributeId;
        const value = isValueColumn ? (cellValue as Triple['value']) : oldValue;

        const newTriple = createTripleWithId(space, entityId, attributeId, value);
        update(newTriple, triples[rowIndex]);
      },
      entityNames,
    },
  });

  return (
    <Container>
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
});

export default TripleTable;
