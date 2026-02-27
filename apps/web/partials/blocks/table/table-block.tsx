'use client';

import { SystemIds } from '@geoprotocol/geo-sdk';
import cx from 'classnames';
import { AnimatePresence, motion } from 'framer-motion';
import { produce } from 'immer';

import * as React from 'react';

import { upsertCollectionItemRelation } from '~/core/blocks/data/collection';
import { Filter } from '~/core/blocks/data/filters';
import { useDataBlock } from '~/core/blocks/data/use-data-block';
import { useFilters } from '~/core/blocks/data/use-filters';
import { useSource } from '~/core/blocks/data/use-source';
import { useView } from '~/core/blocks/data/use-view';
import { useCreateEntityWithFilters } from '~/core/hooks/use-create-entity-with-filters';
import { usePlaceholderAutofocus } from '~/core/hooks/use-placeholder-autofocus';
import { useSpacesByIds } from '~/core/hooks/use-spaces-by-ids';
import { useCanUserEdit, useUserIsEditing } from '~/core/hooks/use-user-is-editing';
import { ID } from '~/core/id';
import { useEditable } from '~/core/state/editable-store';
import { useMutate } from '~/core/sync/use-mutate';
import { getRelation } from '~/core/sync/use-store';
import { Cell, Relation, Row } from '~/core/types';
import { PagesPaginationPlaceholder } from '~/core/utils/utils';
import { NavUtils } from '~/core/utils/utils';
import { getPaginationPages } from '~/core/utils/utils';

import { IconButton } from '~/design-system/button';
import { Create } from '~/design-system/icons/create';
import { FilterTable } from '~/design-system/icons/filter-table';
import { FilterTableWithFilters } from '~/design-system/icons/filter-table-with-filters';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';
import { Spacer } from '~/design-system/spacer';
import { PageNumberContainer } from '~/design-system/table/styles';
import { NextButton, PageNumber, PreviousButton } from '~/design-system/table/table-pagination';
import { Text } from '~/design-system/text';

import { onChangeEntryFn, writeValue } from './change-entry';
import { DataBlockViewMenu } from './data-block-view-menu';
import TableBlockBulletedListItemsDnd from './table-block-bulleted-list-items-dnd';
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

  const entriesWithPosition = React.useMemo(() => {
    return entries.map(row => {
      return {
        ...row,
        position: relations?.find(relation => relation.toEntity.id === row.entityId)?.position,
      };
    });
  }, [entries, relations]);

  const onUpdateRelation = (relation: Relation, newPosition: string | null) => {
    storage.relations.update(relation, draft => {
      draft.position = newPosition ?? draft.position;
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

  const renderedEntries = React.useMemo(
    () =>
      shouldShowPlaceholder
        ? [makePlaceholderRow(placeholderEntityId, properties), ...entriesWithPosition]
        : entriesWithPosition,
    [entriesWithPosition, placeholderEntityId, properties, shouldShowPlaceholder]
  );

  const shouldAutoFocusPlaceholder = usePlaceholderAutofocus(renderedEntries);

  const onChangeEntry: onChangeEntryFn = (entityId, actionSpaceId, action) => {
    console.assert(entityId.length > 0, 'onChangeEntry: entityId must be non-empty');
    console.assert(actionSpaceId.length > 0, 'onChangeEntry: actionSpaceId must be non-empty');

    // Step 1: Handle data writes
    switch (action.type) {
      case 'SET_NAME':
        storage.entities.name.set(entityId, actionSpaceId, action.name);
        break;

      case 'SET_VALUE': {
        const existingValue = storage.values.get(
          ID.createValueId({
            entityId,
            propertyId: action.property.id,
            spaceId: actionSpaceId,
          }),
          entityId
        );

        writeValue(storage, entityId, actionSpaceId, action.property, action.value, existingValue);
        break;
      }

      case 'FIND_ENTITY':
      case 'CREATE_ENTITY':
        // No data write — handled below in collection + placeholder sections
        break;
    }

    // Step 2: Handle collection item creation
    if (source.type === 'COLLECTION') {
      const maybeHasCollectionItem = entries.find(e => e.entityId === entityId);

      if (!maybeHasCollectionItem) {
        const to =
          action.type === 'FIND_ENTITY'
            ? action.entity
            : action.type === 'CREATE_ENTITY'
              ? { id: nextEntityId, name: action.name }
              : // SET_NAME or SET_VALUE on a placeholder in a collection
                { id: entityId, name: null, space: actionSpaceId, verified: false };

        upsertCollectionItemRelation({
          relationId: ID.createEntityId(),
          collectionId: source.value,
          spaceId: actionSpaceId,
          toEntity: { id: to.id, name: to.name },
          toSpaceId: to.space,
          verified: to.verified,
        });

        setPendingEntityId(to.id);
      }
    }

    // Step 3: Handle placeholder → entity creation
    if (entityId === nextEntityId) {
      setHasPlaceholderRow(false);

      // Find means the entity already exists — don't create a new one.
      if (action.type !== 'FIND_ENTITY') {
        const maybeName = action.type === 'CREATE_ENTITY' ? action.name : undefined;

        setPendingEntityId(entityId);

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
    shouldAutoFocusPlaceholder,
  };
}

export const TableBlock = ({ spaceId }: Props) => {
  const [isFilterOpen, setIsFilterOpen] = React.useState(false);
  const isEditing = useUserIsEditing(spaceId);
  const canEdit = useCanUserEdit(spaceId);

  // Track if unfiltered data has multiple pages (to keep pagination visible when filtering)
  const [hasMultiplePagesWhenUnfiltered, setHasMultiplePagesWhenUnfiltered] = React.useState(false);

  // Use filters hook with canEdit parameter to enable temporary filters for non-editors
  const { filterState, temporaryFilters, setFilterState, setTemporaryFilters } = useFilters(canEdit);

  // Use database filter state if user can edit, otherwise use temporary filters
  const activeFilters = canEdit ? filterState : temporaryFilters;

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
    collectionRelations,
    collectionLength,
    pageSize,
  } = useDataBlock({ filterState: activeFilters });
  const { view, placeholder, shownColumnIds } = useView();
  const { source } = useSource();

  const filterSpaceIds = React.useMemo(
    () => [...new Set(activeFilters.filter(f => f.columnId === SystemIds.SPACE_FILTER).map(f => f.value))],
    [activeFilters]
  );
  const { spacesById } = useSpacesByIds(filterSpaceIds);

  // Setter that handles both editors and non-editors correctly
  // Also resets to page 1 when filters change
  const setActiveFilters = React.useCallback(
    (filters: Filter[]) => {
      if (canEdit) {
        setFilterState(filters);
      } else {
        setTemporaryFilters(filters);
      }
      // Reset to first page when filters change
      setPage(0);
    },
    [canEdit, setFilterState, setTemporaryFilters, setPage]
  );

  const { entries, onAddPlaceholder, onChangeEntry, onLinkEntry, onUpdateRelation, shouldAutoFocusPlaceholder } =
    useEntries(rows, properties, spaceId, activeFilters, relations);

  // Track if unfiltered data has multiple pages
  React.useEffect(() => {
    if (activeFilters.length === 0 && totalPages > 1) {
      setHasMultiplePagesWhenUnfiltered(true);
    }
  }, [activeFilters.length, totalPages]);

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
  const filtersWithPropertyName = React.useMemo(() => {
    return activeFilters.map(f => {
      if (f.columnId === SystemIds.SPACE_FILTER) {
        const selectedSpace = spacesById.get(f.value);

        return {
          ...f,
          columnName: 'Space',
          value: selectedSpace?.entity?.name ?? f.value,
        };
      }

      return f;
    });
  }, [activeFilters, spacesById]);

  // Show pagination if:
  // 1. There are multiple pages currently (hasPreviousPage, hasNextPage, or totalPages > 1)
  // 2. OR filters are active and unfiltered data had multiple pages
  const hasPagination =
    hasPreviousPage || hasNextPage || totalPages > 1 || (activeFilters.length > 0 && hasMultiplePagesWhenUnfiltered);

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
      onAddPlaceholder={onAddPlaceholder}
      shouldAutoFocusPlaceholder={shouldAutoFocusPlaceholder}
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
        collectionRelations={collectionRelations ?? []}
        collectionLength={collectionLength}
        pageNumber={pageNumber}
        pageSize={pageSize}
        shouldAutoFocusPlaceholder={shouldAutoFocusPlaceholder}
      />
    );
  }

  if (view === 'BULLETED_LIST' && entries.length > 0) {
    EntriesComponent = (
      <TableBlockBulletedListItemsDnd
        isEditing={isEditing}
        onChangeEntry={onChangeEntry}
        onLinkEntry={onLinkEntry}
        propertiesSchema={propertiesSchema}
        source={source}
        spaceId={spaceId}
        entries={entries}
        onUpdateRelation={onUpdateRelation}
        relations={relations ?? []}
        collectionRelations={collectionRelations ?? []}
        collectionLength={collectionLength}
        pageNumber={pageNumber}
        pageSize={pageSize}
        shouldAutoFocusPlaceholder={shouldAutoFocusPlaceholder}
      />
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
        collectionRelations={collectionRelations ?? []}
        collectionLength={collectionLength}
        pageNumber={pageNumber}
        pageSize={pageSize}
        shouldAutoFocusPlaceholder={shouldAutoFocusPlaceholder}
      />
    );
  }

  if (source.type !== 'COLLECTION' && entries.length === 0) {
    EntriesComponent = (
      <div className="block rounded-lg bg-grey-01">
        <div className="flex flex-col items-center justify-center gap-4 p-4 text-lg">
          <div>{placeholder.text}</div>
          <div>
            <img src={placeholder.image} className="h-[64px]! w-auto object-contain" alt="" />
          </div>
        </div>
      </div>
    );
  }

  const renderPlusButtonAsInline = source.type !== 'RELATIONS' && canEdit;

  const toggleFilterHandler = () => setIsFilterOpen(!isFilterOpen);

  return (
    <motion.div layout="position" transition={{ duration: 0.15 }}>
      <div className="mb-2 flex h-8 items-center justify-between">
        <TableBlockEditableTitle spaceId={spaceId} />
        <div className="flex items-center gap-5">
          <IconButton
            onClick={toggleFilterHandler}
            icon={activeFilters.length > 0 ? <FilterTableWithFilters /> : <FilterTable />}
            color="grey-04"
          />
          <DataBlockViewMenu activeView={view} isLoading={isLoading} />
          <TableBlockContextMenu />
          {renderPlusButtonAsInline && (
            <button type="button" onClick={onAddPlaceholder}>
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
              <TableBlockEditableFilters filterState={activeFilters} setFilterState={setActiveFilters} />

              {filtersWithPropertyName.map((f, index) => {
                return (
                  <TableBlockFilterPill
                    key={`${f.columnId}-${f.value}`}
                    filter={f}
                    onDelete={() => {
                      const newFilterState = produce(activeFilters, draft => {
                        draft.splice(index, 1);
                      });

                      setActiveFilters(newFilterState);
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
                (() => {
                  let skipCounter = 0;

                  return getPaginationPages(totalPages, pageNumber + 1).map(page => {
                    return page === PagesPaginationPlaceholder.skip ? (
                      <Text
                        key={`ellipsis-${skipCounter++}`}
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
                  });
                })()
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
  const PLACEHOLDER_COLUMNS = Array.from({ length: columns }, (_, i) => `column-${i}`);
  const PLACEHOLDER_ROWS = Array.from({ length: rows }, (_, i) => `row-${i}`);

  return (
    <div className="overflow-hidden rounded-lg border border-grey-02 p-0">
      <div className={cx('overflow-x-clip rounded-lg', className)}>
        <table className="relative w-full border-collapse border-hidden bg-white" cellSpacing={0} cellPadding={0}>
          <thead>
            <tr>
              {PLACEHOLDER_COLUMNS.map(columnKey => (
                <th
                  key={columnKey}
                  className="lg:min-w-none border border-b-0 border-grey-02 p-[10px] text-left"
                  style={{ minWidth: DEFAULT_PLACEHOLDER_COLUMN_WIDTH }}
                >
                  <p className={cx('h-5 w-16 rounded-sm bg-divider align-middle', shimmer && 'animate-pulse')}></p>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PLACEHOLDER_ROWS.map(rowKey => (
              <tr key={rowKey}>
                {PLACEHOLDER_COLUMNS.map(columnKey => (
                  <td
                    key={`${rowKey}-${columnKey}`}
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
