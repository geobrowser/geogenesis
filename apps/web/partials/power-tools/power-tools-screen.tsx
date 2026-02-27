'use client';

import { SystemIds } from '@geoprotocol/geo-sdk';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import * as React from 'react';

import { upsertCollectionItemRelation } from '~/core/blocks/data/collection';
import { useDataBlock } from '~/core/blocks/data/use-data-block';
import { useFilters } from '~/core/blocks/data/use-filters';
import { useSource } from '~/core/blocks/data/use-source';
import { useCreateEntityWithFilters } from '~/core/hooks/use-create-entity-with-filters';
import { useCanUserEdit, useUserIsEditing } from '~/core/hooks/use-user-is-editing';
import { ID } from '~/core/id';
import { EditorProvider } from '~/core/state/editor/editor-provider';
import { EntityStoreProvider } from '~/core/state/entity-page-store/entity-store-provider';
import { useMutate } from '~/core/sync/use-mutate';
import { getRelations, useQueryEntities, useQueryEntity } from '~/core/sync/use-store';
import { NavUtils } from '~/core/utils/utils';

import { Close } from '~/design-system/icons/close';
import { NewTab } from '~/design-system/icons/new-tab';
import { Plus } from '~/design-system/icons/plus';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';
import { Text } from '~/design-system/text';

import type { onChangeEntryFn, onLinkEntryFn } from '~/partials/blocks/table/change-entry';
import { writeValue } from '~/partials/blocks/table/change-entry';
import { TableBlockEditableFilters } from '~/partials/blocks/table/table-block-editable-filters';
import { TableBlockFilterPill } from '~/partials/blocks/table/table-block-filter-pill';
import { ToggleEntityPage } from '~/partials/entity-page/toggle-entity-page';

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
      <div className="h-full overflow-y-auto p-4">
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
              <ToggleEntityPage id={entityId} spaceId={spaceId} />
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
  const { source } = useSource();
  const isEditing = useUserIsEditing(spaceId);
  const canEdit = useCanUserEdit(spaceId);
  const { storage } = useMutate();

  const {
    filterState,
    temporaryFilters,
    setFilterState,
    setTemporaryFilters,
  } = useFilters(canEdit);

  // Editors (by permission) use persisted filters; non-editors use local temporary filters.
  // This matches TableBlock's behavior and is independent of the edit mode toggle.
  const effectiveFilterState = canEdit ? filterState : temporaryFilters;
  const effectiveSetFilterState = canEdit ? setFilterState : setTemporaryFilters;

  const data = usePowerToolsData({
    filterStateOverride: canEdit ? undefined : temporaryFilters,
  });

  const { nextEntityId, onClick: createEntityWithTypes } = useCreateEntityWithFilters(spaceId);
  const [hasPlaceholderRow, setHasPlaceholderRow] = React.useState(false);
  const [pendingEntityId, setPendingEntityId] = React.useState<string | null>(null);

  const shouldShowPlaceholder =
    isEditing &&
    ((hasPlaceholderRow && !data.rows.find(r => r.entityId === nextEntityId)) ||
      (pendingEntityId && !data.rows.find(r => r.entityId === pendingEntityId)));

  const placeholderEntityId = pendingEntityId || nextEntityId;
  const sourceValue = 'value' in source ? source.value : null;
  const panelEntityId = searchParams?.get(PANEL_ENTITY_ID_PARAM) ?? null;
  const panelSpaceId = searchParams?.get(PANEL_SPACE_ID_PARAM) ?? spaceId;

  const rowsWithPlaceholder = React.useMemo<PowerToolsRow[]>(() => {
    if (!shouldShowPlaceholder) return data.rows;
    const placeholderRow: PowerToolsRow = {
      entityId: placeholderEntityId,
      spaceId,
      placeholder: true,
      collectionId: source.type === 'COLLECTION' ? source.value : undefined,
    };
    return [placeholderRow, ...data.rows];
  }, [data.rows, placeholderEntityId, shouldShowPlaceholder, spaceId, source.type, sourceValue]);

  React.useEffect(() => {
    if (pendingEntityId && data.rows.find(r => r.entityId === pendingEntityId)) {
      setPendingEntityId(null);
    }
  }, [pendingEntityId, data.rows]);

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
  };

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
          <Text variant="largeTitle">Power Tools</Text>
          {blockName && (
            <>
              <Text variant="largeTitle" color="grey-03">
                •
              </Text>
              <Text variant="largeTitle" color="grey-04">
                {blockName}
              </Text>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          <TableBlockEditableFilters
            filterState={effectiveFilterState}
            setFilterState={effectiveSetFilterState}
          />
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
            {effectiveFilterState.map((filter, index) => (
              <TableBlockFilterPill
                key={`${filter.columnId}-${filter.value}-${index}`}
                filter={filter}
                onDelete={() => handleDeleteFilter(index)}
              />
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
          <PowerToolsTable
            rows={rowsWithPlaceholder}
            properties={data.properties}
            spaceId={spaceId}
            hasNextPage={data.hasMore}
            isFetchingNextPage={data.isLoading && rowsWithPlaceholder.length > 0}
            fetchNextPage={data.loadMore}
            onChangeEntry={onChangeEntry}
            onLinkEntry={onLinkEntry}
            onOpenEntityPanel={handleOpenEntityPanel}
            source={source}
          />
        )}
        {panelEntityId && (
          <PowerToolsEntityPanel entityId={panelEntityId} spaceId={panelSpaceId} onClose={handleCloseEntityPanel} />
        )}
      </div>
    </div>
  );
}
