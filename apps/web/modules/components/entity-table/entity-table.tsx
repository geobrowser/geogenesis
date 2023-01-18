import styled from '@emotion/styled';
import { SYSTEM_IDS } from '@geogenesis/ids';
import { A } from '@mobily/ts-belt';
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
import { useActionsStore } from '~/modules/action';
import { useAccessControl } from '~/modules/auth/use-access-control';
import { EntityStoreProvider } from '~/modules/entity';
import { useEditable } from '~/modules/stores/use-editable';
import { NavUtils } from '~/modules/utils';
import { Text } from '../../design-system/text';
import { Cell, Column, Row } from '../../types';
import { TableCell } from '../table/cell';
import { EmptyTableText } from '../table/styles';
import { AddNewColumn } from './add-new-column';
import { EditableEntityTableCell } from './editable-entity-table-cell';
import { EditableEntityTableColumn } from './editable-entity-table-column';
import { EntityTableCell } from './entity-table-cell';

const Table = styled.table(props => ({
  width: '100%',
  borderStyle: 'hidden',
  borderCollapse: 'collapse',
  backgroundColor: props.theme.colors.white,
  position: 'relative',
  borderRadius: props.theme.radius,
}));

const TableHead = styled.thead({
  position: 'relative',
});

const SpaceHeader = styled.th<{ width: number }>(props => ({
  border: `1px solid ${props.theme.colors['grey-02']}`,
  padding: props.theme.space * 2.5,
  textAlign: 'left',
  minWidth: props.width,
}));

const TableRow = styled.tr(props => ({
  ':hover': {
    backgroundColor: props.theme.colors.bg,
  },
}));

const Container = styled.div({
  overflowX: 'hidden',

  '@media(max-width: 1200px)': {
    overflowX: 'scroll',
  },
});

const columnHelper = createColumnHelper<Row>();

const formatColumns = (columns: Column[] = [], isEditMode: boolean, space: string) => {
  const columnSize = 1200 / columns.length;

  return columns.map(column =>
    columnHelper.accessor(row => row[column.id], {
      id: column.id,
      header: () => {
        const { actions } = useActionsStore(space);

        return isEditMode ? (
          <EntityStoreProvider spaceId={space} id={column.id} initialTriples={column.triples} initialSchemaTriples={[]}>
            <EditableEntityTableColumn
              column={column}
              entityId={column.id}
              hasActions={A.isNotEmpty(actions)}
              space={space}
            />
          </EntityStoreProvider>
        ) : (
          <Text variant="smallTitle">{column.name}</Text>
        );
      },
      size: columnSize ? (columnSize < 300 ? 300 : columnSize) : 300,
    })
  );
};

const defaultColumn: Partial<ColumnDef<Row>> = {
  cell: ({ getValue, row, column: { id }, table, cell }) => {
    const space = table.options.meta!.space;
    const cellId = `${row.original.id}-${cell.column.id}`;
    const isExpanded = !!table.options?.meta?.expandedCells[cellId];
    const editable = table.options.meta?.editable;
    const isEditor = table.options.meta?.isEditor;

    const entityId = Object.values(row.original)[0].entityId;
    const cellData = getValue<Cell>();
    const isPlaceholder = cellData.triples[0]?.placeholder;

    const { actions } = useActionsStore(space);

    const isEditMode = isEditor && editable;

    if (isEditMode) {
      return (
        <EditableEntityTableCell hasActions={A.isNotEmpty(actions)} entityId={entityId} cell={cellData} space={space} />
      );
    } else if (cellData && !isPlaceholder) {
      return <EntityTableCell cell={cellData} space={space} isExpanded={isExpanded} />;
    } else {
      return null;
    }
  },
};

interface Props {
  space: string;
  selectedType: string | null;
  columns: Column[];
  rows: Row[];
}

export const EntityTable = memo(function EntityTable({ rows, space, columns, selectedType }: Props) {
  const [expandedCells, setExpandedCells] = useState<Record<string, boolean>>({});
  const { editable } = useEditable();
  const { isEditor } = useAccessControl(space);

  const isEditMode = isEditor && editable;

  const table = useReactTable({
    data: rows,
    columns: formatColumns(columns, isEditMode, space),
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
      expandedCells,
      space,
      editable,
      isEditor,
    },
  });

  return (
    <Container>
      <Table cellSpacing={0} cellPadding={0}>
        <TableHead>
          {table.getHeaderGroups().map(headerGroup => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map(header => (
                <SpaceHeader width={header.column.getSize()} key={header.id}>
                  {flexRender(header.column.columnDef.header, header.getContext())}
                </SpaceHeader>
              ))}
            </tr>
          ))}
          {isEditMode && (
            <tr>
              <th>
                <EntityStoreProvider id={selectedT} spaceId={space} initialSchemaTriples={[]} initialTriples={[]}>
                  <AddNewColumn />
                </EntityStoreProvider>
              </th>
            </tr>
          )}
        </TableHead>
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
              <EntityStoreProvider
                key={row.id}
                id={entityId}
                spaceId={space}
                initialSchemaTriples={[]}
                initialTriples={initialTriples}
              >
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
