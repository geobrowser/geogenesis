'use client';

import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import * as React from 'react';

import { cx } from 'class-variance-authority';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { upsertCollectionItemRelation } from '~/core/blocks/data/collection';
import { FilterMode } from '~/core/blocks/data/filters';
import { useDataBlock } from '~/core/blocks/data/use-data-block';
import { useFilters } from '~/core/blocks/data/use-filters';
import { useSource } from '~/core/blocks/data/use-source';
import { useCreateEntityWithFilters } from '~/core/hooks/use-create-entity-with-filters';
import { useCanUserEdit, useUserIsEditing } from '~/core/hooks/use-user-is-editing';
import { ID } from '~/core/id';
import { EditorProvider } from '~/core/state/editor/editor-provider';
import { EntityStoreProvider } from '~/core/state/entity-page-store/entity-store-provider';
import { reactiveRelations, reactiveValues } from '~/core/sync/store';
import { useMutate } from '~/core/sync/use-mutate';
import { getRelations, getValues, useQueryEntities, useQueryEntity } from '~/core/sync/use-store';
import type { Value } from '~/core/types';
import { ColumnSortState } from '~/core/utils/column-sort';
import { mapPropertyType } from '~/core/utils/property/properties';
import { NavUtils } from '~/core/utils/utils';

import { Checkbox } from '~/design-system/checkbox';
import { Close } from '~/design-system/icons/close';
import { EditSmall } from '~/design-system/icons/edit-small';
import { Eye } from '~/design-system/icons/eye';
import { EyeHide } from '~/design-system/icons/eye-hide';
import { NewTab } from '~/design-system/icons/new-tab';
import { Plus } from '~/design-system/icons/plus';
import { Trash } from '~/design-system/icons/trash';
import { Menu, MenuItem } from '~/design-system/menu';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';
import { Spacer } from '~/design-system/spacer';
import { Text } from '~/design-system/text';

import type { onChangeEntryFn, onLinkEntryFn } from '~/partials/blocks/table/change-entry';
import { createPropertyRelation, writeValue } from '~/partials/blocks/table/change-entry';
import { TableBlockEditableFilters } from '~/partials/blocks/table/table-block-editable-filters';
import { TableBlockFilterGroupPill, groupFilters } from '~/partials/blocks/table/table-block-filter-pill';
import { Editor } from '~/partials/editor/editor';
import { EditableHeading } from '~/partials/entity-page/editable-entity-header';
import { EntityPageCover } from '~/partials/entity-page/entity-page-cover';
import { EntityPageMetadataHeader } from '~/partials/entity-page/entity-page-metadata-header';
import { ToggleEntityPage } from '~/partials/entity-page/toggle-entity-page';

import {
  type EditAddExistingPropertyPayload,
  type EditApplyNewPropertyPayload,
  type EditApplyPayload,
  type EditApplyValuePayload,
  type EditCreatePropertyEntityPayload,
  type EditDeleteApplyPayload,
  EditEntitiesPopover,
  type EditRemovePropertiesPayload,
} from './edit-entities-popover';
import { usePowerToolsData } from './hooks/use-power-tools-data';
import { PowerToolsTable } from './power-tools-table';
import { PowerToolsRow } from './types';

const PANEL_ENTITY_ID_PARAM = 'panelEntityId';
const PANEL_SPACE_ID_PARAM = 'panelSpaceId';

function PowerToolsEntityPanel({
  entityId,
  spaceId,
  onClose,
}: {
  entityId: string;
  spaceId: string;
  onClose: () => void;
}) {
  const { entity, isLoading } = useQueryEntity({
    spaceId,
    id: entityId,
    enabled: Boolean(entityId && spaceId),
  });

  const blockRelations = React.useMemo(() => {
    return entity?.relations?.filter(r => r.type.id === SystemIds.BLOCKS) ?? [];
  }, [entity]);

  const blockIds = React.useMemo(() => blockRelations.map(r => r.toEntity.id), [blockRelations]);

  const { entities: blocks, isLoading: isBlocksLoading } = useQueryEntities({
    where: {
      id: { in: blockIds },
    },
    enabled: blockIds.length > 0,
  });

  const isPanelLoading = isLoading || isBlocksLoading;

  return (
    <div className="absolute inset-y-0 right-0 z-20 flex w-[520px] max-w-[60vw] flex-col border-l border-grey-02 bg-white shadow-card">
      <div className="flex items-center justify-between border-b border-grey-02 px-4 py-2">
        <Text variant="body">Entity</Text>
        <div className="flex items-center gap-1">
          <Link
            href={NavUtils.toEntity(spaceId, entityId)}
            target="_blank"
            rel="noreferrer"
            className="flex h-8 w-8 items-center justify-center rounded-sm hover:bg-grey-01"
            aria-label="Open entity in new tab"
          >
            <NewTab />
          </Link>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-sm hover:bg-grey-01"
            aria-label="Close entity panel"
          >
            <Close />
          </button>
        </div>
      </div>
      <div className="h-full overflow-y-auto">
        {isPanelLoading ? (
          <div className="flex h-full items-center justify-center">
            <Text variant="body" color="grey-04">
              Loading entity...
            </Text>
          </div>
        ) : (
          <EntityStoreProvider id={entityId} spaceId={spaceId}>
            <EditorProvider
              id={entityId}
              spaceId={spaceId}
              initialBlocks={blocks ?? []}
              initialBlockRelations={blockRelations}
            >
              <EntityPageCover avatarUrl={null} coverUrl={null} />
              <div className="px-4">
                <EditableHeading spaceId={spaceId} entityId={entityId} />
                <EntityPageMetadataHeader id={entityId} spaceId={spaceId} />
                <Spacer height={16} />
                <Editor spaceId={spaceId} shouldHandleOwnSpacing />
                <ToggleEntityPage id={entityId} spaceId={spaceId} />
              </div>
            </EditorProvider>
          </EntityStoreProvider>
        )}
      </div>
    </div>
  );
}

export function PowerToolsScreen() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { spaceId, name: blockName } = useDataBlock();
  const isEditing = useUserIsEditing(spaceId);
  const canEdit = useCanUserEdit(spaceId);
  const { storage } = useMutate();

  const {
    filterState,
    resolvedFilterState,
    temporaryFilters,
    setFilterState,
    setTemporaryFilters,
    filterMode,
    setFilterMode,
    temporaryFilterMode,
    setTemporaryFilterMode,
  } = useFilters(canEdit);
  const { source } = useSource({ filterState, setFilterState });

  // Editors (by permission) use persisted filters; non-editors use local temporary filters.
  // This matches TableBlock's behavior and is independent of the edit mode toggle.
  const effectiveFilterState = canEdit ? resolvedFilterState : temporaryFilters;
  const effectiveSetFilterState = canEdit ? setFilterState : setTemporaryFilters;
  const activeFilterMode = canEdit ? filterMode : temporaryFilterMode;
  const setActiveFilterMode = React.useCallback(
    (mode: FilterMode) => {
      if (canEdit) setFilterMode(mode);
      else setTemporaryFilterMode(mode);
    },
    [canEdit, setFilterMode, setTemporaryFilterMode]
  );

  const [extraColumnIds, setExtraColumnIds] = React.useState<string[]>([]);
  const [excludedColumnIds, setExcludedColumnIds] = React.useState<string[]>([]);
  const [sortState, setSortState] = React.useState<ColumnSortState>(null);

  const serverSort = React.useMemo(() => {
    if (!sortState) return undefined;
    return { propertyId: sortState.columnId, direction: sortState.direction };
  }, [sortState]);

  const data = usePowerToolsData({
    filterStateOverride: canEdit ? undefined : temporaryFilters,
    filterModeOverride: canEdit ? undefined : temporaryFilterMode,
    extraColumnIds,
    excludedColumnIds,
    sort: serverSort,
  });

  const propertyIds = React.useMemo(() => data.properties.map(p => p.id), [data.properties]);
  const [orderedPropertyIds, setOrderedPropertyIds] = React.useState<string[]>(() => propertyIds);

  React.useEffect(() => {
    setOrderedPropertyIds(prev => {
      const idsSet = new Set(propertyIds);
      const ordered = prev.filter(id => idsSet.has(id));
      const appended = propertyIds.filter(id => !ordered.includes(id));
      if (appended.length === 0 && ordered.length === prev.length) return prev;
      return [...ordered, ...appended];
    });
  }, [propertyIds]);

  const { nextEntityId, onClick: createEntityWithTypes } = useCreateEntityWithFilters(spaceId);
  const [hasPlaceholderRow, setHasPlaceholderRow] = React.useState(false);
  const [pendingEntityId, setPendingEntityId] = React.useState<string | null>(null);
  const [pinnedNewEntityId, setPinnedNewEntityId] = React.useState<string | null>(null);
  const [hiddenColumnIds, setHiddenColumnIds] = React.useState<Set<string>>(new Set([SystemIds.BLOCKS]));
  const [isColumnMenuOpen, setIsColumnMenuOpen] = React.useState(false);
  const [valuesApplyVersion, setValuesApplyVersion] = React.useState(0);

  const shouldShowPlaceholder =
    isEditing &&
    ((hasPlaceholderRow && !data.rows.find(r => r.entityId === nextEntityId)) ||
      (pendingEntityId && !data.rows.find(r => r.entityId === pendingEntityId)));

  const placeholderEntityId = pendingEntityId || nextEntityId;
  const sourceValue = 'value' in source ? source.value : null;
  const panelEntityId = searchParams?.get(PANEL_ENTITY_ID_PARAM) ?? null;
  const panelSpaceId = searchParams?.get(PANEL_SPACE_ID_PARAM) ?? spaceId;

  const rowsWithPlaceholder = React.useMemo<PowerToolsRow[]>(() => {
    if (shouldShowPlaceholder) {
      const placeholderRow: PowerToolsRow = {
        entityId: placeholderEntityId,
        spaceId,
        placeholder: true,
        collectionId: source.type === 'COLLECTION' ? source.value : undefined,
      };
      return [placeholderRow, ...data.rows];
    }

    if (pinnedNewEntityId) {
      const pinnedRow = data.rows.find(r => r.entityId === pinnedNewEntityId);
      if (pinnedRow) {
        return [pinnedRow, ...data.rows.filter(r => r.entityId !== pinnedNewEntityId)];
      }
    }

    return data.rows;
  }, [data.rows, placeholderEntityId, shouldShowPlaceholder, spaceId, source.type, sourceValue, pinnedNewEntityId]);

  const selectableRows = React.useMemo(() => rowsWithPlaceholder.filter(r => !r.placeholder), [rowsWithPlaceholder]);
  const selectableCount = selectableRows.length;
  const selectableIds = React.useMemo(() => new Set(selectableRows.map(r => r.entityId)), [selectableRows]);

  const [selectedEntityIds, setSelectedEntityIds] = React.useState<Set<string>>(() => new Set());
  const [isSelectionModeActive, setIsSelectionModeActive] = React.useState(false);

  React.useEffect(() => {
    setSelectedEntityIds(prev => {
      const pruned = new Set([...prev].filter(id => selectableIds.has(id)));
      return pruned.size === prev.size ? prev : pruned;
    });
  }, [selectableIds]);
  const [imageUploadingFor, setImageUploadingFor] = React.useState<Set<string>>(new Set());
  /** Property columns actively receiving a bulk “apply to rows” write (e.g. while fetchAllIds runs). */
  const [bulkApplyPendingPropertyIds, setBulkApplyPendingPropertyIds] = React.useState<Set<string>>(() => new Set());
  const selectedCount = selectedEntityIds.size;
  const isAllSelected = selectableCount > 0 && selectedCount === selectableCount;

  const onRowClick = React.useCallback((entityId: string) => {
    setIsSelectionModeActive(prev => {
      if (!prev) {
        setSelectedEntityIds(s => new Set(s).add(entityId));
        return true;
      }
      return prev;
    });
  }, []);

  const toggleRowSelection = React.useCallback((entityId: string) => {
    setSelectedEntityIds(prev => {
      const next = new Set(prev);
      if (next.has(entityId)) next.delete(entityId);
      else next.add(entityId);
      return next;
    });
  }, []);

  const setRowSelection = React.useCallback((entityId: string, selected: boolean) => {
    setSelectedEntityIds(prev => {
      const next = new Set(prev);
      if (selected) next.add(entityId);
      else next.delete(entityId);
      return next;
    });
  }, []);

  const selectAll = React.useCallback(() => {
    setSelectedEntityIds(new Set(selectableRows.map(r => r.entityId)));
  }, [selectableRows]);

  const clearSelection = React.useCallback(() => {
    setSelectedEntityIds(new Set());
  }, []);

  const handleEditApply = React.useCallback(
    async (payload: EditApplyPayload) => {
      const { property, targetEntities, imageFile } = payload;
      const entityIdToSpaceId = new Map(
        selectableRows.filter(r => selectedEntityIds.has(r.entityId)).map(r => [r.entityId, r.spaceId] as const)
      );

      if (property.renderableTypeStrict === 'IMAGE' && imageFile) {
        const uploadKeys = new Set(Array.from(selectedEntityIds).map(id => `${id}:${property.id}`));
        setImageUploadingFor(uploadKeys);
        try {
          for (const fromEntityId of selectedEntityIds) {
            const rowSpaceId = entityIdToSpaceId.get(fromEntityId) ?? spaceId;
            const existingImageRelations = getRelations({
              selector: r =>
                r.fromEntity.id === fromEntityId &&
                r.type.id === property.id &&
                (r.spaceId === rowSpaceId || r.toSpaceId === rowSpaceId),
            });
            existingImageRelations.forEach(relation => storage.relations.delete(relation));
            await storage.images.createAndLink({
              file: imageFile,
              fromEntityId,
              fromEntityName: null,
              relationPropertyId: property.id,
              relationPropertyName: property.name ?? null,
              spaceId: rowSpaceId,
            });
            setImageUploadingFor(prev => {
              const next = new Set(prev);
              next.delete(`${fromEntityId}:${property.id}`);
              return next;
            });
          }
        } finally {
          setImageUploadingFor(new Set());
        }
        return;
      }

      setBulkApplyPendingPropertyIds(prev => new Set(prev).add(property.id));
      try {
        // Let the table paint Applying… before a large synchronous relation write.
        await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
        selectedEntityIds.forEach(fromEntityId => {
          const rowSpaceId = entityIdToSpaceId.get(fromEntityId) ?? spaceId;
          targetEntities.forEach(target => {
            createPropertyRelation(storage, rowSpaceId, fromEntityId, property, {
              id: target.id,
              name: target.name,
              space: target.primarySpace,
            });
          });
        });
      } finally {
        setBulkApplyPendingPropertyIds(prev => {
          const next = new Set(prev);
          next.delete(property.id);
          return next;
        });
      }
    },
    [storage, spaceId, selectedEntityIds, selectableRows]
  );

  const handleApplyValue = React.useCallback(
    (payload: EditApplyValuePayload) => {
      const { property, value } = payload;
      const selectedIds = Array.from(selectedEntityIds);
      if (selectedIds.length === 0) return;

      const selectedSet = new Set(selectedIds);
      const entityIdToSpaceId = new Map<string, string>();
      for (const row of selectableRows) {
        if (selectedSet.has(row.entityId)) {
          entityIdToSpaceId.set(row.entityId, row.spaceId);
        }
      }
      const existingValuesList = getValues({
        selector: v => selectedSet.has(v.entity.id) && v.property.id === property.id,
      });
      const valueByEntityAndSpace = new Map<string, Value>();
      for (const v of existingValuesList) {
        valueByEntityAndSpace.set(`${v.entity.id}:${v.spaceId}`, v);
      }
      const isClear = value.trim() === '';
      for (const entityId of selectedIds) {
        const rowSpaceId = entityIdToSpaceId.get(entityId) ?? spaceId;
        const existing = valueByEntityAndSpace.get(`${entityId}:${rowSpaceId}`) ?? null;
        const safeExisting =
          existing && existing.entity.id === entityId && existing.spaceId === rowSpaceId ? existing : null;
        if (isClear) {
          if (safeExisting) storage.values.delete(safeExisting);
        } else {
          writeValue(storage, entityId, rowSpaceId, property, value, safeExisting);
        }
      }
      setValuesApplyVersion(v => v + 1);
    },
    [storage, spaceId, selectedEntityIds, selectableRows]
  );

  const handleDeleteApply = React.useCallback(
    (payload: EditDeleteApplyPayload) => {
      const { property, targetKeys } = payload;

      const isRelationProperty =
        property.dataType === 'RELATION' || (property.relationValueTypes && property.relationValueTypes.length > 0);

      if (isRelationProperty) {
        const targetKeySet = new Set(targetKeys.map(k => `${k.toEntityId}:${k.toSpaceId ?? ''}`));
        const relations = getRelations({
          selector: r => {
            if (!selectedEntityIds.has(r.fromEntity.id) || r.type.id !== property.id) return false;
            const relationKey = `${r.toEntity.id}:${r.toSpaceId ?? r.spaceId ?? ''}`;
            return targetKeySet.has(relationKey);
          },
        });
        relations.forEach(relation => storage.relations.delete(relation));
      } else {
        const valuesToDelete = getValues({
          selector: v => selectedEntityIds.has(v.entity.id) && v.property.id === property.id,
        });
        valuesToDelete.forEach(v => storage.values.delete(v));
      }
      setValuesApplyVersion(v => v + 1);
    },
    [storage, selectedEntityIds]
  );

  const handleRemoveProperties = React.useCallback(
    (payload: EditRemovePropertiesPayload) => {
      const { propertyIds, scope } = payload;
      const targetEntityIds = scope === 'allEntities' ? selectableIds : selectedEntityIds;
      for (const propertyId of propertyIds) {
        const valuesToDelete = getValues({
          selector: v => targetEntityIds.has(v.entity.id) && v.property.id === propertyId,
        });
        valuesToDelete.forEach(v => storage.values.delete(v));
        const relationsToDelete = getRelations({
          selector: r => targetEntityIds.has(r.fromEntity.id) && r.type.id === propertyId,
        });
        relationsToDelete.forEach(r => storage.relations.delete(r));
      }
      setExcludedColumnIds(prev => [...new Set([...prev, ...propertyIds])]);
    },
    [storage, selectedEntityIds, selectableIds]
  );

  const handleAddExistingProperty = React.useCallback(
    (payload: EditAddExistingPropertyPayload) => {
      // Ensure the property exists locally so the new column can render immediately
      // even if remote property hydration is delayed/fails.
      const { baseDataType, renderableTypeId } = mapPropertyType('RELATION');
      storage.properties.create({
        entityId: payload.propertyId,
        spaceId,
        name: '',
        dataType: baseDataType,
        renderableTypeId,
        verified: false,
        toSpaceId: undefined,
      });

      setExtraColumnIds(prev => (prev.includes(payload.propertyId) ? prev : [...prev, payload.propertyId]));
      setExcludedColumnIds(prev => prev.filter(id => id !== payload.propertyId));
      setHiddenColumnIds(prev => {
        if (!prev.has(payload.propertyId)) return prev;
        const next = new Set(prev);
        next.delete(payload.propertyId);
        return next;
      });
    },
    [storage, spaceId]
  );

  const handleCreatePropertyEntity = React.useCallback(
    ({ propertyId, name, valueType }: EditCreatePropertyEntityPayload) => {
      const { baseDataType, renderableTypeId } = mapPropertyType(valueType);
      storage.properties.create({
        entityId: propertyId,
        spaceId,
        name: name ?? '',
        dataType: baseDataType,
        renderableTypeId,
        verified: false,
        toSpaceId: undefined,
      });
    },
    [storage, spaceId]
  );

  const fetchAllIdsRef = React.useRef(data.fetchAllIds);
  React.useEffect(() => {
    fetchAllIdsRef.current = data.fetchAllIds;
  }, [data.fetchAllIds]);

  const handleApplyNewProperty = React.useCallback(
    async (payload: EditApplyNewPropertyPayload) => {
      const {
        propertyId,
        name,
        valueType,
        applyToAllEntities,
        selectedRowEntityIds,
        selectedEntities,
        initialValue,
        initialImageFile,
      } = payload;

      setBulkApplyPendingPropertyIds(prev => new Set(prev).add(propertyId));
      try {
        // Ensure a local property record exists for both newly created and
        // existing-picked properties, so column rendering does not depend on
        // remote property fetch timing.
        const { baseDataType, renderableTypeId } = mapPropertyType(valueType);
        storage.properties.create({
          entityId: propertyId,
          spaceId,
          name: name ?? '',
          dataType: baseDataType,
          renderableTypeId,
          verified: false,
          toSpaceId: undefined,
        });

        setExtraColumnIds(prev => (prev.includes(propertyId) ? prev : [...prev, propertyId]));
        setExcludedColumnIds(prev => prev.filter(id => id !== propertyId));
        setHiddenColumnIds(prev => {
          if (!prev.has(propertyId)) return prev;
          const next = new Set(prev);
          next.delete(propertyId);
          return next;
        });
        const property = {
          id: propertyId,
          name,
          dataType: baseDataType,
        };

        const targetEntityIds = applyToAllEntities
          ? await fetchAllIdsRef.current()
          : selectedRowEntityIds.length > 0
            ? selectedRowEntityIds
            : selectableRows.map(r => r.entityId);
        if (targetEntityIds.length === 0) return;
        const entityIdToSpaceId = new Map(
          selectableRows.filter(r => targetEntityIds.includes(r.entityId)).map(r => [r.entityId, r.spaceId] as const)
        );

        if (valueType === 'IMAGE' && initialImageFile) {
          const uploadKeys = new Set(targetEntityIds.map(id => `${id}:${property.id}`));
          setImageUploadingFor(uploadKeys);
          try {
            for (const fromEntityId of targetEntityIds) {
              const rowSpaceId = entityIdToSpaceId.get(fromEntityId) ?? spaceId;
              await storage.images.createAndLink({
                file: initialImageFile,
                fromEntityId,
                fromEntityName: null,
                relationPropertyId: property.id,
                relationPropertyName: property.name,
                spaceId: rowSpaceId,
              });
              setImageUploadingFor(prev => {
                const next = new Set(prev);
                next.delete(`${fromEntityId}:${property.id}`);
                return next;
              });
            }
          } finally {
            setImageUploadingFor(new Set());
          }
        } else if ((valueType === 'RELATION' || valueType === 'IMAGE') && selectedEntities?.length) {
          targetEntityIds.forEach(fromEntityId => {
            const rowSpaceId = entityIdToSpaceId.get(fromEntityId) ?? spaceId;
            selectedEntities.forEach(target => {
              createPropertyRelation(storage, rowSpaceId, fromEntityId, property, {
                id: target.id,
                name: target.name,
                space: target.primarySpace,
              });
            });
          });
        } else if (valueType !== 'RELATION' && valueType !== 'IMAGE') {
          const value = initialValue ?? '';
          for (const entityId of targetEntityIds) {
            const rowSpaceId = entityIdToSpaceId.get(entityId) ?? spaceId;
            writeValue(storage, entityId, rowSpaceId, property, value, null);
          }
        }
      } finally {
        setBulkApplyPendingPropertyIds(prev => {
          const next = new Set(prev);
          next.delete(propertyId);
          return next;
        });
      }
    },
    [selectableRows, spaceId, storage]
  );

  const onMasterToggle = React.useCallback(() => {
    if (isAllSelected) clearSelection();
    else selectAll();
  }, [isAllSelected, clearSelection, selectAll]);

  const handleDeleteSelectedRows = React.useCallback(() => {
    if (selectedEntityIds.size === 0) return;

    const idsToDelete = new Set(selectedEntityIds);

    if (source.type === 'COLLECTION' && sourceValue) {
      const collectionRelations = getRelations({
        selector: r => r.fromEntity.id === source.value && idsToDelete.has(r.toEntity.id),
      });
      collectionRelations.forEach(r => storage.relations.delete(r));
    } else {
      const values = reactiveValues.get().filter(v => idsToDelete.has(v.entity.id));
      values.forEach(v => storage.values.delete(v));

      const relations = reactiveRelations.get().filter(r => idsToDelete.has(r.fromEntity.id));
      relations.forEach(r => storage.relations.delete(r));
    }

    setSelectedEntityIds(new Set());
    if (pinnedNewEntityId && idsToDelete.has(pinnedNewEntityId)) {
      setPinnedNewEntityId(null);
    }
  }, [selectedEntityIds, source.type, sourceValue, storage, pinnedNewEntityId]);

  const selectionProps = React.useMemo(
    () =>
      isEditing && selectableCount > 0
        ? {
          selectedEntityIds,
          onToggleRowSelection: toggleRowSelection,
          onSetRowSelection: setRowSelection,
          onMasterToggle,
          selectableCount,
          isAllSelected,
        }
        : undefined,
    [isEditing, selectableCount, selectedEntityIds, toggleRowSelection, setRowSelection, onMasterToggle, isAllSelected]
  );

  React.useEffect(() => {
    if (selectedCount === 0) {
      setIsSelectionModeActive(false);
    }
  }, [selectedCount]);

  React.useEffect(() => {
    if (pendingEntityId && data.rows.find(r => r.entityId === pendingEntityId)) {
      setPinnedNewEntityId(pendingEntityId);
      setPendingEntityId(null);
    }
  }, [pendingEntityId, data.rows]);

  React.useEffect(() => {
    setPinnedNewEntityId(null);
  }, [sourceValue, effectiveFilterState]);

  const onChangeEntry: onChangeEntryFn = (entityId, actionSpaceId, action) => {
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
        break;
      default:
        break;
    }

    if (source.type === 'COLLECTION') {
      const isInCollection = data.rows.some(row => row.entityId === entityId);
      if (!isInCollection) {
        const to =
          action.type === 'FIND_ENTITY'
            ? action.entity
            : action.type === 'CREATE_ENTITY'
              ? { id: nextEntityId, name: action.name }
              : { id: entityId, name: null, space: actionSpaceId, verified: false };

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

    if (entityId === nextEntityId) {
      setHasPlaceholderRow(false);
      if (action.type !== 'FIND_ENTITY') {
        const maybeName = action.type === 'CREATE_ENTITY' ? action.name : undefined;
        setPendingEntityId(entityId);
        // Pin eagerly to avoid a render where the row is at its natural position
        // before the effect fires, which would unmount the focused input.
        setPinnedNewEntityId(entityId);
        createEntityWithTypes({
          name: maybeName,
          filters: effectiveFilterState,
        });
      }
    }
  };

  const onLinkEntry: onLinkEntryFn = (id, to) => {
    const relation = getRelations({ selector: r => r.id === id })[0];
    if (!relation) return;

    storage.relations.update(relation, draft => {
      draft.toSpaceId = to.space;
      draft.verified = to.verified;
    });
  };

  const handleAddPlaceholder = () => {
    setHasPlaceholderRow(true);
    setPinnedNewEntityId(null);
  };

  const handleDismissPlaceholder = React.useCallback(() => {
    setHasPlaceholderRow(false);
    setPendingEntityId(null);
    setPinnedNewEntityId(null);
  }, []);

  const handleDeleteRow = React.useCallback(
    (row: PowerToolsRow) => {
      if (source.type === 'COLLECTION') {
        if (row.relationId) {
          const relation = getRelations({ selector: r => r.id === row.relationId })[0];
          if (relation) storage.relations.delete(relation);
        }
      } else {
        const values = reactiveValues.get().filter(v => v.entity.id === row.entityId);
        const relations = reactiveRelations.get().filter(r => r.fromEntity.id === row.entityId);
        for (const v of values) storage.values.delete(v);
        for (const r of relations) storage.relations.delete(r);
      }
      if (pinnedNewEntityId === row.entityId) setPinnedNewEntityId(null);
    },
    [source.type, storage, pinnedNewEntityId]
  );

  const handleDeleteFilter = React.useCallback(
    (index: number) => {
      const newFilters = effectiveFilterState.filter((_, i) => i !== index);
      effectiveSetFilterState(newFilters);
    },
    [effectiveFilterState, effectiveSetFilterState]
  );

  const handleOpenEntityPanel = React.useCallback(
    (entityId: string, entitySpaceId: string) => {
      const params = new URLSearchParams(searchParams?.toString());
      params.set(PANEL_ENTITY_ID_PARAM, entityId);
      params.set(PANEL_SPACE_ID_PARAM, entitySpaceId);
      router.push(`${pathname}?${params.toString()}`);
    },
    [pathname, router, searchParams]
  );

  const handleCloseEntityPanel = React.useCallback(() => {
    const params = new URLSearchParams(searchParams?.toString());
    params.delete(PANEL_ENTITY_ID_PARAM);
    params.delete(PANEL_SPACE_ID_PARAM);
    const query = params.toString();
    const safePathname = pathname ?? '/';
    router.replace(query ? `${safePathname}?${query}` : safePathname);
  }, [pathname, router, searchParams]);

  const toggleColumnVisibility = React.useCallback((propertyId: string) => {
    setHiddenColumnIds(prev => {
      const next = new Set(prev);
      if (next.has(propertyId)) {
        next.delete(propertyId);
      } else {
        next.add(propertyId);
      }
      return next;
    });
  }, []);

  const isLoading = data.isInitialLoading;

  if (data.sourceType === 'RELATIONS') {
    return (
      <div className="fixed inset-0 z-50 bg-white" style={{ top: '60px' }}>
        <div className="flex h-full items-center justify-center">
          <Text variant="body" color="grey-04">
            Power Tools does not yet support Relation-based data sources.
          </Text>
        </div>
      </div>
    );
  }

  const hasActiveFilters = effectiveFilterState.length > 0;

  const filterGroups = React.useMemo(() => groupFilters(effectiveFilterState), [effectiveFilterState]);

  const serverFilterKeys = React.useMemo(() => {
    const keys = new Set<string>();
    for (const f of filterState) {
      keys.add(`${f.columnId}:${f.value}`);
    }
    return keys;
  }, [filterState]);

  return (
    <div
      className="fixed inset-0 z-50 bg-white"
      style={{
        top: '60px',
        display: 'grid',
        gridTemplateRows: ['auto', !isEditing ? 'auto' : null, hasActiveFilters ? 'auto' : null, '1fr']
          .filter(Boolean)
          .join(' '),
      }}
    >
      <div className="flex items-center justify-between border-b border-grey-02 px-4 py-2">
        <div className="flex items-center gap-3">
          <Text variant="largeTitle" aria-label={blockName || 'Power Tools'}>
            {blockName || 'Power Tools'}
          </Text>
        </div>
        <div className="flex items-center gap-2">
          {isEditing && selectedCount > 0 && (
            <>
              <button
                type="button"
                onClick={selectedCount > 0 ? handleDeleteSelectedRows : undefined}
                disabled={selectedCount === 0}
                className="flex h-8 w-8 items-center justify-center rounded-sm hover:bg-grey-01 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
                title="Delete selected"
                aria-label="Delete selected"
              >
                <Trash />
              </button>
              <EditEntitiesPopover
                trigger={
                  <button
                    type="button"
                    disabled={selectedCount === 0}
                    className="flex h-8 w-8 items-center justify-center rounded-sm hover:bg-grey-01 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
                    title="Edit selected"
                    aria-label="Edit selected"
                  >
                    <EditSmall />
                  </button>
                }
                selectedCount={selectedCount}
                spaceId={spaceId}
                properties={data.properties}
                selectedEntityIds={Array.from(selectedEntityIds)}
                onApply={handleEditApply}
                onApplyValue={handleApplyValue}
                onDeleteApply={handleDeleteApply}
                onRemoveProperties={handleRemoveProperties}
                onApplyNewProperty={handleApplyNewProperty}
                onAddExistingProperty={handleAddExistingProperty}
                showPropertyActions={false}
                typesProperty={
                  data.properties.find(p => p.id === SystemIds.TYPES_PROPERTY) ?? {
                    id: SystemIds.TYPES_PROPERTY,
                    name: 'Types',
                    dataType: 'RELATION',
                  }
                }
              />
            </>
          )}
          <TableBlockEditableFilters filterState={effectiveFilterState} setFilterState={effectiveSetFilterState} />
          <Menu
            open={isColumnMenuOpen}
            onOpenChange={setIsColumnMenuOpen}
            className="w-[200px]!"
            trigger={
              <div
                className="flex h-8 w-8 items-center justify-center rounded-sm hover:bg-grey-01"
                title="Toggle columns"
              >
                <Eye />
              </div>
            }
          >
            <div className="max-h-[320px] overflow-y-auto py-1">
              {orderedPropertyIds.map(id => {
                const property = data.propertiesById[id];
                if (!property) return null;
                const isHidden = hiddenColumnIds.has(id);
                return (
                  <MenuItem key={id} onClick={() => toggleColumnVisibility(id)}>
                    <div className={cx('flex w-full items-center justify-between gap-2', isHidden && 'text-grey-03')}>
                      <span>{property.name || id}</span>
                      {isHidden ? <EyeHide /> : <Eye />}
                    </div>
                  </MenuItem>
                );
              })}
            </div>
          </Menu>
          {isEditing && (
            <button
              onClick={handleAddPlaceholder}
              className="flex h-8 w-8 items-center justify-center rounded-sm hover:bg-grey-01"
              title="Add new entity"
            >
              <Plus />
            </button>
          )}
          <button
            onClick={() => router.back()}
            className="flex h-8 w-8 items-center justify-center rounded-sm hover:bg-grey-01"
          >
            <Close />
          </button>
        </div>
      </div>

      {!isEditing && (
        <div className="border-b border-grey-02 bg-grey-01 px-4 py-2">
          <Text variant="metadata" color="grey-04">
            Enable edit mode in the global toolbar to make changes.
          </Text>
        </div>
      )}

      {hasActiveFilters && (
        <div className="flex items-center gap-2 border-b border-grey-02 px-4 py-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {filterGroups.map(group => (
              <React.Fragment key={group.columnId}>
                <TableBlockFilterGroupPill
                  group={group}
                  mode={activeFilterMode}
                  onToggleMode={() => setActiveFilterMode(activeFilterMode === 'AND' ? 'OR' : 'AND')}
                  onDeleteValue={originalIndex => handleDeleteFilter(originalIndex)}
                  isEditing={isEditing}
                  serverFilterKeys={serverFilterKeys}
                />
              </React.Fragment>
            ))}
          </div>
        </div>
      )}

      <div className="relative h-full overflow-hidden">
        {isLoading ? (
          <div className="flex h-full items-center justify-center">
            <Text variant="body" color="grey-04">
              Loading data...
            </Text>
          </div>
        ) : (
          <>
            {isEditing && selectableCount > 0 && (
              <div className="flex shrink-0 items-center gap-2 border-b border-grey-02 px-4 py-2">
                <Checkbox
                  checked={isAllSelected}
                  onChange={onMasterToggle}
                  aria-label={isAllSelected ? 'Deselect all' : 'Select all'}
                />
                <Text variant="metadataMedium" color="grey-04">
                  {selectedCount} / {selectableCount} selected
                </Text>
              </div>
            )}
            <PowerToolsTable
              rows={rowsWithPlaceholder}
              properties={data.properties}
              propertiesById={data.propertiesById}
              spaceId={spaceId}
              hasNextPage={data.hasMore}
              isFetchingNextPage={data.isLoading && rowsWithPlaceholder.length > 0}
              fetchNextPage={data.loadMore}
              onChangeEntry={onChangeEntry}
              onLinkEntry={onLinkEntry}
              onDismissPlaceholder={handleDismissPlaceholder}
              onDeleteRow={isEditing ? handleDeleteRow : undefined}
              onOpenEntityPanel={handleOpenEntityPanel}
              source={source}
              hiddenColumnIds={hiddenColumnIds}
              onHideColumn={toggleColumnVisibility}
              orderedPropertyIds={orderedPropertyIds}
              onReorderColumns={setOrderedPropertyIds}
              selection={selectionProps}
              imageUploadingFor={imageUploadingFor}
              bulkApplyPendingPropertyIds={bulkApplyPendingPropertyIds}
              onRowClick={undefined}
              onRowDoubleClick={isEditing && !isSelectionModeActive ? onRowClick : undefined}
              sortState={sortState}
              onSort={setSortState}
              selectedCount={selectedCount}
              selectedEntityIdsForNewProperty={Array.from(selectedEntityIds)}
              onApplyNewProperty={handleApplyNewProperty}
              onCreatePropertyEntity={handleCreatePropertyEntity}
              onAddExistingProperty={handleAddExistingProperty}
              onRemoveProperties={handleRemoveProperties}
            />
          </>
        )}
        {panelEntityId && (
          <PowerToolsEntityPanel entityId={panelEntityId} spaceId={panelSpaceId} onClose={handleCloseEntityPanel} />
        )}
      </div>
    </div>
  );
}
