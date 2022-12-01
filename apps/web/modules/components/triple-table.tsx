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
import { createTripleWithId } from '../services/create-id';
import { useEditable } from '../state/use-editable';
import { useTriples } from '../state/use-triples';
import { EntityNames, Triple, Value } from '../types';
import { navUtils } from '../utils';
import { TableCell } from './table/cell';
import { CellEditableInput } from './table/cell-editable-input';

// We declare a new function that we will define and pass into the useTable hook.
// See: https://tanstack.com/table/v8/docs/examples/react/editable-data
declare module '@tanstack/react-table' {
  interface TableMeta<TData extends RowData> {
    space: string;
    updateData: (rowIndex: number, columnId: string, value: unknown) => void;
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
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const { editable } = useEditable();

    const initialCellData = getValue();
    // We need to keep and update the state of the cell normally
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const [cellData, setCellData] = useState<string | Value | unknown>(initialCellData);

    // When the input is blurred, we'll call our table meta's updateData function
    const onBlur = () => table.options.meta?.updateData(row.index, id, cellData);

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

        const value = editable ? entityId : entityNames[entityId] || entityId;

        return (
          <CellEditableInput
            isEntity
            href={navUtils.toEntity(space, entityId)}
            isExpanded={table.options?.meta?.expandedCells[cellId]}
            placeholder="Add text..."
            isEditable={editable}
            value={value}
            onChange={e => setCellData(e.target.value)}
            onBlur={onBlur}
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

        const value = editable ? attributeId : entityNames[attributeId] || attributeId;

        return (
          <CellEditableInput
            placeholder="Add an attribute..."
            isEditable={editable}
            value={value}
            onChange={e => setCellData(e.target.value)}
            onBlur={onBlur}
          />
        );
      }
      case 'value':
        const value = cellData as Value;

        if (value.type === 'entity') {
          return (
            <ChipCellContainer>
              <Chip href={navUtils.toEntity(space, value.id)}>{entityNames[value.id] || value.id}</Chip>
            </ChipCellContainer>
          );
        }

        // TODO: FIX HACK
        // This is a super hacky workaround for now to be able to view a entity where the value string
        // is the same as the entity id.
        if (entityNames[value.value]) {
          return (
            <ChipCellContainer>
              <Chip href={navUtils.toEntity(space, value.value)}>{entityNames[value.value]}</Chip>
            </ChipCellContainer>
          );
        }

        return (
          <CellEditableInput
            isExpanded={table.options?.meta?.expandedCells[cellId]}
            placeholder="Add text..."
            isEditable={editable}
            value={value.value}
            onChange={e =>
              setCellData({
                id: value.id,
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

const EmptyTableText = styled.td(props => ({
  ...props.theme.typography.tableCell,
  padding: props.theme.space * 2.5,
}));

interface Props {
  update: (triple: Triple, oldTriple: Triple) => void;
  triples: Triple[];
  space: string;
  entityNames: EntityNames;
}

// Using a default export here instead of named import to play better with Next's
// dynamic import syntax. We're dynamically importing TripleTable in the /triples
// route. Check the comment there for more context.
//
// When using a named export Next might fail on the TypeScript type checking during
// build. Using default export works.
const TripleTable = memo(function TripleTable({ update, triples, entityNames, space }: Props) {
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
              <td></td>
              <EmptyTableText>No results found</EmptyTableText>
              <td></td>
            </tr>
          )}
          {table.getRowModel().rows.map(row => (
            <TableRow key={row.id}>
              {row.getVisibleCells().map(cell => {
                const cellId = `${row.original.id}-${cell.column.id}`;

                return (
                  <TableCell
                    isEditable={editable}
                    isExpandable={cell.column.id === 'value'}
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

export default TripleTable;
