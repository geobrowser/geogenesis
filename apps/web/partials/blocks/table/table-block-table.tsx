'use client';

import { CONTENT_IDS, SYSTEM_IDS } from '@geogenesis/sdk';
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

import {
  upsertCollectionItemRelation,
  upsertSourceSpaceOnCollectionItem,
  upsertVerifiedSourceOnCollectionItem,
} from '~/core/blocks/data/collection';
import { Filter } from '~/core/blocks/data/filters';
import { Source } from '~/core/blocks/data/source';
import { useDataBlock } from '~/core/blocks/data/use-data-block';
import { useSource } from '~/core/blocks/data/use-source';
import { DataBlockView } from '~/core/blocks/data/use-view';
import { PLACEHOLDER_SPACE_IMAGE } from '~/core/constants';
import { DB } from '~/core/database/write';
import { PropertyId } from '~/core/hooks/use-properties';
import { useUserIsEditing } from '~/core/hooks/use-user-is-editing';
import { ID } from '~/core/id';
import { SearchResult } from '~/core/io/dto/search';
import { EntityId, SpaceId } from '~/core/io/schema';
import { Cell, PropertySchema, RenderableProperty, Row } from '~/core/types';
import { NavUtils, getImagePath } from '~/core/utils/utils';

import { Checkbox, getChecked } from '~/design-system/checkbox';
import { LinkableRelationChip } from '~/design-system/chip';
import { DateField } from '~/design-system/editable-fields/date-field';
import { WebUrlField } from '~/design-system/editable-fields/web-url-field';
import { CheckCircle } from '~/design-system/icons/check-circle';
import { EyeHide } from '~/design-system/icons/eye-hide';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';
import { SelectEntity } from '~/design-system/select-entity';
import { Spacer } from '~/design-system/spacer';
import { TableCell } from '~/design-system/table/cell';
import { Text } from '~/design-system/text';

import { EntityTableCell } from '~/partials/entities-page/entity-table-cell';
import { EditableEntityTableCell } from '~/partials/entity-page/editable-entity-table-cell';
import { EditableEntityTableColumnHeader } from '~/partials/entity-page/editable-entity-table-column-header';

import { editingPropertiesAtom } from '~/atoms';

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
          <Text variant="smallTitle">{isNameColumn ? 'Name' : (column.name ?? column.id)}</Text>
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
    const { propertiesSchema } = useDataBlock();

    // eslint-disable-next-line react-hooks/rules-of-hooks
    const { source } = useSource();

    const cellData = getValue<Cell | undefined>();

    // Currently relations (rollup) blocks aren't editable.
    const isEditable = source.type === 'RELATIONS' ? false : table.options.meta?.isEditable;

    if (!cellData) return null;

    const maybePropertiesSchema = propertiesSchema.get(PropertyId(cellData.slotId));
    const filterableRelationType = maybePropertiesSchema?.relationValueTypeId;
    const propertyId = cellData.renderedPropertyId ? cellData.renderedPropertyId : cellData.slotId;

    const renderables = cellData.renderables;

    if (isEditable) {
      return (
        <EditableEntityTableCell
          renderables={renderables}
          attributeId={propertyId}
          entityId={cellData.cellId}
          spaceId={spaceId}
          filterSearchByTypes={filterableRelationType ? [filterableRelationType] : undefined}
        />
      );
    }

    return (
      <EntityTableCell
        entityId={cellData.cellId}
        columnId={propertyId}
        renderables={renderables}
        space={spaceId}
        isExpanded={isExpanded}
      />
    );
  },
};

interface Props {
  space: string;
  properties: PropertySchema[];
  rows: Row[];
  shownColumnIds: string[];
  view: DataBlockView;
  source: Source;
  placeholder: { text: string; image: string };
  filterState: Filter[];
}

// eslint-disable-next-line react/display-name
export const TableBlockTable = React.memo(
  ({ rows, space, properties, shownColumnIds, placeholder, view, source, filterState }: Props) => {
    const isEditingColumns = useAtomValue(editingPropertiesAtom);

    const [expandedCells, setExpandedCells] = useState<Record<string, boolean>>({});
    const isEditable = useUserIsEditing(space);

    const table = useReactTable({
      data: rows,
      columns: formatColumns(properties, isEditable, [], SpaceId(space)),
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
                    const entityId = cells?.[0]?.getValue<Cell>()?.cellId;

                    return (
                      <tr key={entityId ?? index} className="hover:bg-bg">
                        {cells.map(cell => {
                          const cellId = `${row.original.entityId}-${cell.column.id}`;
                          const firstTriple = cell.getValue<Cell>()?.renderables.find(r => r.type === 'TEXT');

                          const isNameCell = Boolean(firstTriple?.attributeId === SYSTEM_IDS.NAME_ATTRIBUTE);
                          const isExpandable = firstTriple && firstTriple.type === 'TEXT';
                          const isShown = shownColumnIds.includes(cell.column.id);

                          const href = NavUtils.toEntity(
                            isNameCell ? (row.original.columns[SYSTEM_IDS.NAME_ATTRIBUTE]?.space ?? space) : space,
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
              const maybeAvatarData: Cell | undefined = row.columns[CONTENT_IDS.AVATAR_ATTRIBUTE];
              const maybeCoverData: Cell | undefined = row.columns[SYSTEM_IDS.COVER_ATTRIBUTE];
              const maybeDescriptionData: Cell | undefined = row.columns[SYSTEM_IDS.DESCRIPTION_ATTRIBUTE];

              console.log('row.columns', row.columns);

              // @TODO: An "everything" else ID that can be used to render any renderable.
              const { cellId, name, verified } = nameCell;
              let { description, image } = nameCell;

              const maybeDescription = maybeDescriptionData?.renderables.find(
                r => r.attributeId === SYSTEM_IDS.DESCRIPTION_ATTRIBUTE
              )?.value;

              if (maybeDescription) {
                description = maybeDescription;
              }

              const maybeAvatarUrl = maybeAvatarData?.renderables.find(
                r => r.attributeId === CONTENT_IDS.AVATAR_ATTRIBUTE
              )?.value;

              const maybeCoverUrl = maybeCoverData?.renderables.find(
                r => r.attributeId === SYSTEM_IDS.COVER_ATTRIBUTE
              )?.value;

              if (maybeCoverUrl) {
                image = maybeCoverUrl;
              }

              if (maybeAvatarUrl) {
                image = maybeAvatarUrl;
              }

              const href = NavUtils.toEntity(nameCell?.space ?? space, cellId);

              const otherPropertyData = Object.values(row.columns).filter(
                c =>
                  c.slotId !== SYSTEM_IDS.NAME_ATTRIBUTE &&
                  c.slotId !== CONTENT_IDS.AVATAR_ATTRIBUTE &&
                  c.slotId !== SYSTEM_IDS.COVER_ATTRIBUTE &&
                  c.slotId !== SYSTEM_IDS.DESCRIPTION_ATTRIBUTE
              );

              console.log('otherPropertyData', otherPropertyData);

              return (
                <div key={index}>
                  <Link href={href} className="group flex w-full max-w-full items-center gap-6 pr-6">
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
                        <div className="line-clamp-1 text-smallTitle font-medium text-text md:line-clamp-2">{name}</div>
                      </div>
                      {description && (
                        <div className="mt-0.5 line-clamp-4 text-metadata text-grey-04 md:line-clamp-3">
                          {description}
                        </div>
                      )}

                      {otherPropertyData.map(p => {
                        return (
                          <>
                            <Spacer height={8} />
                            <PropertyField
                              key={p.slotId}
                              renderables={p.renderables}
                              spaceId={space}
                              entityId={cellId}
                            />
                          </>
                        );
                      })}
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
              const nameCell: Cell | undefined = row.columns[SYSTEM_IDS.NAME_ATTRIBUTE];
              const maybeAvatarData: Cell | undefined = row.columns[CONTENT_IDS.AVATAR_ATTRIBUTE];
              const maybeCoverData: Cell | undefined = row.columns[SYSTEM_IDS.COVER_ATTRIBUTE];

              // @TODO: An "everything" else ID that can be used to render any renderable.
              const { cellId, name, verified } = nameCell;
              let { image } = nameCell;

              const maybeAvatarUrl = maybeAvatarData?.renderables.find(
                r => r.attributeId === CONTENT_IDS.AVATAR_ATTRIBUTE
              )?.value;

              const maybeCoverUrl = maybeCoverData?.renderables.find(
                r => r.attributeId === SYSTEM_IDS.COVER_ATTRIBUTE
              )?.value;

              if (maybeAvatarUrl) {
                image = maybeAvatarUrl;
              }

              if (maybeCoverUrl) {
                image = maybeCoverUrl;
              }

              const href = NavUtils.toEntity(nameCell?.space ?? space, cellId);

              const otherPropertyData = Object.values(row.columns).filter(
                c =>
                  c.slotId !== SYSTEM_IDS.NAME_ATTRIBUTE &&
                  c.slotId !== CONTENT_IDS.AVATAR_ATTRIBUTE &&
                  c.slotId !== SYSTEM_IDS.COVER_ATTRIBUTE &&
                  c.slotId !== SYSTEM_IDS.DESCRIPTION_ATTRIBUTE
              );

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
                  {otherPropertyData.map(p => {
                    return (
                      <PropertyField key={p.slotId} renderables={p.renderables} spaceId={space} entityId={cellId} />
                    );
                  })}
                </Link>
              );
            })}
          </div>
        );
    }
  }
);

function PropertyField(props: { renderables: RenderableProperty[]; spaceId: string; entityId: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      {props.renderables.map(renderable => {
        console.log('renderable', renderable);
        switch (renderable.type) {
          case 'TEXT':
          case 'NUMBER':
            return (
              <Text key={`string-${renderable.attributeId}-${renderable.value}`} as="p">
                {renderable.value}
              </Text>
            );
          case 'CHECKBOX': {
            const checked = getChecked(renderable.value);
            return <Checkbox key={`checkbox-${renderable.attributeId}-${renderable.value}`} checked={checked} />;
          }
          case 'TIME': {
            return (
              <DateField
                key={`time-${renderable.attributeId}-${renderable.value}`}
                isEditing={false}
                value={renderable.value}
              />
            );
          }
          case 'URL': {
            return (
              <WebUrlField
                key={`uri-${renderable.attributeId}-${renderable.value}`}
                isEditing={false}
                spaceId={props.spaceId}
                value={renderable.value}
              />
            );
          }
          case 'IMAGE':
            // We don't support rendering images in list or gallery views except the main image
            return null;
          case 'RELATION':
            return (
              <LinkableRelationChip isEditing={false} entityHref={''} relationHref="">
                {renderable.valueName ?? renderable.value}
              </LinkableRelationChip>
            );
        }
      })}
    </div>
  );
}
