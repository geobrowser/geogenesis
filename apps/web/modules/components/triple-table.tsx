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
import { Chip } from '../design-system/chip';
import { Text } from '../design-system/text';
import { useEditable } from '../state/use-editable';
import { EntityNames, Triple, Value } from '../types';
import { NavUtils } from '../utils';
import { TableCell } from './table/cell';
import { CellContent } from './table/cell-content';

// We declare a new function that we will define and pass into the useTable hook.
// See: https://tanstack.com/table/v8/docs/examples/react/editable-data
declare module '@tanstack/react-table' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface TableMeta<TData extends RowData> {
    space: string;
    entityNames: EntityNames;
    expandedCells: Record<string, boolean>;
  }
}

const columnHelper = createColumnHelper<Triple>();

// Table width, minus cell borders
const COLUMN_SIZE = 1200 / 3;

const columns = [
  columnHelper.accessor(row => row.entityId, {
    id: 'entityId',
    header: () => <Text variant="smallTitle">Entity</Text>,
    size: COLUMN_SIZE,
  }),
  columnHelper.accessor(row => row.attributeId, {
    id: 'attributeId',
    header: () => <Text variant="smallTitle">Attribute</Text>,
    size: COLUMN_SIZE,
  }),
  columnHelper.accessor(row => row.value, {
    id: 'value',
    header: () => <Text variant="smallTitle">Value</Text>,
    size: COLUMN_SIZE,
  }),
];

const Table = styled.table(props => ({
  width: '100%',
  borderStyle: 'hidden',
  borderCollapse: 'collapse',
  backgroundColor: props.theme.colors.white,
}));

const TableHeader = styled.th<{ width: number }>(props => ({
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
const defaultColumn: Partial<ColumnDef<Triple>> = {
  cell: ({ getValue, row, column: { id }, table, cell }) => {
    const space = table.options.meta!.space;
    const entityNames = table.options?.meta?.entityNames || {};

    const initialCellData = getValue();
    // We need to keep and update the state of the cell normally
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const [cellData, setCellData] = useState<string | Value | unknown>(initialCellData);

    // If the initialValue is changed external, sync it up with our state
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useEffect(() => {
      setCellData(initialCellData);
    }, [initialCellData]);

    const cellId = `${row.original.id}-${cell.column.id}`;

    switch (id) {
      case 'entityId': {
        const entityId = cellData as string;

        // TODO: Instead of a direct input this should be an autocomplete field for entity names/ids

        const value = entityNames[entityId] ?? entityId;

        return (
          <CellContent
            isEntity
            href={NavUtils.toEntity(space, entityId)}
            isExpanded={table.options?.meta?.expandedCells[cellId]}
            value={value}
          />
        );

        // return (
        //   <CellTruncate shouldTruncate={true}>
        //     <Text color="ctaPrimary" variant="tableCell" ellipsize>
        //       {entityNames[entityId] || entityId}
        //     </Text>
        //   </CellTruncate>
        // );
      }
      case 'attributeId': {
        const attributeId = cellData as string;
        const value = entityNames[attributeId] ?? attributeId;
        return <CellContent value={value} />;
      }
      case 'value': {
        const value = cellData as Value;

        if (value.type === 'entity') {
          return (
            <ChipCellContainer>
              <Chip href={NavUtils.toEntity(space, value.id)}>{entityNames[value.id] || value.id}</Chip>
            </ChipCellContainer>
          );
        }

        return <CellContent isExpanded={table.options?.meta?.expandedCells[cellId]} value={value.value} />;
      }
    }
  },
};

const EmptyTableText = styled.td(props => ({
  ...props.theme.typography.tableCell,
  padding: props.theme.space * 2.5,
}));

interface Props {
  triples: Triple[];
  space: string;
  entityNames: EntityNames;
}

export const TripleTable = memo(function TripleTable({ triples, entityNames, space }: Props) {
  const [expandedCells, setExpandedCells] = useState<Record<string, boolean>>({});
  const { editable } = useEditable();

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
        pageSize: 100,
      },
    },
    meta: {
      entityNames,
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
                <TableHeader width={header.column.getSize()} key={header.id}>
                  {flexRender(header.column.columnDef.header, header.getContext())}
                </TableHeader>
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
