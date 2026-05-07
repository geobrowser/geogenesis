'use client';

import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import * as React from 'react';

import equal from 'fast-deep-equal';
import cx from 'classnames';
import { AnimatePresence, motion } from 'framer-motion';
import { produce } from 'immer';

import { upsertCollectionItemRelation } from '~/core/blocks/data/collection';
import { Filter, FilterMode } from '~/core/blocks/data/filters';
import { Source } from '~/core/blocks/data/source';
import { useDataBlock, useDataBlockInstance } from '~/core/blocks/data/use-data-block';
import { useFilters } from '~/core/blocks/data/use-filters';
import { useSource } from '~/core/blocks/data/use-source';
import { useCreateEntityWithFilters } from '~/core/hooks/use-create-entity-with-filters';
import { usePlaceholderAutofocus } from '~/core/hooks/use-placeholder-autofocus';
import { useSpacesByIds } from '~/core/hooks/use-spaces-by-ids';
import { useCanUserEdit, useUserIsEditing } from '~/core/hooks/use-user-is-editing';
import { ID } from '~/core/id';
import { useEditable } from '~/core/state/editable-store';
import { useMutate } from '~/core/sync/use-mutate';
import { getRelation } from '~/core/sync/use-store';
import { Cell, Relation, Row } from '~/core/types';
import { ColumnSortState } from '~/core/utils/column-sort';
import { PagesPaginationPlaceholder } from '~/core/utils/utils';
import { NavUtils } from '~/core/utils/utils';
import { getPaginationPages } from '~/core/utils/utils';

import { IconButton } from '~/design-system/button';
import { Check } from '~/design-system/icons/check';
import { Create } from '~/design-system/icons/create';
import { FilterTable } from '~/design-system/icons/filter-table';
import { FilterTableWithFilters } from '~/design-system/icons/filter-table-with-filters';
import { Fullscreen } from '~/design-system/icons/full-screen';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';
import { Spacer } from '~/design-system/spacer';
import { PageNumberContainer } from '~/design-system/table/styles';
import { NextButton, PageNumber, PreviousButton } from '~/design-system/table/table-pagination';
import { Text } from '~/design-system/text';

import { onChangeEntryFn, writeValue } from './change-entry';
import { DataBlockScopeDropdown } from './data-block-scope-dropdown';
import { TableBlockPropertiesMenu } from './table-block-properties-menu';
import { DataBlockSortMenu } from './data-block-sort-menu';
import { DataBlockViewMenu } from './data-block-view-menu';
import TableBlockBulletedListItemsDnd from './table-block-bulleted-list-items-dnd';
import { TableBlockContextMenu } from './table-block-context-menu';
import { TableBlockEditableFilters } from './table-block-editable-filters';
import { TableBlockEditableTitle } from './table-block-editable-title';
import type { TableBlockFilterPromptHandle } from './table-block-filter-creation-prompt';
import { TableBlockFilterGroupPill, groupFilters } from './table-block-filter-pill';
import TableBlockGalleryItemsDnd from './table-block-gallery-items-dnd';
import TableBlockListItemsDnd from './table-block-list-items-dnd';
import { TableBlockTable } from './table-block-table';

interface Props {
  spaceId: string;
  blockId?: string;
  /** New Query blocks: choose scope before the main block chrome is interactive. */
  querySetupPending?: boolean;
  onCompleteQuerySetup?: () => void;
  /** New Collection blocks: open the filters strip once on insert. */
  initialFiltersOpen?: boolean;
  onConsumedInitialFiltersOpen?: () => void;
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
  relations: Relation[] | undefined,
  source: Source,
  canEdit: boolean,
  collectionDataReady: boolean
) {
  const isEditing = useUserIsEditing(spaceId);
  const { setEditable } = useEditable();

  const [hasPlaceholderRow, setHasPlaceholderRow] = React.useState(false);
  const [pendingEntityId, setPendingEntityId] = React.useState<string | null>(null);
  const [placeholderFocusKey, setPlaceholderFocusKey] = React.useState(0);

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

  const collectionEmptyEditable =
    source.type === 'COLLECTION' && entries.length === 0 && canEdit && collectionDataReady;

  // Show the placeholder row if we're editing and either:
  // 1. We have hasPlaceholderRow set and no entry exists with nextEntityId
  // 2. We have a pendingEntityId that hasn't appeared in entries yet
  const shouldShowPlaceholder =
    collectionEmptyEditable ||
    (isEditing &&
      ((hasPlaceholderRow && !entries.find(e => e.entityId === nextEntityId)) ||
        (pendingEntityId && !entries.find(e => e.entityId === pendingEntityId))));

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
    setPlaceholderFocusKey(k => k + 1);
  };

  return {
    entries: renderedEntries,
    onAddPlaceholder,
    onChangeEntry,
    onLinkEntry,
    onUpdateRelation,
    shouldAutoFocusPlaceholder,
    placeholderFocusKey,
  };
}

function comparableFilterList(filters: Filter[]) {
  const projected = filters.map(f => ({
    columnId: f.columnId,
    value: f.value,
    valueType: f.valueType,
  }));
  const keyed = projected.map(p => ({ p, key: JSON.stringify(p) }));
  keyed.sort((a, b) => a.key.localeCompare(b.key));
  return keyed.map(k => k.p);
}

export const TableBlock = (props: Props) => {
  if (props.querySetupPending) {
    return <TableBlockQuerySetup {...props} />;
  }

  return <ConfiguredTableBlock {...props} />;
};

function TableBlockQuerySetup({ spaceId, onCompleteQuerySetup }: Props) {
  const { entityId, relationId } = useDataBlockInstance();
  const { setEditable } = useEditable();
  const canEdit = useCanUserEdit(spaceId);
  const { filterState, setFilterState } = useFilters(canEdit);
  const { source, setSource } = useSource({ filterState, setFilterState });

  const handleConfirmQuerySetup = React.useCallback(() => {
    setSource(source);
    setEditable(true);
    onCompleteQuerySetup?.();
  }, [onCompleteQuerySetup, setEditable, setSource, source]);

  return (
    <motion.div layout="position" transition={{ duration: 0.15 }}>
      <div className="mb-2 flex h-8 items-center justify-between" onMouseDown={e => e.stopPropagation()}>
        <TableBlockEditableTitle spaceId={spaceId} />
        <div className="pointer-events-none flex items-center gap-5 opacity-40">
          <IconButton disabled icon={<FilterTable />} color="grey-04" />
          <Link
            href={`/space/${spaceId}/${entityId}/power-tools?relationId=${relationId}`}
            className="pointer-events-none inline-flex h-6 w-6 shrink-0 items-center justify-center rounded border-none bg-transparent text-grey-04"
            aria-label="Open fullscreen"
          >
            <Fullscreen color="grey-04" />
          </Link>
          <DataBlockViewMenu activeView="TABLE" isLoading={false} />
          <TableBlockContextMenu sourceType={source.type} />
        </div>
      </div>

      <div className="flex min-h-[92px] flex-col items-center justify-center gap-2 rounded-lg bg-grey-01 px-4 py-5">
        <p className="max-w-md text-center text-metadata text-text">Where do you want to query data from?</p>
        <div className="flex w-[132px] max-w-full items-center justify-start gap-2 overflow-visible">
          <DataBlockScopeDropdown source={source} setSource={setSource} disabled={!canEdit} variant="setup" />
          <button
            type="button"
            onClick={handleConfirmQuerySetup}
            disabled={!canEdit}
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded border border-grey-02 bg-white shadow-button transition hover:border-text focus:outline-hidden focus-visible:ring-2 focus-visible:ring-grey-04 disabled:pointer-events-none disabled:opacity-50"
            aria-label="Confirm query scope"
          >
            <Check color="grey-04" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}

const ConfiguredTableBlock = ({
  spaceId,
  onCompleteQuerySetup,
  initialFiltersOpen = false,
  onConsumedInitialFiltersOpen,
}: Props) => {
  const [isFilterOpen, setIsFilterOpen] = React.useState(false);
  const filterPromptRef = React.useRef<TableBlockFilterPromptHandle>(null);
  const { entityId, relationId } = useDataBlockInstance();
  const { setEditable } = useEditable();
  const isEditing = useUserIsEditing(spaceId);
  const canEdit = useCanUserEdit(spaceId);

  // Track if unfiltered data has multiple pages (to keep pagination visible when filtering)
  const [hasMultiplePagesWhenUnfiltered, setHasMultiplePagesWhenUnfiltered] = React.useState(false);

  const {
    properties,
    rows,
    setPage,
    isLoading,
    isFetched,
    hasNextPage,
    hasPreviousPage,
    pageNumber,
    propertiesSchema,
    totalPages,
    relations,
    collectionRelations,
    collectionLength,
    pageSize,
    view,
    placeholder,
    shownColumnIds,
    source,
    setSource,
    filterState: activeFilters,
    filterMode: activeFilterMode,
    setFilterState,
    setFilterMode,
    setTemporaryFilters,
    setTemporaryFilterMode,
    sortState,
    setSortState,
    filterableProperties,
    toggleProperty,
    hideAllShownPropertyColumns,
    orderedShownColumnRelations,
    reorderShownPropertyRelations,
  } = useDataBlock({ canEdit });

  const initialFiltersOpenConsumedRef = React.useRef(false);
  React.useEffect(() => {
    if (!initialFiltersOpen || initialFiltersOpenConsumedRef.current) return;
    initialFiltersOpenConsumedRef.current = true;
    setIsFilterOpen(true);
    onConsumedInitialFiltersOpen?.();
  }, [initialFiltersOpen, onConsumedInitialFiltersOpen]);

  const setActiveFilterMode = React.useCallback(
    (mode: FilterMode) => {
      if (canEdit) setFilterMode(mode);
      else setTemporaryFilterMode(mode);
    },
    [canEdit, setFilterMode, setTemporaryFilterMode]
  );

  const filterSpaceIds = React.useMemo(
    () => [...new Set(activeFilters.filter(f => f.columnId === SystemIds.SPACE_FILTER).map(f => f.value))],
    [activeFilters]
  );
  const { spacesById } = useSpacesByIds(filterSpaceIds);

  // Setter that handles both editors and non-editors correctly
  // Also resets to page 1 when filters change
  const setActiveFilters = React.useCallback(
    (filters: Filter[]) => {
      if (equal(comparableFilterList(filters), comparableFilterList(activeFilters))) {
        return;
      }
      if (canEdit) {
        setFilterState(filters);
      } else {
        setTemporaryFilters(filters);
      }
      // Reset to first page when filters change
      setPage(0);
    },
    [canEdit, setFilterState, setTemporaryFilters, setPage, activeFilters]
  );

  const handleSortChange = React.useCallback(
    (next: ColumnSortState) => {
      setSortState(next);
      setPage(0);
    },
    [setSortState, setPage]
  );

  const {
    entries,
    onAddPlaceholder,
    onChangeEntry,
    onLinkEntry,
    onUpdateRelation,
    shouldAutoFocusPlaceholder,
    placeholderFocusKey,
  } = useEntries(rows, properties, spaceId, activeFilters, relations, source, canEdit, isFetched && !isLoading);

  const collectionTypeFilters = React.useMemo(
    () =>
      activeFilters.filter(f => f.columnId === SystemIds.TYPES_PROPERTY).map(f => ({ id: f.value, name: f.valueName })),
    [activeFilters]
  );

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

  const filterGroups = React.useMemo(() => groupFilters(filtersWithPropertyName), [filtersWithPropertyName]);

  const filterGroupsForToolbarPills = React.useMemo(
    () => filterGroups.filter(g => !ID.equals(g.columnId, SystemIds.SPACE_FILTER)),
    [filterGroups]
  );

  const orderedFilterColumnIds = React.useMemo(() => {
    const relationPropertyId = (r: Relation) => {
      const v = r.toEntity.value;
      if (v && String(v).length > 0) return String(v);
      return r.toEntity.id;
    };
    return [SystemIds.NAME_PROPERTY, ...orderedShownColumnRelations.map(relationPropertyId)];
  }, [orderedShownColumnRelations]);

  /** Visible table columns (e.g. Cover) may be missing from `filterableProperties` when graph vs schema IDs differ. */
  const mergedBlockProperties = React.useMemo(() => {
    const out = [...filterableProperties];
    for (const p of properties) {
      if (!out.some(x => ID.equals(x.id, p.id))) {
        out.push(p);
      }
    }
    return out;
  }, [filterableProperties, properties]);

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
      isLoading={isLoading}
      isFetched={isFetched}
      shownColumnIds={shownColumnIds}
      onChangeEntry={onChangeEntry}
      onLinkEntry={onLinkEntry}
      onAddPlaceholder={onAddPlaceholder}
      shouldAutoFocusPlaceholder={shouldAutoFocusPlaceholder}
      placeholderFocusKey={placeholderFocusKey}
      collectionTypeFilters={collectionTypeFilters}
      sortState={sortState}
      onSort={handleSortChange}
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
        placeholderFocusKey={placeholderFocusKey}
        collectionTypeFilters={collectionTypeFilters}
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
        placeholderFocusKey={placeholderFocusKey}
        collectionTypeFilters={collectionTypeFilters}
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
        placeholderFocusKey={placeholderFocusKey}
        collectionTypeFilters={collectionTypeFilters}
      />
    );
  }
  if (source.type !== 'COLLECTION' && entries.length === 0 && isFetched && !isLoading) {
    EntriesComponent = (
      <div className="flex min-h-[200px] flex-col justify-center rounded-lg bg-grey-01">
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

  const isQueryDataBlock = source.type !== 'COLLECTION';

  const showToolbarSort = isEditing || sortState !== null;
  const showToolbarDividerAfterScope = showToolbarSort || isEditing;

  const toggleFilterHandler = () => setIsFilterOpen(!isFilterOpen);

  return (
    <motion.div layout="position" transition={{ duration: 0.15 }}>
      {/* Potentially stop highlight/click issues? */}
      <div className="mb-2 flex h-8 items-center justify-between" onMouseDown={e => e.stopPropagation()}>
        <TableBlockEditableTitle spaceId={spaceId} />
        <div className="flex items-center gap-5">
          {isEditing && (
            <TableBlockPropertiesMenu
              sourceType={source.type}
              filterableProperties={mergedBlockProperties}
              shownColumnIds={shownColumnIds}
              orderedShownColumnRelations={orderedShownColumnRelations}
              toggleProperty={toggleProperty}
              hideAllShownPropertyColumns={hideAllShownPropertyColumns}
              reorderShownPropertyRelations={reorderShownPropertyRelations}
              disabled={!canEdit}
            />
          )}
          <IconButton
            onClick={toggleFilterHandler}
            icon={activeFilters.length > 0 ? <FilterTableWithFilters /> : <FilterTable />}
            color="grey-04"
          />
          <Link
            href={`/space/${spaceId}/${entityId}/power-tools?relationId=${relationId}`}
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded border-none bg-transparent text-grey-04 transition hover:bg-bg focus:outline-hidden focus-visible:ring-2 focus-visible:ring-grey-04"
            aria-label="Open fullscreen"
          >
            <Fullscreen color="grey-04" />
          </Link>
          <DataBlockViewMenu activeView={view} isLoading={isLoading} />
          <TableBlockContextMenu sourceType={source.type} />
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
            className={cx('overflow-hidden', isEditing ? 'border-t border-divider py-4' : 'py-2')}
            onMouseDown={e => e.stopPropagation()}
          >
            <motion.div
              initial={{ opacity: 0 }}
              exit={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.15, ease: 'easeIn', delay: 0.15 }}
              className="flex flex-col gap-2"
            >
              <div className="flex flex-wrap items-center gap-2">
                {isQueryDataBlock && (
                  <>
                    <DataBlockScopeDropdown source={source} setSource={setSource} isEditing={isEditing} />
                    {showToolbarDividerAfterScope && (
                      <span className="mx-0.5 h-5 w-px shrink-0 bg-divider" aria-hidden />
                    )}
                  </>
                )}
                {showToolbarSort && (
                  <DataBlockSortMenu
                    triggerVariant="segment"
                    isEditing={isEditing}
                    properties={mergedBlockProperties}
                    shownColumnIds={shownColumnIds}
                    sortState={sortState}
                    onSort={handleSortChange}
                  />
                )}
                {isEditing && (
                  <>
                    <span className="mx-0.5 h-5 w-px shrink-0 bg-divider" aria-hidden />
                    <TableBlockEditableFilters
                      ref={filterPromptRef}
                      filterState={activeFilters}
                      setFilterState={setActiveFilters}
                      filterSuggestionSpaceId={spaceId}
                      orderedColumnIds={orderedFilterColumnIds}
                      isEditing={isEditing}
                    />
                  </>
                )}
                {!isEditing &&
                  filterGroupsForToolbarPills.length > 0 &&
                  filterGroupsForToolbarPills.map(group => (
                    <React.Fragment key={group.columnId}>
                      <TableBlockFilterGroupPill
                        group={group}
                        mode={activeFilterMode}
                        onToggleMode={() => setActiveFilterMode(activeFilterMode === 'AND' ? 'OR' : 'AND')}
                        onDeleteValue={originalIndex => {
                          const newFilterState = produce(activeFilters, draft => {
                            draft.splice(originalIndex, 1);
                          });
                          setActiveFilters(newFilterState);
                        }}
                        onClearGroup={() => {
                          setActiveFilters(activeFilters.filter(f => f.columnId !== group.columnId));
                        }}
                        isEditing={isEditing}
                      />
                    </React.Fragment>
                  ))}
              </div>

              {isEditing && filterGroupsForToolbarPills.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  {filterGroupsForToolbarPills.map(group => (
                    <React.Fragment key={group.columnId}>
                      <TableBlockFilterGroupPill
                        group={group}
                        mode={activeFilterMode}
                        onToggleMode={() => setActiveFilterMode(activeFilterMode === 'AND' ? 'OR' : 'AND')}
                        onDeleteValue={originalIndex => {
                          const newFilterState = produce(activeFilters, draft => {
                            draft.splice(originalIndex, 1);
                          });
                          setActiveFilters(newFilterState);
                        }}
                        onClearGroup={() => {
                          setActiveFilters(activeFilters.filter(f => f.columnId !== group.columnId));
                        }}
                        onAddSimilar={anchorEl => {
                          requestAnimationFrame(() => {
                            requestAnimationFrame(() => {
                              filterPromptRef.current?.openWithColumn(group.columnId, anchorEl);
                            });
                          });
                        }}
                        isEditing={isEditing}
                      />
                    </React.Fragment>
                  ))}
                </div>
              )}
            </motion.div>
          </motion.div>
        </AnimatePresence>
      )}

      <motion.div layout="position" transition={{ duration: 0.15 }}>
        {isLoading || !isFetched ? (
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
