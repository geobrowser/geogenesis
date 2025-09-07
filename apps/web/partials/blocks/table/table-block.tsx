'use client';

import { SystemIds } from '@graphprotocol/grc-20';
import cx from 'classnames';
import { AnimatePresence, motion } from 'framer-motion';
import produce from 'immer';

import * as React from 'react';

import { upsertCollectionItemRelation } from '~/core/blocks/data/collection';
import { Filter } from '~/core/blocks/data/filters';
import { useDataBlock } from '~/core/blocks/data/use-data-block';
import { useFilters } from '~/core/blocks/data/use-filters';
import { useSource } from '~/core/blocks/data/use-source';
import { useView } from '~/core/blocks/data/use-view';
import { useCreateEntityWithFilters } from '~/core/hooks/use-create-entity-with-filters';
import { useSpaces } from '~/core/hooks/use-spaces';
import { useCanUserEdit, useUserIsEditing } from '~/core/hooks/use-user-is-editing';
import { ID } from '~/core/id';
import { useEditable } from '~/core/state/editable-store';
import { useMutate } from '~/core/sync/use-mutate';
import { getRelation } from '~/core/sync/use-store';
import { OmitStrict } from '~/core/types';
import { PagesPaginationPlaceholder } from '~/core/utils/utils';
import { NavUtils } from '~/core/utils/utils';
import { getPaginationPages } from '~/core/utils/utils';
import { sortRows } from '~/core/utils/utils';
import { Cell, Relation, Row, SearchResult, Value } from '~/core/v2.types';

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
import TableBlockGalleryItemsDnd from './table-block-gallery-items-dnd';
import TableBlockListItemsDnd from './table-block-list-items-dnd';
import { TableBlockTable } from './table-block-table';

interface Props {
  spaceId: string;
}

function makePlaceholderRow(entityId: string, properties: { id: string; name: string | null }[]) {
  const columns: Record<string, Cell> = {};

  columns[SystemIds.NAME_PROPERTY] = {
    slotId: SystemIds.NAME_PROPERTY,
    propertyId: ID.createEntityId(),
    name: null,
  };

  for (const p of properties) {
    const maybeColumn = columns[p.id];

    if (!maybeColumn) {
      columns[p.id] = {
        slotId: p.id,
        propertyId: ID.createEntityId(),
        name: null,
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
function useEntries(
  entries: Row[],
  properties: { id: string; name: string | null }[],
  spaceId: string,
  filterState: Filter[],
  relations: Relation[] | undefined
) {
  const isEditing = useUserIsEditing(spaceId);
  const { source } = useSource();
  const { setEditable } = useEditable();
  const [hasPlaceholderRow, setHasPlaceholderRow] = React.useState(false);
  const [pendingEntityId, setPendingEntityId] = React.useState<string | null>(null);

  const { storage } = useMutate();
  const { nextEntityId, onClick: createEntityWithTypes } = useCreateEntityWithFilters(spaceId);

  const entriesWithPosition = entries.map(row => {
    return {
      ...row,
      position: relations?.find(relation => relation.toEntity.id === row.entityId)?.position,
    };
  });

  const onUpdateRelation = (relation: Relation, newPosition: string | null) => {
    storage.relations.update(relation, draft => {
      if (newPosition) draft.position = newPosition;
    });
  };

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
    ? [makePlaceholderRow(placeholderEntityId, properties), ...entriesWithPosition]
    : entriesWithPosition;

  const onChangeEntry: onChangeEntryFn = (context, event) => {
    if (event.type === 'EVENT') {
      // @TODO(migration): Editable data block content
      // const send = action({
      //   context,
      // });
      // send(event.data);

      if (event.data.type === 'UPSERT_RENDERABLE_TRIPLE_VALUE') {
        const value: Value | OmitStrict<Value, 'id'> = {
          id: event.data.payload.renderable.entityId ?? undefined,
          entity: {
            id: context.entityId,
            name: event.data.payload.renderable.entityName,
          },
          property: {
            id: event.data.payload.renderable.attributeId,
            name: event.data.payload.renderable.attributeName,
            dataType: event.data.payload.renderable.type,
          },
          spaceId,
          value: event.data.payload.value.value ?? '',
        };

        if (!event.data.payload.renderable.entityId) {
          storage.values.set(value);
        } else {
          storage.values.update(value, draft => {
            draft.value = event.data.payload.value.value;
          });
        }
      }
    }

    // Adding a collection item shouldn't _only_ be for FOC. Should be for adding any data
    // How do we know what the collection item values should be?
    if (source.type === 'COLLECTION') {
      const maybeHasCollectionItem = entries.find(e => e.entityId === context.entityId);

      if (!maybeHasCollectionItem) {
        let to: (Pick<SearchResult, 'id' | 'name'> & { space?: string; verified?: boolean }) | null = null;

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
            id: context.entityId,
            name: context.entityName,
            space: context.spaceId,
            verified: false,
          };
        }

        if (to !== null) {
          const id = ID.createEntityId();

          upsertCollectionItemRelation({
            relationId: id,
            collectionId: source.value,
            spaceId: spaceId,
            toEntity: {
              id: to.id,
              name: to.name,
            },
            toSpaceId: to.space,
            verified: to.verified,
          });

          // Mark this ID as pending to keep the placeholder visible
          setPendingEntityId(to.id);
        }
      }
    }

    if (context.entityId === nextEntityId) {
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
      id: string;
      name: string | null;
      space?: string;
      verified?: boolean;
    }
  ) => {
    const relation = getRelation({
      selector: r => r.spaceId === spaceId && r.id === id,
    });

    if (relation) {
      storage.relations.update(relation, draft => {
        draft.toSpaceId = to.space;
        draft.verified = to.verified;
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
    onUpdateRelation,
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
    relations,
    collectionLength,
    pageSize,
  } = useDataBlock();
  const { filterState, setFilterState } = useFilters();
  const { view, placeholder, shownColumnIds } = useView();
  const { source } = useSource();
  const { entries, onAddPlaceholder, onChangeEntry, onLinkEntry, onUpdateRelation } = useEntries(
    rows,
    properties,
    spaceId,
    filterState,
    relations
  );

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
        value: spaces.find(s => s.id.toLowerCase() === f.value.toLowerCase())?.entity?.name ?? f.value,
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
    />
  );

  if (view === 'LIST' && entries.length > 0) {
    EntriesComponent = (
      <TableBlockListItemsDnd
        isEditing={isEditing}
        onChangeEntry={onChangeEntry}
        onLinkEntry={onLinkEntry}
        propertiesSchema={propertiesSchema}
        source={source}
        spaceId={spaceId}
        entries={entries}
        onUpdateRelation={onUpdateRelation}
        relations={relations ?? []}
        collectionLength={collectionLength}
        pageNumber={pageNumber}
        pageSize={pageSize}
      />
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
              relationId={row.columns[SystemIds.NAME_PROPERTY]?.relationId}
              source={source}
            />
          );
        })}
      </div>
    );
  }

  if (view === 'GALLERY' && entries.length > 0) {
    EntriesComponent = (
      <TableBlockGalleryItemsDnd
        isEditing={isEditing}
        onChangeEntry={onChangeEntry}
        onLinkEntry={onLinkEntry}
        propertiesSchema={propertiesSchema}
        source={source}
        spaceId={spaceId}
        entries={entries}
        onUpdateRelation={onUpdateRelation}
        relations={relations ?? []}
        collectionLength={collectionLength}
        pageNumber={pageNumber}
        pageSize={pageSize}
      />
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

  const renderPlusButtonAsInline = source.type !== 'RELATIONS' && canEdit;

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

                      setFilterState(newFilterState);
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
