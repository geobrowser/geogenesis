'use client';

import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import * as React from 'react';

import cx from 'classnames';
import equal from 'fast-deep-equal';
import { AnimatePresence, motion } from 'framer-motion';
import { produce } from 'immer';

import { type RowPage, flattenRowPages, upsertRowPage } from '~/core/blocks/data/accumulate-row-pages';
import { upsertCollectionItemRelation } from '~/core/blocks/data/collection';
import { Filter, FilterMode, ModesByColumn } from '~/core/blocks/data/filters';
import {
  buildAccumulationResetKey,
  resolveInfiniteScrollDisplay,
  viewRendersAllEntries,
} from '~/core/blocks/data/infinite-scroll-display';
import { columnPropertyIdFromRelation } from '~/core/blocks/data/shown-column-relations';
import { Source } from '~/core/blocks/data/source';
import { useBlockInfiniteScroll } from '~/core/blocks/data/use-block-infinite-scroll';
import { useDataBlock, useDataBlockInstance } from '~/core/blocks/data/use-data-block';
import { useFilters } from '~/core/blocks/data/use-filters';
import {
  isEntityVisibleInBlock,
  registerEntityBlockOwner,
  useOptimisticRows,
} from '~/core/blocks/data/use-optimistic-rows';
import { useSource } from '~/core/blocks/data/use-source';
import { useBlockMainMedia } from '~/core/hooks/use-block-main-media';
import { NO_BLOCK_MEDIA_DIMENSIONS, blockMediaFrame } from '~/core/hooks/use-block-media-dimensions';
import { useCreatableSpaceIds } from '~/core/hooks/use-creatable-space-ids';
import { useCreateEntityWithFilters } from '~/core/hooks/use-create-entity-with-filters';
import { useInfiniteScrollSentinel } from '~/core/hooks/use-infinite-scroll-sentinel';
import { usePlaceholderAutofocus } from '~/core/hooks/use-placeholder-autofocus';
import { useRelationTargetTypeIds } from '~/core/hooks/use-relation-target-type-ids';
import { useSpacesByIds } from '~/core/hooks/use-spaces-by-ids';
import { useCanUserEdit, useUserIsEditing } from '~/core/hooks/use-user-is-editing';
import { ID } from '~/core/id';
import { useEditable } from '~/core/state/editable-store';
import { useMutate } from '~/core/sync/use-mutate';
import { getRelation } from '~/core/sync/use-store';
import { store } from '~/core/sync/use-sync-engine';
import { Cell, Relation, Row } from '~/core/types';
import { ColumnSortState } from '~/core/utils/column-sort';
import { PagesPaginationPlaceholder } from '~/core/utils/utils';
import { NavUtils } from '~/core/utils/utils';
import { getPaginationPages } from '~/core/utils/utils';

import { IconButton } from '~/design-system/button';
import { Check } from '~/design-system/icons/check';
import { ChevronDownSmall } from '~/design-system/icons/chevron-down-small';
import { Create } from '~/design-system/icons/create';
import { FilterTable } from '~/design-system/icons/filter-table';
import { FilterTableWithFilters } from '~/design-system/icons/filter-table-with-filters';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';
import { Spacer } from '~/design-system/spacer';
import { PageNumberContainer } from '~/design-system/table/styles';
import { NextButton, PageNumber, PreviousButton } from '~/design-system/table/table-pagination';
import { Text } from '~/design-system/text';

import {
  BlockLinkIngestionChip,
  BlockLinkIngestionPanel,
  BlockLinkIngestionProvider,
} from './block-link-ingestion-tool';
import { onChangeEntryFn, writeValue } from './change-entry';
import { DataBlockCreateEntitySpaceDropdown } from './data-block-create-entity-space-dropdown';
import { shouldShowCreateEntityAction } from './data-block-create-entity-visibility';
import { DataBlockExpandControl } from './data-block-expand-control';
import {
  filterPanelOpenStateForActions,
  shouldShowFilterAction,
  shouldShowFullscreenAction,
} from './data-block-header-action-visibility';
import { DataBlockLoadingPlaceholder } from './data-block-loading-placeholder';
import { shouldShowDataBlockLoadingPlaceholder } from './data-block-loading-visibility';
import { DataBlockScopeDropdown } from './data-block-scope-dropdown';
import { DataBlockSortMenu } from './data-block-sort-menu';
import { DataBlockViewMenu } from './data-block-view-menu';
import { type QuerySetupTypePick, QuerySetupTypesSelectEntityPopover } from './query-setup-types-select-entity-popover';
import TableBlockBulletedListItemsDnd from './table-block-bulleted-list-items-dnd';
import { TableBlockContextMenu } from './table-block-context-menu';
import { TableBlockEditableFilters } from './table-block-editable-filters';
import { TableBlockEditableTitle } from './table-block-editable-title';
import TableBlockExploreItemsDnd from './table-block-explore-items-dnd';
import type { TableBlockFilterPromptHandle } from './table-block-filter-creation-prompt';
import { TableBlockFilterGroupPill, groupFilters } from './table-block-filter-pill';
import TableBlockGalleryItemsDnd from './table-block-gallery-items-dnd';
import TableBlockListItemsDnd from './table-block-list-items-dnd';
import { TableBlockLoadingPlaceholder } from './table-block-loading-placeholder';
import TableBlockPillItemsDnd from './table-block-pill-items-dnd';
import { TableBlockPropertiesMenu } from './table-block-properties-menu';
import { TableBlockTable } from './table-block-table';

export { TableBlockLoadingPlaceholder } from './table-block-loading-placeholder';

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

function stableCellPropertyId(entityId: string, slotId: string): string {
  return `${entityId}::${slotId}`;
}

function makeRow(
  entityId: string,
  properties: { id: string; name: string | null }[],
  options: { placeholder: boolean; targetSpaceId?: string }
): Row {
  const columns: Record<string, Cell> = {};

  columns[SystemIds.NAME_PROPERTY] = {
    slotId: SystemIds.NAME_PROPERTY,
    propertyId: stableCellPropertyId(entityId, SystemIds.NAME_PROPERTY),
    name: null,
    ...(options.targetSpaceId ? { space: options.targetSpaceId } : {}),
  };

  for (const p of properties) {
    if (!columns[p.id]) {
      columns[p.id] = {
        slotId: p.id,
        propertyId: stableCellPropertyId(entityId, p.id),
        name: null,
      };
    }
  }

  return {
    placeholder: options.placeholder,
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
  blockEntityId: string,
  entries: Row[],
  properties: { id: string; name: string | null }[],
  spaceId: string,
  filterState: Filter[],
  relations: Relation[] | undefined,
  source: Source,
  canEdit: boolean
) {
  const isEditing = useUserIsEditing(spaceId);

  const [hasPlaceholderRow, setHasPlaceholderRow] = React.useState(false);
  const [placeholderFocusKey, setPlaceholderFocusKey] = React.useState(0);
  const focusRowEntityIdRef = React.useRef<string | null>(null);

  const {
    pendingNotInQuery,
    getTargetSpace,
    setTargetSpace,
    rememberDefaultPlaceholderSpace,
    getDefaultPlaceholderSpace,
    markPending,
    markCommitted,
    isCommitted,
  } = useOptimisticRows(blockEntityId, entries);

  const { storage } = useMutate();
  const { peekNextEntityId, onClick: createEntityWithTypes, rotateNextEntityId } = useCreateEntityWithFilters(spaceId);
  const reservedEntityId = peekNextEntityId();

  const entriesWithPosition = React.useMemo(() => {
    return entries
      .filter(row => isEntityVisibleInBlock(row.entityId, blockEntityId))
      .map(row => {
        return {
          ...row,
          position: relations?.find(relation => relation.toEntity.id === row.entityId)?.position,
        };
      });
  }, [blockEntityId, entries, relations]);

  const onUpdateRelation = (relation: Relation, newPosition: string | null) => {
    storage.relations.update(relation, draft => {
      draft.position = newPosition ?? draft.position;
    });
  };

  const showActivePlaceholder = hasPlaceholderRow && !entries.some(e => e.entityId === reservedEntityId);

  const activePlaceholderSpaceId = getTargetSpace(reservedEntityId) ?? getDefaultPlaceholderSpace() ?? spaceId;

  const hasPlaceholderIntent = hasPlaceholderRow || pendingNotInQuery.length > 0;

  const renderedEntries = React.useMemo(() => {
    const activePlaceholderRow =
      isEditing && showActivePlaceholder
        ? makeRow(reservedEntityId, properties, { placeholder: true, targetSpaceId: activePlaceholderSpaceId })
        : null;

    const optimisticRows = pendingNotInQuery.map(p =>
      makeRow(p.entityId, properties, { placeholder: false, targetSpaceId: p.spaceId })
    );

    return [...(activePlaceholderRow ? [activePlaceholderRow] : []), ...optimisticRows, ...entriesWithPosition];
  }, [
    activePlaceholderSpaceId,
    entriesWithPosition,
    isEditing,
    reservedEntityId,
    pendingNotInQuery,
    properties,
    showActivePlaceholder,
  ]);

  const renderedEntriesKey = React.useMemo(
    () => renderedEntries.map(e => `${e.entityId}:${e.placeholder ? 1 : 0}`).join('|'),
    [renderedEntries]
  );

  const renderedEntriesRef = React.useRef(renderedEntries);
  renderedEntriesRef.current = renderedEntries;

  const shouldAutoFocusPlaceholder = usePlaceholderAutofocus(
    hasPlaceholderIntent ? renderedEntriesKey : '',
    renderedEntries
  );

  React.useEffect(() => {
    const focusEntityId = focusRowEntityIdRef.current;
    if (focusEntityId == null) return;
    if (!renderedEntriesRef.current.some(e => e.entityId === focusEntityId)) return;
    focusRowEntityIdRef.current = null;
  }, [renderedEntriesKey, placeholderFocusKey]);

  const onChangeEntry: onChangeEntryFn = (entityId, actionSpaceId, action) => {
    console.assert(entityId.length > 0, 'onChangeEntry: entityId must be non-empty');
    console.assert(actionSpaceId.length > 0, 'onChangeEntry: actionSpaceId must be non-empty');

    const effectiveSpaceId = getTargetSpace(entityId) ?? actionSpaceId;

    // Step 1: Handle data writes
    switch (action.type) {
      case 'SET_NAME':
        storage.entities.name.set(entityId, effectiveSpaceId, action.name);
        if (entityId === reservedEntityId) {
          registerEntityBlockOwner(entityId, blockEntityId);
        }
        break;

      case 'SET_VALUE': {
        const existingValue = storage.values.get(
          ID.createValueId({
            entityId,
            propertyId: action.property.id,
            spaceId: effectiveSpaceId,
          }),
          entityId
        );

        writeValue(storage, entityId, effectiveSpaceId, action.property, action.value, existingValue);
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
              ? { id: entityId, name: action.name }
              : // SET_NAME or SET_VALUE on a placeholder in a collection
                { id: entityId, name: null, space: effectiveSpaceId, verified: false };

        upsertCollectionItemRelation({
          relationId: ID.createEntityId(),
          collectionId: source.value,
          spaceId: actionSpaceId,
          toEntity: { id: to.id, name: to.name },
          toSpaceId: to.space,
          verified: to.verified,
        });

        const pendingSpaceId = to.space ?? effectiveSpaceId;
        markPending(to.id, pendingSpaceId, {
          registerBlockOwner: action.type !== 'FIND_ENTITY',
        });
      }
    }

    if (entityId === reservedEntityId) {
      setHasPlaceholderRow(false);

      // Find means the entity already exists — don't create a new one.
      if (action.type !== 'FIND_ENTITY' && !isCommitted(entityId)) {
        const commitSpaceId = getTargetSpace(entityId) ?? actionSpaceId;
        markPending(entityId, commitSpaceId);

        const maybeName = action.type === 'CREATE_ENTITY' ? action.name : undefined;
        const existing = store.getEntity(entityId, { spaceId: actionSpaceId });
        const alreadyMaterialized =
          (existing?.values.some(v => !v.isDeleted) ?? false) || (existing?.relations.some(r => !r.isDeleted) ?? false);

        markCommitted(entityId);

        if (!alreadyMaterialized) {
          createEntityWithTypes({
            name: maybeName,
            filters: filterState,
            spaceId: commitSpaceId,
          });
        } else if (maybeName) {
          storage.entities.name.set(entityId, commitSpaceId, maybeName);
        }
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

  const onAddPlaceholder = (targetSpaceId?: string | null) => {
    const isQueryBlock = source.type === 'SPACES' || source.type === 'GEO';

    // Query blocks: picking a space creates and keeps all
    if (isQueryBlock && targetSpaceId !== undefined && targetSpaceId !== null) {
      if (hasPlaceholderRow && !isCommitted(reservedEntityId) && !entries.some(e => e.entityId === reservedEntityId)) {
        const priorSpaceId = getTargetSpace(reservedEntityId) ?? getDefaultPlaceholderSpace() ?? spaceId;
        const priorId = createEntityWithTypes({
          filters: filterState,
          spaceId: priorSpaceId,
        });
        markCommitted(priorId);
        markPending(priorId, priorSpaceId);
        registerEntityBlockOwner(priorId, blockEntityId);
      } else if (entries.some(e => e.entityId === reservedEntityId)) {
        rotateNextEntityId();
      }

      const idToCreate = createEntityWithTypes({
        filters: filterState,
        spaceId: targetSpaceId,
      });

      registerEntityBlockOwner(idToCreate, blockEntityId);
      markCommitted(idToCreate);
      markPending(idToCreate, targetSpaceId);
      rememberDefaultPlaceholderSpace(targetSpaceId);
      setHasPlaceholderRow(false);
      focusRowEntityIdRef.current = idToCreate;
      setPlaceholderFocusKey(k => k + 1);
      return;
    }

    if (entries.some(e => e.entityId === reservedEntityId)) {
      rotateNextEntityId();
    }

    const resolvedPlaceholderSpace = targetSpaceId ?? getDefaultPlaceholderSpace() ?? spaceId;
    setTargetSpace(reservedEntityId, resolvedPlaceholderSpace);
    if (targetSpaceId != null) {
      rememberDefaultPlaceholderSpace(targetSpaceId);
    }
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
    focusRowEntityIdRef,
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

  if (!props.blockId) {
    return (
      <motion.div layout="position" transition={{ duration: 0.15 }}>
        <TableBlockLoadingPlaceholder />
      </motion.div>
    );
  }

  return <ConfiguredTableBlock {...props} />;
};

function TableBlockQuerySetup({ spaceId, onCompleteQuerySetup }: Props) {
  const { entityId, relationId } = useDataBlockInstance();
  const { setEditable } = useEditable();
  const canEdit = useCanUserEdit(spaceId);
  const { filterState, setFilterState } = useFilters(canEdit);
  const { source, setSource } = useSource({ filterState, setFilterState });
  const [setupTypePicks, setSetupTypePicks] = React.useState<QuerySetupTypePick[]>([]);

  const { relationValueTypes: allowedTargetTypes, waitForFilterTypes } = useRelationTargetTypeIds({
    propertyId: SystemIds.TYPES_PROPERTY,
    spaceId,
    relationValueTypes: undefined,
  });
  const canPickTypes = !waitForFilterTypes && Boolean(allowedTargetTypes?.length);
  const selectedTypeCount = setupTypePicks.length;
  const typeTriggerLabel =
    selectedTypeCount > 0
      ? `${selectedTypeCount} ${selectedTypeCount === 1 ? 'type' : 'types'} selected`
      : 'Select types · Optional';

  const handleConfirmQuerySetup = React.useCallback(() => {
    const withoutTypes = filterState.filter(f => f.columnId !== SystemIds.TYPES_PROPERTY);
    const typeFilters: Filter[] = setupTypePicks.map(t => ({
      columnId: SystemIds.TYPES_PROPERTY,
      columnName: 'Types',
      valueType: 'RELATION',
      value: t.id,
      valueName: [t.name, t.spaceName].filter((x): x is string => Boolean(x)).join(' · ') || t.name,
      ...(t.spaceId ? { typesRelationSpaceId: t.spaceId } : {}),
    }));
    const mergedFilters = [...withoutTypes, ...typeFilters];
    setSource(source, { filterStateOverride: mergedFilters });
    setEditable(true);
    onCompleteQuerySetup?.();
  }, [filterState, onCompleteQuerySetup, setEditable, setSource, setupTypePicks, source]);

  return (
    <motion.div layout="position" transition={{ duration: 0.15 }}>
      <div className="mb-2 flex h-8 items-center justify-between" onMouseDown={e => e.stopPropagation()}>
        <TableBlockEditableTitle spaceId={spaceId} />
        <div className="pointer-events-none flex items-center gap-5 opacity-40">
          <IconButton disabled icon={<FilterTable />} color="grey-04" />
          <DataBlockExpandControl
            spaceId={spaceId}
            blockEntityId={entityId}
            isEditing={false}
            disabled
            fullscreenHref={`/space/${spaceId}/${entityId}/power-tools?relationId=${relationId}`}
          />
          <DataBlockViewMenu activeView="TABLE" isLoading={false} />
          <TableBlockContextMenu sourceType={source.type} />
        </div>
      </div>

      <div
        className="flex min-h-[92px] flex-col items-center justify-center gap-2 rounded-lg bg-grey-01 px-4 py-5"
        onMouseDown={e => e.stopPropagation()}
        onPointerDown={e => e.stopPropagation()}
      >
        <p className="max-w-md text-center text-metadata text-text">Where do you want to query data from?</p>
        <div
          className="flex max-w-full flex-wrap items-center justify-center gap-1.5 overflow-visible"
          onMouseDown={e => e.stopPropagation()}
          onPointerDown={e => e.stopPropagation()}
        >
          <DataBlockScopeDropdown source={source} setSource={setSource} disabled={!canEdit} variant="setup" />
          <QuerySetupTypesSelectEntityPopover
            disabled={!canEdit || !canPickTypes}
            selectedTypes={setupTypePicks}
            onChangeSelectedTypes={setSetupTypePicks}
            allowedTargetTypes={allowedTargetTypes}
            trigger={
              <button
                type="button"
                onMouseDown={e => e.stopPropagation()}
                onPointerDown={e => e.stopPropagation()}
                className="inline-flex h-6 max-w-[min(100%,260px)] min-w-0 shrink-0 items-center justify-start gap-1.5 rounded border border-grey-02 bg-white px-1.5 text-metadata leading-none text-text shadow-button transition hover:border-text hover:bg-bg focus:outline-hidden disabled:pointer-events-none disabled:opacity-50"
                aria-label={
                  selectedTypeCount > 0
                    ? `${selectedTypeCount} ${selectedTypeCount === 1 ? 'type' : 'types'} selected`
                    : 'Select types (optional)'
                }
              >
                <span className="min-w-0 flex-1 truncate text-left">{typeTriggerLabel}</span>
                <span className="inline-flex shrink-0">
                  <ChevronDownSmall color="grey-04" />
                </span>
              </button>
            }
          />
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
        <div className="flex w-full max-w-lg flex-col items-center gap-2">
          {waitForFilterTypes ? (
            <p className="text-center text-footnote text-grey-04">Loading types…</p>
          ) : !allowedTargetTypes?.length ? (
            <p className="text-center text-footnote text-grey-04">
              Type list unavailable; you can add type filters later.
            </p>
          ) : null}
        </div>
      </div>
    </motion.div>
  );
}

const ConfiguredTableBlock = ({
  spaceId,
  blockId,
  onCompleteQuerySetup,
  initialFiltersOpen = false,
  onConsumedInitialFiltersOpen,
}: Props) => {
  const [isFilterOpen, setIsFilterOpen] = React.useState(false);
  const filterPromptRef = React.useRef<TableBlockFilterPromptHandle>(null);
  const { entityId, relationId } = useDataBlockInstance();
  const blockEntityId = blockId ?? entityId;
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
    isPlaceholderData,
    error: dataBlockError,
    refetch: refetchDataBlock,
    whereKey,
    sortKey,
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
    modesByColumn: activeModesByColumn,
    setFilterState,
    setGroupMode,
    setTemporaryFilters,
    setTemporaryGroupMode,
    sortState,
    setSortState,
    filterableProperties,
    toggleProperty,
    hideAllShownPropertyColumns,
    orderedShownColumnRelations,
    reorderShownPropertyRelations,
  } = useDataBlock({ canEdit });

  const { mainMedia, isFramePending } = useBlockMainMedia(shownColumnIds, propertiesSchema, {
    readsDimensions: view === 'GALLERY',
  });
  const mediaFrame = blockMediaFrame(mainMedia?.dimensions ?? NO_BLOCK_MEDIA_DIMENSIONS);
  const showLoadingPlaceholder = shouldShowDataBlockLoadingPlaceholder({ isLoading, isFetched, view, isFramePending });

  const initialFiltersOpenConsumedRef = React.useRef(false);
  React.useEffect(() => {
    if (!initialFiltersOpen || initialFiltersOpenConsumedRef.current) return;
    initialFiltersOpenConsumedRef.current = true;
    setIsFilterOpen(true);
    onConsumedInitialFiltersOpen?.();
  }, [initialFiltersOpen, onConsumedInitialFiltersOpen]);

  const setActiveGroupMode = React.useCallback(
    (columnId: string, mode: FilterMode) => {
      if (canEdit) setGroupMode(columnId, mode);
      else setTemporaryGroupMode(columnId, mode);
    },
    [canEdit, setGroupMode, setTemporaryGroupMode]
  );

  const toggleActiveGroupMode = React.useCallback(
    (columnId: string) => {
      const mode = activeModesByColumn[columnId] ?? 'AND';
      setActiveGroupMode(columnId, mode === 'AND' ? 'OR' : 'AND');
    },
    [activeModesByColumn, setActiveGroupMode]
  );

  // What the filter popover's drafts would apply, mirrored out so the chips can show an
  // edit the moment it is made. Deliberately kept out of `activeFilters`: the query, the
  // page reset and the persisted block all still wait for the popover to be dismissed.
  const [previewFilterState, setPreviewFilterState] = React.useState<Filter[] | null>(null);
  const filtersForChips = previewFilterState ?? activeFilters;
  // While the chips are mirroring the popover's drafts they are a readout, not a second
  // editing surface. Editing them here could only guess at what the popover means to do
  // with the same column, and the popover would overwrite the guess on dismiss.
  const canEditChips = isEditing && previewFilterState === null;

  const filterSpaceIds = React.useMemo(
    () => [...new Set(filtersForChips.filter(f => f.columnId === SystemIds.SPACE_FILTER).map(f => f.value))],
    [filtersForChips]
  );
  const { spacesById } = useSpacesByIds(filterSpaceIds);

  // Setter that handles both editors and non-editors correctly
  // Also resets to page 1 when filters change
  const setActiveFilters = React.useCallback(
    (filters: Filter[], modeOverrides?: ModesByColumn) => {
      if (
        equal(comparableFilterList(filters), comparableFilterList(activeFilters)) &&
        (!modeOverrides || Object.keys(modeOverrides).length === 0)
      ) {
        return;
      }
      if (canEdit) {
        setFilterState(filters, modeOverrides);
      } else {
        setTemporaryFilters(filters, modeOverrides);
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
    focusRowEntityIdRef,
  } = useEntries(blockEntityId, rows, properties, spaceId, activeFilters, relations, source, canEdit);

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
    return filtersForChips.map(f => {
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
  }, [filtersForChips, spacesById]);

  const filterGroups = React.useMemo(() => groupFilters(filtersWithPropertyName), [filtersWithPropertyName]);

  const filterGroupsForToolbarPills = React.useMemo(
    () => filterGroups.filter(g => !ID.equals(g.columnId, SystemIds.SPACE_FILTER)),
    [filterGroups]
  );

  const orderedFilterColumnIds = React.useMemo(() => {
    return [SystemIds.NAME_PROPERTY, ...orderedShownColumnRelations.map(columnPropertyIdFromRelation)];
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

  // Infinite scroll is opt-in via the Infinite scroll BOOLEAN on the Blocks
  // relation entity (same entity that holds View and Properties).
  //
  // It only applies to views that render every entry handed to them. `TableBlockTable` — the
  // TABLE view and the fallback for any view without its own renderer — paginates internally at
  // a fixed 9 rows with no pager of its own, so accumulating past that is invisible: the list
  // never grows, the sentinel below it never stops intersecting, and it walks the whole source
  // one page at a time while the user sees nine rows. Allowlist rather than deny TABLE, so a
  // view added later has to opt in instead of silently inheriting that.
  const infiniteScrollProperty = useBlockInfiniteScroll();
  const isInfiniteScroll = infiniteScrollProperty && viewRendersAllEntries(view) && !isEditing;

  const [rowPages, setRowPages] = React.useState<RowPage[]>([]);

  // A failed page never lands in `rowPages`, so without this the block cannot tell "no results"
  // from "the fetch never came back" — see `resolveInfiniteScrollDisplay`. `error` is source-scoped
  // by `useDataBlock`, so this only ever reflects this block's own query.
  const hasInfiniteScrollError = isInfiniteScroll && dataBlockError != null;

  const accumulationResetKey = React.useMemo(
    () =>
      buildAccumulationResetKey({
        isInfiniteScroll,
        pageSize,
        sourceKey: JSON.stringify(
          source.type === 'SPACES' ? source.value.slice().sort() : 'value' in source ? source.value : 'GEO'
        ),
        whereKey,
        sortKey,
      }),
    [isInfiniteScroll, pageSize, source, whereKey, sortKey]
  );

  // `setPage(0)` only lands on the next render, so between the reset and that render `pageNumber`
  // still points at the page the user was on. The accumulation effect below runs in this same
  // commit, so without this flag it would seed the freshly cleared `rowPages` with the *old*
  // page's rows under the old index — leaving the list opening at page 3, or stranding those rows
  // at the end forever if the new result set is shorter.
  const awaitingPageResetRef = React.useRef(false);

  React.useEffect(() => {
    setRowPages(prev => (prev.length === 0 ? prev : []));
    if (!infiniteScrollProperty) return;
    awaitingPageResetRef.current = true;
    setPage(0);
  }, [accumulationResetKey, infiniteScrollProperty, setPage]);

  // Depending on the `entries` array reference (rather than a content signature)
  // is safe here: `upsertRowPage` returns the previous `pages` reference when the
  // page's entity-id signature is unchanged, so `setRowPages` bails and identity-only
  // changes to `entries` can't cause a render loop.
  React.useEffect(() => {
    if (!isInfiniteScroll) return;
    if (!isFetched || isPlaceholderData) return;
    // A failed fetch still settles as `isFetched`, so committing here would bank whatever the
    // local-store fallback returned as if it were the page, and never retry it.
    if (hasInfiniteScrollError) return;
    if (awaitingPageResetRef.current) {
      // Nothing to wait for once we are actually on page 0 — that is the reset having landed
      // (or it never moved us, because we were already there).
      if (pageNumber !== 0) return;
      awaitingPageResetRef.current = false;
    }
    const realRows = entries.filter(row => !row.placeholder);
    setRowPages(prev => upsertRowPage(prev, pageNumber, realRows));
  }, [isInfiniteScroll, isFetched, isPlaceholderData, hasInfiniteScrollError, pageNumber, entries]);

  const accumulatedEntries = React.useMemo(() => flattenRowPages(rowPages), [rowPages]);

  const hasCurrentPage = React.useMemo(() => rowPages.some(p => p.page === pageNumber), [rowPages, pageNumber]);
  const isFetchingNextPage = isInfiniteScroll && pageNumber > 0 && !hasCurrentPage;

  const fetchNextInfinitePage = React.useCallback(() => {
    if (!hasNextPage || !hasCurrentPage || isPlaceholderData) return;
    setPage('next');
  }, [hasNextPage, hasCurrentPage, isPlaceholderData, setPage]);

  const infiniteScrollSentinelRef = useInfiniteScrollSentinel({
    hasNextPage: isInfiniteScroll && hasNextPage && !hasInfiniteScrollError,
    isFetchingNextPage,
    fetchNextPage: fetchNextInfinitePage,
    rootMargin: '1000px',
  });

  const displayEntries = !isInfiniteScroll
    ? entries
    : accumulatedEntries.length > 0
      ? accumulatedEntries
      : entries.filter(row => !row.placeholder);

  const infiniteScrollDisplay = resolveInfiniteScrollDisplay({
    isInfiniteScroll,
    hasRows: displayEntries.length > 0,
    hasNextPage,
    hasError: hasInfiniteScrollError,
    isFetchingNextPage,
    isFetched,
    isLoading,
    isCollection: source.type === 'COLLECTION',
  });

  // Show pagination if:
  // 1. There are multiple pages currently (hasPreviousPage, hasNextPage, or totalPages > 1)
  // 2. OR filters are active and unfiltered data had multiple pages
  // Never in infinite-scroll browse mode. Restoring it on error does not help: the rendered list
  // is the accumulated pages regardless of page number, so the pager cannot change what is on
  // screen, and paging switches query keys which clears the error and re-arms the sentinel.
  const hasPagination =
    !isInfiniteScroll &&
    (hasPreviousPage || hasNextPage || totalPages > 1 || (activeFilters.length > 0 && hasMultiplePagesWhenUnfiltered));

  let EntriesComponent = (
    <TableBlockTable
      source={source}
      space={spaceId}
      properties={properties}
      propertiesSchema={propertiesSchema}
      rows={displayEntries}
      placeholder={placeholder}
      isLoading={isLoading}
      isFetched={isFetched}
      shownColumnIds={shownColumnIds}
      onChangeEntry={onChangeEntry}
      onLinkEntry={onLinkEntry}
      onAddPlaceholder={onAddPlaceholder}
      shouldAutoFocusPlaceholder={shouldAutoFocusPlaceholder}
      placeholderFocusKey={placeholderFocusKey}
      focusRowEntityIdRef={focusRowEntityIdRef}
      collectionTypeFilters={collectionTypeFilters}
      sortState={sortState}
      onSort={handleSortChange}
    />
  );

  if (view === 'LIST' && displayEntries.length > 0) {
    EntriesComponent = (
      <TableBlockListItemsDnd
        isEditing={isEditing}
        onChangeEntry={onChangeEntry}
        onLinkEntry={onLinkEntry}
        propertiesSchema={propertiesSchema}
        mainMedia={mainMedia}
        source={source}
        spaceId={spaceId}
        entries={displayEntries}
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

  if (view === 'BULLETED_LIST' && displayEntries.length > 0) {
    EntriesComponent = (
      <TableBlockBulletedListItemsDnd
        isEditing={isEditing}
        onChangeEntry={onChangeEntry}
        onLinkEntry={onLinkEntry}
        propertiesSchema={propertiesSchema}
        source={source}
        spaceId={spaceId}
        entries={displayEntries}
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

  if (view === 'GALLERY' && displayEntries.length > 0) {
    EntriesComponent = (
      <TableBlockGalleryItemsDnd
        isEditing={isEditing}
        onChangeEntry={onChangeEntry}
        onLinkEntry={onLinkEntry}
        propertiesSchema={propertiesSchema}
        mainMedia={mainMedia}
        source={source}
        spaceId={spaceId}
        entries={displayEntries}
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

  if (view === 'PILL' && displayEntries.length > 0) {
    EntriesComponent = (
      <TableBlockPillItemsDnd
        isEditing={isEditing}
        onChangeEntry={onChangeEntry}
        onLinkEntry={onLinkEntry}
        propertiesSchema={propertiesSchema}
        source={source}
        spaceId={spaceId}
        entries={displayEntries}
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

  if (view === 'EXPLORE' && displayEntries.length > 0) {
    EntriesComponent = (
      <TableBlockExploreItemsDnd
        isEditing={isEditing}
        onChangeEntry={onChangeEntry}
        onLinkEntry={onLinkEntry}
        propertiesSchema={propertiesSchema}
        source={source}
        spaceId={spaceId}
        entries={displayEntries}
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

  if (infiniteScrollDisplay.showSentinel || infiniteScrollDisplay.showSkeleton) {
    EntriesComponent = (
      <>
        {displayEntries.length > 0 && EntriesComponent}
        {infiniteScrollDisplay.showSkeleton && (
          <div className="flex flex-col gap-3 py-4" aria-hidden>
            <div className="h-4 w-1/3 animate-pulse rounded-sm bg-divider" />
            <div className="h-4 w-2/3 animate-pulse rounded-sm bg-divider" />
          </div>
        )}
        {infiniteScrollDisplay.showSentinel && (
          <div ref={infiniteScrollSentinelRef} aria-hidden className="h-4 w-full" />
        )}
      </>
    );
  }

  // With no rows to show, every view-specific branch above is skipped (each requires
  // `displayEntries.length > 0`) and `EntriesComponent` is still the default `TableBlockTable` —
  // which renders its own "nothing here" placeholder on `isEmpty && isFetched && !isLoading`. That
  // would put the exact message `showEmptyState: false` exists to suppress directly above the
  // retry, and in the wrong renderer for a LIST or GALLERY block. Show only the retry.
  if (infiniteScrollDisplay.showRetry && displayEntries.length === 0) {
    EntriesComponent = <></>;
  }

  // In infinite-scroll mode the current page's `entries` can momentarily be
  // empty (e.g. a trailing empty page) while accumulated rows are still shown —
  // `showEmptyState` gates on the rows actually being displayed so the placeholder can't
  // clobber a populated list, and stays false on a failed fetch so a timeout isn't
  // presented to the user as "nothing matched".
  if (infiniteScrollDisplay.showEmptyState) {
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

  const isQueryDataBlock = source.type !== 'COLLECTION';

  // Query data blocks let the user pick which space the new entity lives in:
  // - SPACES with >1 spaces: dropdown of those spaces.
  // - GEO: dropdown with search across all spaces.
  // For a single-space SPACES query the dropdown is skipped (auto-pick that one).
  const usesCreateEntitySpaceDropdown = (source.type === 'SPACES' && source.value.length > 1) || source.type === 'GEO';

  const singleSpaceTarget = source.type === 'SPACES' && source.value.length === 1 ? source.value[0] : null;
  const { canCreateInSpace: canCreateInTargetSpace, isResolved: singleSpaceAccessResolved } = useCreatableSpaceIds(
    singleSpaceTarget ? [singleSpaceTarget] : [],
    Boolean(singleSpaceTarget)
  );
  const canCreateInSingleSpace = singleSpaceTarget ? canCreateInTargetSpace(singleSpaceTarget) : true;
  const showCreateEntityPlus = shouldShowCreateEntityAction({
    isEditing,
    canEdit,
    sourceType: source.type,
    singleSpaceTarget,
    singleSpaceAccessResolved,
    canCreateInSingleSpace,
  });

  const onAddPlaceholderClick = React.useCallback(() => {
    onAddPlaceholder(singleSpaceTarget ?? null);
  }, [onAddPlaceholder, singleSpaceTarget]);

  const showToolbarSort = isEditing || sortState !== null;
  const showToolbarDividerAfterScope = showToolbarSort || isEditing;
  const showFilterAction = shouldShowFilterAction(isEditing);
  const showFullscreenAction = shouldShowFullscreenAction(view, source.type, isEditing);

  React.useEffect(() => {
    setIsFilterOpen(current => filterPanelOpenStateForActions(current, showFilterAction));
  }, [showFilterAction]);

  const toggleFilterHandler = () => setIsFilterOpen(current => !current);

  return (
    <BlockLinkIngestionProvider spaceId={spaceId}>
      <motion.div layout="position" transition={{ duration: 0.15 }}>
        {/* Potentially stop highlight/click issues? */}
        <div className="mb-2 flex h-8 items-center justify-between" onMouseDown={e => e.stopPropagation()}>
          <TableBlockEditableTitle spaceId={spaceId} trailing={<BlockLinkIngestionChip />} />
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
            {showFilterAction && (
              <IconButton
                onClick={toggleFilterHandler}
                icon={filtersForChips.length > 0 ? <FilterTableWithFilters /> : <FilterTable />}
                color="grey-04"
              />
            )}
            {showFullscreenAction && (
              <DataBlockExpandControl
                spaceId={spaceId}
                blockEntityId={entityId}
                isEditing={isEditing}
                fullscreenHref={`/space/${spaceId}/${entityId}/power-tools?relationId=${relationId}`}
              />
            )}
            <DataBlockViewMenu activeView={view} isLoading={isLoading} />
            <TableBlockContextMenu sourceType={source.type} />
            {showCreateEntityPlus &&
              (usesCreateEntitySpaceDropdown ? (
                <DataBlockCreateEntitySpaceDropdown
                  source={source}
                  onPick={targetSpaceId => onAddPlaceholder(targetSpaceId)}
                />
              ) : (
                <button type="button" onClick={onAddPlaceholderClick}>
                  <Create />
                </button>
              ))}
          </div>
        </div>

        <BlockLinkIngestionPanel />

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
                        modesByColumn={activeModesByColumn}
                        filterSuggestionSpaceId={spaceId}
                        orderedColumnIds={orderedFilterColumnIds}
                        isEditing={isEditing}
                        onPreviewFilterState={setPreviewFilterState}
                      />
                    </>
                  )}
                  {!isEditing &&
                    filterGroupsForToolbarPills.length > 0 &&
                    filterGroupsForToolbarPills.map(group => (
                      <React.Fragment key={group.columnId}>
                        <TableBlockFilterGroupPill
                          group={group}
                          mode={activeModesByColumn[group.columnId] ?? 'AND'}
                          onToggleMode={() => toggleActiveGroupMode(group.columnId)}
                          onDeleteValue={originalIndex => {
                            const newFilterState = produce(filtersForChips, draft => {
                              draft.splice(originalIndex, 1);
                            });
                            setActiveFilters(newFilterState);
                          }}
                          onClearGroup={() => {
                            setActiveFilters(filtersForChips.filter(f => f.columnId !== group.columnId));
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
                          mode={activeModesByColumn[group.columnId] ?? 'AND'}
                          onToggleMode={() => toggleActiveGroupMode(group.columnId)}
                          onDeleteValue={originalIndex => {
                            const newFilterState = produce(filtersForChips, draft => {
                              draft.splice(originalIndex, 1);
                            });
                            setActiveFilters(newFilterState);
                          }}
                          onClearGroup={() => {
                            setActiveFilters(filtersForChips.filter(f => f.columnId !== group.columnId));
                          }}
                          onAddSimilar={anchorEl => {
                            requestAnimationFrame(() => {
                              requestAnimationFrame(() => {
                                filterPromptRef.current?.openWithColumn(group.columnId, anchorEl);
                              });
                            });
                          }}
                          isEditing={canEditChips}
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
          {showLoadingPlaceholder ? (
            <DataBlockLoadingPlaceholder view={view} items={pageSize} mediaFrame={mediaFrame} />
          ) : (
            EntriesComponent
          )}
          {/*
            Sibling of the list rather than part of it, so the region is in the DOM from the moment
            the block renders in infinite-scroll mode — through loading, and whether or not the
            sentinel is mounted. A live region inserted in the same commit as its text is not
            announced by most screen readers, and a first-page failure is exactly that case: no
            rows, so no sentinel and no skeleton to have mounted a wrapper earlier.
          */}
          {isInfiniteScroll && (
            <div role="status" aria-live="polite" className="flex flex-col items-center text-footnote text-grey-04">
              {infiniteScrollDisplay.showRetry && (
                <div className="flex flex-col items-center gap-2 py-4">
                  <span>Couldn&apos;t load more results.</span>
                  <button
                    type="button"
                    onClick={() => void refetchDataBlock?.()}
                    className="text-ctaPrimary hover:underline"
                  >
                    Try again
                  </button>
                </div>
              )}
            </div>
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
    </BlockLinkIngestionProvider>
  );
};

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
