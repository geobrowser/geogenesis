'use client';

import { SystemIds } from '@graphprotocol/grc-20';
import cx from 'classnames';
import { AnimatePresence, motion } from 'framer-motion';
import produce from 'immer';

import * as React from 'react';

import {
  upsertCollectionItemRelation,
  upsertSourceSpaceOnCollectionItem,
  upsertVerifiedSourceOnCollectionItem,
} from '~/core/blocks/data/collection';
import { Filter } from '~/core/blocks/data/filters';
import { useDataBlock } from '~/core/blocks/data/use-data-block';
import { useFilters } from '~/core/blocks/data/use-filters';
import { useSource } from '~/core/blocks/data/use-source';
import { useView } from '~/core/blocks/data/use-view';
import { editEvent } from '~/core/events/edit-events';
import { useCreateEntityWithFilters } from '~/core/hooks/use-create-entity-with-filters';
import { useSpaces } from '~/core/hooks/use-spaces';
import { useCanUserEdit, useUserIsEditing } from '~/core/hooks/use-user-is-editing';
import { ID } from '~/core/id';
import { SearchResult } from '~/core/io/dto/search';
import { EntityId, SpaceId } from '~/core/io/schema';
import { useEditable } from '~/core/state/editable-store';
import { Cell, PropertySchema, Row } from '~/core/types';
import { PagesPaginationPlaceholder } from '~/core/utils/utils';
import { NavUtils } from '~/core/utils/utils';
import { getPaginationPages } from '~/core/utils/utils';
import { VALUE_TYPES } from '~/core/value-types';

import { IconButton } from '~/design-system/button';
import { Create } from '~/design-system/icons/create';
import { FilterTable } from '~/design-system/icons/filter-table';
import { FilterTableWithFilters } from '~/design-system/icons/filter-table-with-filters';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';
import { Spacer } from '~/design-system/spacer';
import { PageNumberContainer } from '~/design-system/table/styles';
import { NextButton, PageNumber, PreviousButton } from '~/design-system/table/table-pagination';
import { Text } from '~/design-system/text';

import { onChangeEntryFn } from './change-entry';
import { DataBlockViewMenu } from './data-block-view-menu';
import { TableBlockBulletedListItem } from './table-block-bulleted-list-item';
import { TableBlockContextMenu } from './table-block-context-menu';
import { TableBlockEditableFilters } from './table-block-editable-filters';
import { TableBlockEditableTitle } from './table-block-editable-title';
import { TableBlockFilterPill } from './table-block-filter-pill';
import { TableBlockGalleryItem } from './table-block-gallery-item';
import { TableBlockListItem } from './table-block-list-item';
import { TableBlockTable } from './table-block-table';

interface Props {
  spaceId: string;
}

function makePlaceholderRow(entityId: string, spaceId: string, properties: PropertySchema[]) {
  const columns: Record<string, Cell> = {};

  columns[SystemIds.NAME_ATTRIBUTE] = {
    slotId: SystemIds.NAME_ATTRIBUTE,
    cellId: ID.createEntityId(),
    name: null,
    renderables: [],
  };

  for (const p of properties) {
    // Why were we skipping the name attribute?
    // if (p.id === EntityId(SystemIds.NAME_ATTRIBUTE)) {
    //   continue;
    // }

    const maybeColumn = columns[p.id];

    if (!maybeColumn || maybeColumn?.renderables.length === 0) {
      columns[p.id] = {
        slotId: p.id,
        cellId: ID.createEntityId(),
        name: null,
        renderables: [
          {
            type: VALUE_TYPES[p.valueType] ?? 'TEXT',
            relationId: p.id,
            valueName: p.name,
            entityId: entityId,
            entityName: null,
            attributeId: p.id,
            attributeName: p.name,
            spaceId,
            value: '',
            placeholder: true,
          },
        ],
      };
    }
  }

  return {
    placeholder: true,
    columns,
    entityId,
  };
}

// @TODO: Maybe this can live in the useDataBlock hook? Probably want it to so
// we can access it deeply in table cells, etc.
//
// We might want a way to store this in some local state so changes are optimistic
// and we don't have to enter loading states when adding/removing entries
function useEntries(entries: Row[], properties: PropertySchema[], spaceId: string, filterState: Filter[]) {
  const isEditing = useUserIsEditing(spaceId);
  const { source } = useSource();
  const { setEditable } = useEditable();
  const [hasPlaceholderRow, setHasPlaceholderRow] = React.useState(false);
  const [pendingEntityId, setPendingEntityId] = React.useState<string | null>(null);

  const { nextEntityId, onClick: createEntityWithTypes } = useCreateEntityWithFilters(spaceId);

  // Clear pending ID once it appears in entries
  React.useEffect(() => {
    if (pendingEntityId && entries.find(e => e.entityId === pendingEntityId)) {
      setPendingEntityId(null);
    }
  }, [entries, pendingEntityId]);

  // Show the placeholder row if we're editing and either:
  // 1. We have hasPlaceholderRow set and no entry exists with nextEntityId
  // 2. We have a pendingEntityId that hasn't appeared in entries yet
  const shouldShowPlaceholder =
    isEditing &&
    ((hasPlaceholderRow && !entries.find(e => e.entityId === nextEntityId)) ||
      (pendingEntityId && !entries.find(e => e.entityId === pendingEntityId)));

  const placeholderEntityId = pendingEntityId || nextEntityId;

  const renderedEntries = shouldShowPlaceholder
    ? [makePlaceholderRow(placeholderEntityId, spaceId, properties), ...entries]
    : entries;

  const onChangeEntry: onChangeEntryFn = (context, event) => {
    if (event.type === 'EVENT') {
      const send = editEvent({
        context,
      });

      send(event.data);
    }

    // Adding a collection item shouldn't _only_ be for FOC. Should be for adding any data
    // How do we know what the collection item values should be?
    if (source.type === 'COLLECTION') {
      const maybeHasCollectionItem = entries.find(e => e.entityId === context.entityId);

      if (!maybeHasCollectionItem) {
        let to: (Pick<SearchResult, 'id' | 'name'> & { space?: EntityId; verified?: boolean }) | null = null;

        if (event.type === 'Find') {
          to = event.data;
        }

        if (event.type === 'Create') {
          to = {
            ...event.data,
            id: nextEntityId,
          };
        }

        if (event.type === 'EVENT') {
          to = {
            id: EntityId(context.entityId),
            name: context.entityName,
            space: EntityId(context.spaceId),
            verified: false,
          };
        }

        if (to !== null) {
          const id = ID.createEntityId();

          upsertCollectionItemRelation({
            relationId: EntityId(id),
            collectionId: EntityId(source.value),
            spaceId: SpaceId(spaceId),
            toEntity: {
              id: EntityId(to.id),
              name: to.name,
            },
          });

          // Callers can optionally pass a selected entity in the case of Find or Create
          // to set the collection. We allow setting any data or using FOC.
          if (to.space) {
            upsertSourceSpaceOnCollectionItem({
              collectionItemId: EntityId(id),
              toId: EntityId(to.id),
              spaceId: SpaceId(spaceId),
              sourceSpaceId: to.space,
            });
          }

          if (to.space && to.verified) {
            upsertVerifiedSourceOnCollectionItem({
              collectionItemId: EntityId(id),
              spaceId: SpaceId(spaceId),
              verified: true,
            });
          }

          // Mark this ID as pending to keep the placeholder visible
          setPendingEntityId(to.id);
        }
      }
    }

    if (context.entityId === nextEntityId || context.entityId === pendingEntityId) {
      setHasPlaceholderRow(false);

      /**
       * We only create new entities during Find or Create and when creating
       * from a placeholder.
       *
       * Find or Create is currently only available for Collections. We should
       * only create new entities when we are creating. If we are finding then
       * the entity already exists.
       */
      if (event.type !== 'Find') {
        const maybeName = event.type === 'Create' ? event.data.name : undefined;

        // Mark this ID as pending before creating
        setPendingEntityId(context.entityId);

        createEntityWithTypes({
          name: maybeName,
          filters: filterState,
        });
      }
    }
  };

  const onLinkEntry = (
    id: string,
    to: {
      id: EntityId;
      name: string | null;
      space?: EntityId;
      verified?: boolean;
    },
    currentlyVerified?: boolean
  ) => {
    upsertSourceSpaceOnCollectionItem({
      collectionItemId: EntityId(id),
      toId: EntityId(to.id),
      spaceId: SpaceId(spaceId),
      sourceSpaceId: to.space,
    });

    if (to.space && to.verified) {
      upsertVerifiedSourceOnCollectionItem({
        collectionItemId: EntityId(id),
        spaceId: SpaceId(spaceId),
        verified: true,
      });
    } else if (to.space && !to.verified && currentlyVerified) {
      upsertVerifiedSourceOnCollectionItem({
        collectionItemId: EntityId(id),
        spaceId: SpaceId(spaceId),
        verified: false,
      });
    }
  };

  const onAddPlaceholder = () => {
    setEditable(true);
    setHasPlaceholderRow(true);
  };

  return {
    entries: renderedEntries,
    onAddPlaceholder,
    onChangeEntry,
    onLinkEntry,
  };
}

export const TableBlock = ({ spaceId }: Props) => {
  const [isFilterOpen, setIsFilterOpen] = React.useState(false);
  const isEditing = useUserIsEditing(spaceId);
  const canEdit = useCanUserEdit(spaceId);
  const { spaces } = useSpaces();
  const {
    properties,
    rows,
    setPage,
    isLoading,
    hasNextPage,
    hasPreviousPage,
    pageNumber,
    propertiesSchema,
    totalPages,
  } = useDataBlock();
  const { filterState, setFilterState } = useFilters();
  const { view, placeholder, shownColumnIds } = useView();
  const { source } = useSource();
  const { entries, onAddPlaceholder, onChangeEntry, onLinkEntry } = useEntries(rows, properties, spaceId, filterState);

  /**
   * There are several types of columns we might be filtering on, some of which aren't actually columns, so have
   * special handling when creating the graphql string.
   * 1. Name
   * 2. Space
   * 3. Types
   * 4. Any entity or string column
   *
   * Name and Space are treated specially throughout this code path.
   */
  const filtersWithPropertyName = filterState.map(f => {
    if (f.columnId === SystemIds.SPACE_FILTER) {
      return {
        ...f,
        columnName: 'Space',
        value: spaces.find(s => s.id.toLowerCase() === f.value.toLowerCase())?.spaceConfig?.name ?? f.value,
      };
    }

    return f;
  });

  const hasPagination = hasPreviousPage || hasNextPage || totalPages > 1;

  let EntriesComponent = (
    <TableBlockTable
      source={source}
      space={spaceId}
      properties={properties}
      propertiesSchema={propertiesSchema}
      rows={entries}
      placeholder={placeholder}
      shownColumnIds={shownColumnIds}
      onChangeEntry={onChangeEntry}
      onLinkEntry={onLinkEntry}
      filterState={filterState}
    />
  );

  if (view === 'LIST' && entries.length > 0) {
    EntriesComponent = (
      <div className={cx('flex w-full flex-col', isEditing ? 'gap-10' : 'gap-4')}>
        {entries.map((row, index: number) => {
          return (
            <TableBlockListItem
              isEditing={isEditing}
              key={`${row.entityId}-${index}`}
              columns={row.columns}
              currentSpaceId={spaceId}
              rowEntityId={row.entityId}
              isPlaceholder={Boolean(row.placeholder)}
              onChangeEntry={onChangeEntry}
              onLinkEntry={onLinkEntry}
              properties={propertiesSchema}
              linkedEntityId={row.columns[SystemIds.NAME_ATTRIBUTE]?.cellId}
              relationId={row.columns[SystemIds.NAME_ATTRIBUTE]?.relationId}
              source={source}
              filterState={filterState}
            />
          );
        })}
      </div>
    );
  }

  if (view === 'BULLETED_LIST' && entries.length > 0) {
    EntriesComponent = (
      <div className="flex w-full flex-col">
        {entries.map((row, index: number) => {
          return (
            <TableBlockBulletedListItem
              isEditing={isEditing}
              key={`${row.entityId}-${index}`}
              columns={row.columns}
              currentSpaceId={spaceId}
              rowEntityId={row.entityId}
              isPlaceholder={Boolean(row.placeholder)}
              onChangeEntry={onChangeEntry}
              onLinkEntry={onLinkEntry}
              properties={propertiesSchema}
              linkedEntityId={row.columns[SystemIds.NAME_ATTRIBUTE]?.cellId}
              relationId={row.columns[SystemIds.NAME_ATTRIBUTE]?.relationId}
              source={source}
              filterState={filterState}
            />
          );
        })}
      </div>
    );
  }

  if (view === 'GALLERY' && entries.length > 0) {
    EntriesComponent = (
      <div className="grid grid-cols-3 gap-x-4 gap-y-10 sm:grid-cols-2">
        {entries.map((row, index: number) => {
          return (
            <TableBlockGalleryItem
              key={`${row.entityId}-${index}`}
              rowEntityId={row.entityId}
              isEditing={isEditing}
              columns={row.columns}
              currentSpaceId={spaceId}
              onChangeEntry={onChangeEntry}
              onLinkEntry={onLinkEntry}
              isPlaceholder={Boolean(row.placeholder)}
              properties={propertiesSchema}
              linkedEntityId={row.columns[SystemIds.NAME_ATTRIBUTE]?.cellId}
              relationId={row.columns[SystemIds.NAME_ATTRIBUTE]?.relationId}
              source={source}
              filterState={filterState}
            />
          );
        })}
      </div>
    );
  }

  if (source.type !== 'COLLECTION' && entries.length === 0) {
    EntriesComponent = (
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

  const renderPlusButtonAsInline = canEdit;

  return (
    <motion.div layout="position" transition={{ duration: 0.15 }}>
      <div className="mb-2 flex h-8 items-center justify-between">
        <TableBlockEditableTitle spaceId={spaceId} />
        <div className="flex items-center gap-5">
          <IconButton
            onClick={() => setIsFilterOpen(!isFilterOpen)}
            icon={filterState.length > 0 ? <FilterTableWithFilters /> : <FilterTable />}
            color="grey-04"
          />

          <DataBlockViewMenu activeView={view} isLoading={isLoading} />
          <TableBlockContextMenu />

          {renderPlusButtonAsInline && (
            <button onClick={onAddPlaceholder}>
              <Create />
            </button>
          )}
        </div>
      </div>

      {isFilterOpen && (
        <AnimatePresence>
          <motion.div
            initial={{ opacity: 0 }}
            exit={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="overflow-hidden border-t border-divider py-4"
          >
            <motion.div
              initial={{ opacity: 0 }}
              exit={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.15, ease: 'easeIn', delay: 0.15 }}
              className="flex items-center gap-2"
            >
              <TableBlockEditableFilters />

              {filtersWithPropertyName.map((f, index) => {
                return (
                  <TableBlockFilterPill
                    key={`${f.columnId}-${f.value}`}
                    filter={f}
                    onDelete={() => {
                      const newFilterState = produce(filterState, draft => {
                        draft.splice(index, 1);
                      });

                      setFilterState(newFilterState, source);
                    }}
                  />
                );
              })}
            </motion.div>
          </motion.div>
        </AnimatePresence>
      )}

      <motion.div layout="position" transition={{ duration: 0.15 }}>
        {isLoading ? (
          <>
            <TableBlockLoadingPlaceholder />
          </>
        ) : (
          EntriesComponent
        )}
        {hasPagination && (
          <>
            <Spacer height={12} />
            <PageNumberContainer>
              {source.type === 'COLLECTION' ? (
                getPaginationPages(totalPages, pageNumber + 1).map((page, index) => {
                  return page === PagesPaginationPlaceholder.skip ? (
                    <Text
                      key={`ellipsis-${index}`}
                      color="grey-03"
                      className="flex justify-center"
                      variant="metadataMedium"
                    >
                      ...
                    </Text>
                  ) : (
                    <PageNumber
                      key={`page-${page}`}
                      number={page}
                      onClick={() => setPage(page - 1)}
                      isActive={page === pageNumber + 1}
                    />
                  );
                })
              ) : (
                <>
                  {pageNumber > 1 && (
                    <>
                      <PageNumber number={1} onClick={() => setPage(0)} />
                      {pageNumber > 2 ? (
                        <Text color="grey-03" variant="metadataMedium">
                          ...
                        </Text>
                      ) : null}
                    </>
                  )}
                  {hasPreviousPage && <PageNumber number={pageNumber} onClick={() => setPage('previous')} />}
                  <PageNumber isActive number={pageNumber + 1} />
                  {hasNextPage && <PageNumber number={pageNumber + 2} onClick={() => setPage('next')} />}
                </>
              )}
              <Spacer width={8} />
              <PreviousButton isDisabled={!hasPreviousPage} onClick={() => setPage('previous')} />
              <NextButton isDisabled={!hasNextPage} onClick={() => setPage('next')} />
            </PageNumberContainer>
          </>
        )}
      </motion.div>
    </motion.div>
  );
};

const DEFAULT_PLACEHOLDER_COLUMN_WIDTH = 880 / 3;

type TableBlockPlaceholderProps = {
  className?: string;
  columns?: number;
  rows?: number;
  shimmer?: boolean;
};

export function TableBlockLoadingPlaceholder({
  className = '',
  columns = 3,
  rows = 10,
  shimmer = true,
}: TableBlockPlaceholderProps) {
  const PLACEHOLDER_COLUMNS = new Array(columns).fill(0);
  const PLACEHOLDER_ROWS = new Array(rows).fill(0);

  return (
    <div className="overflow-hidden rounded-lg border border-grey-02 p-0">
      <div className={cx('overflow-x-clip rounded-lg', className)}>
        <table className="relative w-full border-collapse border-hidden bg-white" cellSpacing={0} cellPadding={0}>
          <thead>
            <tr>
              {PLACEHOLDER_COLUMNS.map((_item: number, index: number) => (
                <th
                  key={index}
                  className="lg:min-w-none border border-b-0 border-grey-02 p-[10px] text-left"
                  style={{ minWidth: DEFAULT_PLACEHOLDER_COLUMN_WIDTH }}
                >
                  <p className={cx('h-5 w-16 rounded-sm bg-divider align-middle', shimmer && 'animate-pulse')}></p>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PLACEHOLDER_ROWS.map((_item: number, index: number) => (
              <tr key={index}>
                {PLACEHOLDER_COLUMNS.map((_item: number, index: number) => (
                  <td
                    key={index}
                    className={cx(
                      'border border-grey-02 bg-transparent p-[10px] align-top',
                      shimmer && 'animate-pulse'
                    )}
                  >
                    <p className="h-5 rounded-sm bg-divider" />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function TableBlockError({ spaceId, blockId }: { spaceId: string; blockId: string }) {
  return (
    <div className="overflow-hidden rounded border border-red-02 p-0">
      <div className="overflow-x-scroll rounded-sm">
        <table className="relative w-full border-collapse border-hidden bg-white" cellSpacing={0} cellPadding={0}>
          <thead>
            <tr>
              <th className="lg:min-w-none border border-b-0 border-grey-02 p-[10px] text-left">
                <p className="h-5 w-full rounded-sm align-middle"></p>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="flex flex-col items-center border-t border-red-02 bg-transparent p-5 align-top">
                <p className="flex text-lg text-text">
                  Something went wrong. Make sure this table is configured correctly.
                </p>
                <Spacer height={12} />
                <Link
                  href={NavUtils.toEntity(spaceId, blockId ?? '')}
                  className="flex cursor-pointer items-center rounded-sm text-button text-grey-04 transition-colors duration-75 hover:text-text"
                >
                  View table block data
                </Link>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
