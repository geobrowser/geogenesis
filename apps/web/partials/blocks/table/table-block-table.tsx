'use client';

import { SYSTEM_IDS } from '@geogenesis/sdk';
import { INITIAL_RELATION_INDEX_VALUE } from '@geogenesis/sdk/constants';
import {
  ColumnDef,
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { cx } from 'class-variance-authority';
import { useAtomValue } from 'jotai';
import Image from 'next/image';

import * as React from 'react';
import { useState } from 'react';

import { Filter } from '~/core/blocks/data/filters';
import { PLACEHOLDER_SPACE_IMAGE } from '~/core/constants';
import { useRelations } from '~/core/database/relations';
import { useTriples } from '~/core/database/triples';
import { DB } from '~/core/database/write';
import { PropertyId } from '~/core/hooks/use-property-value-types';
import { useUserIsEditing } from '~/core/hooks/use-user-is-editing';
import { ID } from '~/core/id';
import { SearchResult } from '~/core/io/dto/search';
import { EntityId, SpaceId } from '~/core/io/schema';
import { upsertCollectionItemRelation, upsertVerifiedSourceOnCollectionItem } from '~/core/state/editor/data-entity';
import { upsertSourceSpaceOnCollectionItem } from '~/core/state/editor/data-entity';
import { Source } from '~/core/state/editor/types';
import { DataBlockView, useTableBlock } from '~/core/state/table-block-store';
import { Cell, PropertySchema, Row } from '~/core/types';
import { Entities } from '~/core/utils/entity';
import { toRenderables } from '~/core/utils/to-renderables';
import { NavUtils, getImagePath } from '~/core/utils/utils';
import { valueTypes } from '~/core/value-types';

import { CheckCircle } from '~/design-system/icons/check-circle';
import { EyeHide } from '~/design-system/icons/eye-hide';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';
import { SelectEntity } from '~/design-system/select-entity';
import { TableCell } from '~/design-system/table/cell';
import { Text } from '~/design-system/text';

import { EntityTableCell } from '~/partials/entities-page/entity-table-cell';
import { EditableEntityTableCell } from '~/partials/entity-page/editable-entity-table-cell';
import { EditableEntityTableColumnHeader } from '~/partials/entity-page/editable-entity-table-column-header';

import { columnName, columnValueType, makePlaceholderFromValueType } from './utils';
import { editingColumnsAtom } from '~/atoms';

const columnHelper = createColumnHelper<Row>();

const formatColumns = (
  columns: PropertySchema[] = [],
  isEditMode: boolean,
  unpublishedColumns: PropertySchema[],
  spaceId: SpaceId
) => {
  const columnSize = 784 / columns.length;

  return columns.map((column, i) =>
    columnHelper.accessor(row => row.columns[column.id], {
      id: column.id,
      header: () => {
        const isNameColumn = column.id === SYSTEM_IDS.NAME_ATTRIBUTE;

        /* Add some right padding for the last column to account for the add new column button */
        const isLastColumn = i === columns.length - 1;

        return isEditMode && !isNameColumn ? (
          <div className={cx(isLastColumn ? 'pr-12' : '')}>
            <EditableEntityTableColumnHeader
              unpublishedColumns={unpublishedColumns}
              column={column}
              entityId={column.id}
              spaceId={spaceId}
            />
          </div>
        ) : (
          <Text variant="smallTitle">{isNameColumn ? 'Name' : column.name ?? column.id}</Text>
        );
      },
      size: columnSize ? (columnSize < 150 ? 150 : columnSize) : 150,
    })
  );
};

const defaultColumn: Partial<ColumnDef<Row>> = {
  cell: ({ getValue, row, table, cell }) => {
    const spaceId = table.options.meta!.space;
    const cellId = `${row.original.entityId}-${cell.column.id}`;
    const isExpanded = Boolean(table.options?.meta?.expandedCells[cellId]);

    // We know that cell is rendered as a React component by react-table
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const { columns, columnsSchema } = useTableBlock();

    const cellData = getValue<Cell | undefined>();
    const isEditable = table.options.meta?.isEditable;

    if (!cellData) return null;

    // @TODO: This is super slow since every single cell needs to be merged
    // with local triples and relations. We need a nice way to only re-render
    // cells that have changed _without_ doing computation. in each cell. We
    // could just store local renderable state changes instead of using the
    // global state?
    //
    // We need some mechanism that can pass through the data for each cell
    // instead of each cell having to calculate its own data. We do some of
    // this work already in the table block store when we merge rows, but
    // right now that isn't reactive because we don't re-run that function
    // when local data changes. Maybe we should somehow.
    //
    // Q: Is the table-rerendering when there are local changes? Does this
    // cause the cells to also re-render even when they don't need to?
    const valueType = columnValueType(cellData.columnId, columns);
    const attributeName = columnName(cellData.columnId, columns);
    const maybeColumnSchema = columnsSchema.get(PropertyId(cellData.columnId));
    const filterableRelationType = maybeColumnSchema?.relationValueTypeId;

    // eslint-disable-next-line react-hooks/rules-of-hooks
    const cellTriples = useTriples(
      // eslint-disable-next-line react-hooks/rules-of-hooks
      React.useMemo(() => {
        return {
          mergeWith: cellData.triples,
          selector: triple => {
            const isRowCell = triple.entityId === cellData.entityId;
            const isColCell = triple.attributeId === cellData.columnId;
            const isCurrentValueType = triple.value.type === valueTypes[valueType];

            return isRowCell && isColCell && isCurrentValueType;
          },
        };
      }, [cellData, valueType])
    );

    // eslint-disable-next-line react-hooks/rules-of-hooks
    const cellRelations = useRelations(
      // eslint-disable-next-line react-hooks/rules-of-hooks
      React.useMemo(() => {
        return {
          mergeWith: cellData.relations,
          selector: relation => {
            const isRowCell = relation.fromEntity.id === cellData.entityId;
            const isColCell = relation.typeOf.id === cellData.columnId;

            return isRowCell && isColCell;
          },
        };
      }, [cellData])
    );

    const placeholder = makePlaceholderFromValueType({
      attributeId: cellData.columnId,
      attributeName: attributeName,
      entityId: cellData.entityId,
      spaceId,
      valueType,
    });

    const entityName = Entities.name(cellTriples);

    const renderables = toRenderables({
      entityId: cellData.entityId,
      entityName,
      spaceId,
      triples: cellTriples,
      relations: cellRelations,
      // If the cell is empty in edit mode then we render a placeholder value
      // until the user enters a real value.
      placeholderRenderables: isEditable ? [placeholder] : undefined,
    });

    if (isEditable) {
      return (
        <EditableEntityTableCell
          renderables={renderables}
          attributeId={cellData.columnId}
          entityId={cellData.entityId}
          spaceId={spaceId}
          filterSearchByTypes={filterableRelationType ? [filterableRelationType] : undefined}
        />
      );
    }

    return (
      <EntityTableCell
        entityId={cellData.entityId}
        columnId={cellData.columnId}
        renderables={renderables}
        space={spaceId}
        isExpanded={isExpanded}
      />
    );
  },
};

interface Props {
  space: string;
  columns: PropertySchema[];
  rows: Row[];
  shownColumnIds: string[];
  view: DataBlockView;
  source: Source;
  placeholder: { text: string; image: string };
  filterState: Filter[];
}

// eslint-disable-next-line react/display-name
export const TableBlockTable = React.memo(
  ({ rows, space, columns, shownColumnIds, placeholder, view, source, filterState }: Props) => {
    const isEditingColumns = useAtomValue(editingColumnsAtom);

    const [expandedCells, setExpandedCells] = useState<Record<string, boolean>>({});
    const isEditable = useUserIsEditing(space);

    const table = useReactTable({
      // @TODO: We can merge local row data here?
      data: rows,
      columns: formatColumns(columns, isEditable, [], SpaceId(space)),
      defaultColumn,
      getCoreRowModel: getCoreRowModel(),
      getFilteredRowModel: getFilteredRowModel(),
      getPaginationRowModel: getPaginationRowModel(),
      state: {
        pagination: {
          pageIndex: 0,
          pageSize: 9,
        },
      },
      meta: {
        expandedCells,
        space,
        isEditable: isEditable,
      },
    });

    const onCreateNewEntity = (
      entity: Pick<SearchResult, 'id' | 'name'> & { space?: EntityId; verified?: boolean }
    ) => {
      for (const filter of filterState) {
        if (filter.columnId === SYSTEM_IDS.TYPES_ATTRIBUTE) {
          DB.upsertRelation({
            spaceId: space,
            relation: {
              space,
              index: INITIAL_RELATION_INDEX_VALUE,
              fromEntity: {
                id: entity.id,
                name: entity.name,
              },
              typeOf: {
                id: EntityId(filter.columnId),
                name: 'Types',
              },
              toEntity: {
                id: EntityId(filter.value),
                name: filter.valueName,
                renderableType: 'RELATION',
                value: filter.value,
              },
            },
          });
        }
      }
    };

    const onSelectCollectionItem = (
      entity: Pick<SearchResult, 'id' | 'name'> & { space?: EntityId; verified?: boolean }
    ) => {
      if (source.type === 'COLLECTION') {
        const id = ID.createEntityId();

        upsertCollectionItemRelation({
          relationId: EntityId(id),
          collectionId: EntityId(source.value),
          spaceId: SpaceId(space),
          toEntity: {
            id: entity.id,
            name: entity.name,
          },
        });

        if (entity.space) {
          upsertSourceSpaceOnCollectionItem({
            collectionItemId: EntityId(id),
            toId: EntityId(entity.id),
            spaceId: SpaceId(space),
            sourceSpaceId: entity.space,
          });

          if (entity.verified) {
            upsertVerifiedSourceOnCollectionItem({
              collectionItemId: EntityId(id),
              spaceId: SpaceId(space),
            });
          }
        }
      }
    };

    const isEmpty = rows.length === 0;

    if (isEmpty && source.type !== 'COLLECTION') {
      if (isEditable) {
        return (
          <div className="block rounded-lg bg-grey-01">
            <div className="flex flex-col items-center justify-center gap-4 p-4 text-lg">
              <div>{placeholder.text}</div>
              <img src={placeholder.image} className="!h-[64px] w-auto object-contain" alt="" />
            </div>
          </div>
        );
      }

      return (
        <div className="block rounded-lg bg-grey-01">
          <div className="flex flex-col items-center justify-center gap-4 p-4 text-lg">
            <div>{placeholder.text}</div>
            <div>
              <img src={placeholder.image} className="!h-[64px] w-auto object-contain" alt="" />
            </div>
          </div>
        </div>
      );
    }

    switch (view) {
      case 'TABLE':
        return (
          <div className="overflow-hidden rounded-lg border border-grey-02 p-0">
            <div className="overflow-x-scroll rounded-lg">
              <table className="relative w-full border-collapse border-hidden bg-white" cellSpacing={0} cellPadding={0}>
                <thead>
                  {table.getHeaderGroups().map(headerGroup => (
                    <tr key={headerGroup.id}>
                      {headerGroup.headers.map(header => {
                        const isShown = shownColumnIds.includes(header.id);
                        const headerClassNames = isShown
                          ? null
                          : !isEditingColumns || !isEditable
                          ? 'hidden'
                          : '!bg-grey-01 !text-grey-03';

                        return (
                          <th
                            key={header.id}
                            className={cx(
                              'group relative min-w-[250px] border-b border-grey-02 p-[10px] text-left',
                              headerClassNames
                            )}
                          >
                            <div className="flex h-full w-full items-center gap-[10px]">
                              {isEditable && !isShown ? <EyeHide /> : null}
                              {flexRender(header.column.columnDef.header, header.getContext())}
                            </div>
                          </th>
                        );
                      })}
                    </tr>
                  ))}
                </thead>
                <tbody>
                  {source.type === 'COLLECTION' && isEditable && (
                    <TableCell width={784} isExpanded={false} toggleExpanded={() => {}} isShown>
                      <SelectEntity
                        spaceId={space}
                        onDone={onSelectCollectionItem}
                        onCreateEntity={onCreateNewEntity}
                      />
                    </TableCell>
                  )}
                  {table.getRowModel().rows.map((row, index: number) => {
                    const cells = row.getVisibleCells();
                    const entityId = cells?.[0]?.getValue<Cell>()?.entityId;

                    return (
                      <tr key={entityId ?? index} className="hover:bg-bg">
                        {cells.map(cell => {
                          const cellId = `${row.original.entityId}-${cell.column.id}`;
                          const firstTriple = cell.getValue<Cell>()?.triples[0];

                          const isNameCell = Boolean(firstTriple?.attributeId === SYSTEM_IDS.NAME_ATTRIBUTE);
                          const isExpandable = firstTriple && firstTriple.value.type === 'TEXT';
                          const isShown = shownColumnIds.includes(cell.column.id);

                          const href = NavUtils.toEntity(
                            isNameCell ? row.original.columns[SYSTEM_IDS.NAME_ATTRIBUTE]?.space ?? space : space,
                            entityId
                          );
                          const { verified } = row.original.columns[SYSTEM_IDS.NAME_ATTRIBUTE];

                          return (
                            <TableCell
                              key={cellId}
                              isLinkable={isNameCell && isEditable}
                              href={href}
                              isExpandable={isExpandable}
                              isExpanded={expandedCells[cellId]}
                              width={cell.column.getSize()}
                              toggleExpanded={() =>
                                setExpandedCells(prev => ({
                                  ...prev,
                                  [cellId]: !prev[cellId],
                                }))
                              }
                              isShown={isShown}
                              isEditMode={isEditable}
                            >
                              {isNameCell && verified && (
                                <span>
                                  <CheckCircle color={isEditable ? 'text' : 'ctaPrimary'} />
                                </span>
                              )}
                              {flexRender(cell.column.columnDef.cell, cell.getContext())}
                            </TableCell>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      case 'LIST':
        return (
          <div className="flex flex-col gap-4">
            {rows.map((row, index: number) => {
              const nameCell = row.columns[SYSTEM_IDS.NAME_ATTRIBUTE];
              const { entityId, name, description, image, verified } = nameCell;
              const href = NavUtils.toEntity(nameCell?.space ?? space, entityId);

              return (
                <div key={index}>
                  <Link href={href} className="group inline-flex items-center gap-6 pr-6">
                    <div className="relative h-20 w-20 flex-shrink-0 overflow-clip rounded-lg bg-grey-01">
                      <Image
                        src={image ? getImagePath(image) : PLACEHOLDER_SPACE_IMAGE}
                        className="object-cover transition-transform duration-150 ease-in-out group-hover:scale-105"
                        alt=""
                        fill
                      />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        {verified && (
                          <div>
                            <CheckCircle />
                          </div>
                        )}
                        <div className="truncate text-smallTitle font-medium text-text">{name}</div>
                      </div>
                      {description && <div className="mt-0.5 text-metadata text-grey-04">{description}</div>}
                    </div>
                  </Link>
                </div>
              );
            })}
          </div>
        );
      case 'GALLERY':
        return (
          <div className="grid grid-cols-3 gap-x-4 gap-y-10">
            {rows.map((row, index: number) => {
              const nameCell = row.columns[SYSTEM_IDS.NAME_ATTRIBUTE];
              const { entityId, name, image, verified } = nameCell;
              const href = NavUtils.toEntity(nameCell?.space ?? space, entityId);

              return (
                <Link key={index} href={href} className="group flex flex-col gap-3">
                  <div className="relative aspect-[2/1] w-full overflow-clip rounded-lg bg-grey-01">
                    <Image
                      src={image ? getImagePath(image) : PLACEHOLDER_SPACE_IMAGE}
                      className="object-cover transition-transform duration-150 ease-in-out group-hover:scale-105"
                      alt=""
                      fill
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    {verified && (
                      <div>
                        <CheckCircle />
                      </div>
                    )}
                    <div className="truncate text-smallTitle font-medium text-text">{name}</div>
                  </div>
                </Link>
              );
            })}
          </div>
        );
    }
  }
);
