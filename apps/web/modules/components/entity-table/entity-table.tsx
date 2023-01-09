import styled from '@emotion/styled';
import {
  ColumnDef,
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { memo, useState } from 'react';
import { useAccessControl } from '~/modules/auth/use-access-control';
import { SYSTEM_IDS } from '~/modules/constants';
import { EntityStoreProvider } from '~/modules/entity';
import { useEditable } from '~/modules/stores/use-editable';
import { NavUtils } from '~/modules/utils';
import { Text } from '../../design-system/text';
import { Cell, Column, Row } from '../../types';
import { TableCell } from '../table/cell';
import { EmptyTableText } from '../table/styles';
import { EditableEntityTableCell } from './editable-entity-table-cell';
import { EntityTableCell } from './entity-table-cell';

const columnHelper = createColumnHelper<Row>();

const formatColumns = (columns: Column[] = []) => {
  const columnSize = 1200 / columns.length;

  return columns.map(column =>
    columnHelper.accessor(row => row[column.id], {
      id: column.id,
      header: () => <Text variant="smallTitle">{column.name}</Text>,
      size: columnSize,
    })
  );
};

const Table = styled.table(props => ({
  width: '100%',
  borderStyle: 'hidden',
  borderCollapse: 'collapse',
  backgroundColor: props.theme.colors.white,
}));

const SpaceHeader = styled.th<{ width: number }>(props => ({
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
}));

const defaultColumn: Partial<ColumnDef<Row>> = {
  cell: ({ getValue, row, column: { id }, table, cell }) => {
    const space = table.options.meta!.space;
    const cellId = `${row.original.id}-${cell.column.id}`;
    const isExpanded = !!table.options?.meta?.expandedCells[cellId];

    const entityId = Object.values(row.original)[0].entityId;
    const cellData = getValue<Cell>();
    const isPlaceholder = cellData.triples[0]?.placeholder;

    // eslint-disable-next-line react-hooks/rules-of-hooks
    const { isEditor } = useAccessControl(space);
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const { editable } = useEditable();

    const showEditableCell = isEditor && editable;

    if (showEditableCell) {
      return <EditableEntityTableCell entityId={entityId} cell={cellData} space={space} />;
    } else if (cellData && !isPlaceholder) {
      return <EntityTableCell cell={cellData} space={space} isExpanded={isExpanded} />;
    } else {
      return null;
    }
  },
};

interface Props {
  space: string;
  columns: Column[];
  rows: Row[];
}

export const EntityTable = memo(function EntityTable({ rows, space, columns }: Props) {
  const [expandedCells, setExpandedCells] = useState<Record<string, boolean>>({});
  const { editable } = useEditable();

  const table = useReactTable({
    data: rows,
    columns: formatColumns(columns),
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
                <SpaceHeader width={header.column.getSize()} key={header.id}>
                  {flexRender(header.column.columnDef.header, header.getContext())}
                </SpaceHeader>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.length === 0 && (
            <tr>
              <EmptyTableText>No results found</EmptyTableText>
            </tr>
          )}
          {table.getRowModel().rows.map(row => {
            const cells = row.getVisibleCells();
            const initialTriples = cells
              .map(cell => cell.getValue<Cell>()?.triples)
              .flat()
              .filter(Boolean);
            const entityId = cells[0].getValue<Cell>()?.entityId;

            return (
              <EntityStoreProvider key={row.id} id={entityId} spaceId={space} initialTriples={initialTriples}>
                <TableRow>
                  {cells.map(cell => {
                    const cellId = `${row.original.id}-${cell.column.id}`;
                    const firstTriple = cell.getValue<Cell>()?.triples[0];
                    const isExpandable = firstTriple && firstTriple.value.type === 'string';

                    return (
                      <TableCell
                        isLinkable={Boolean(firstTriple?.attributeId === SYSTEM_IDS.NAME) && editable}
                        href={NavUtils.toEntity(space, entityId)}
                        isExpandable={isExpandable}
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
              </EntityStoreProvider>
            );
          })}
        </tbody>
      </Table>
    </Container>
  );
});
