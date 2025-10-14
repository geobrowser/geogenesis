'use client';

import { SystemIds, Position } from '@graphprotocol/grc-20';
import { useRouter } from 'next/navigation';
import { useInfiniteQuery } from '@tanstack/react-query';

import * as React from 'react';

import { useDataBlock } from '~/core/blocks/data/use-data-block';
import { filterStateToWhere, useDataBlockInstance } from '~/core/blocks/data/use-data-block';
import { useSource } from '~/core/blocks/data/use-source';
import { useFilters } from '~/core/blocks/data/use-filters';
import { useCollection } from '~/core/blocks/data/use-collection';
import { useQueryEntity, getValues, getRelations, useQueryEntitiesAsync } from '~/core/sync/use-store';
import { useQueryClient } from '@tanstack/react-query';
import { GeoStore } from '~/core/sync/store';
import { ID } from '~/core/id';
import { useProperties } from '~/core/hooks/use-properties';
import { storage } from '~/core/sync/use-mutate';
import { useCreateEntityWithFilters } from '~/core/hooks/use-create-entity-with-filters';
import { Entities } from '~/core/utils/entity';
import { Cell, Entity, Property, Relation, Row } from '~/core/v2.types';

import { Close } from '~/design-system/icons/close';
import { Plus } from '~/design-system/icons/plus';
import { Text } from '~/design-system/text';

import { PowerToolsTableVirtual } from './power-tools-table-virtual';
import { PowerToolsActionsPopover } from './power-tools-actions-popover';
import { useClipboard } from './use-clipboard';

const BATCH_SIZE = 50;

// Fetch function for infinite query using the actual query system
function createFetchEntitiesPage(queryEntitiesAsync: ReturnType<typeof useQueryEntitiesAsync>) {
  return async function fetchEntitiesPage({
    pageParam = 0,
    where,
  }: {
    pageParam?: number;
    where: any;
  }) {
    try {
      const entities = await queryEntitiesAsync({
        where,
        first: BATCH_SIZE,
        skip: pageParam,
      });

      // For now, we don't have a total count from the API, so we estimate based on results
      // If we get less than BATCH_SIZE, we've reached the end
      const hasMore = entities.length === BATCH_SIZE;

      return {
        entities,
        totalCount: -1, // Unknown total count
        nextCursor: hasMore ? pageParam + BATCH_SIZE : undefined,
      };
    } catch (error) {
      console.error('Failed to fetch entities:', error);
      throw error;
    }
  };
}

export function PowerToolsViewVirtual() {
  const router = useRouter();
  const { spaceId, relationId } = useDataBlockInstance();
  const queryEntitiesAsync = useQueryEntitiesAsync();
  const [selectedRows, setSelectedRows] = React.useState<Set<string>>(new Set());
  const queryClient = useQueryClient();
  const [canPaste, setCanPaste] = React.useState(false);

  const { copyRowsToClipboard, pasteRowsFromClipboard, isClipboardSupported, parseRelationUUIDs } = useClipboard();

  // Hook for creating new entities with filters
  const { nextEntityId, onClick: createEntityWithTypes } = useCreateEntityWithFilters(spaceId);
  const [showPlaceholderRow, setShowPlaceholderRow] = React.useState(false);

  // Use standard data block hooks
  const { name: blockName } = useDataBlock();
  const { source } = useSource();
  const { filterState } = useFilters();
  const where = filterStateToWhere(filterState);

  // Get block relation entity if it's a collection
  const { entity: blockRelationEntity, isLoading: isBlockRelationLoading } = useQueryEntity({
    id: relationId || '',
    enabled: source.type === 'COLLECTION' && Boolean(relationId),
  });

  // For collections, use regular fetching (they're usually smaller)
  const { collectionItems, collectionRelations, isLoading: isCollectionLoading } = useCollection({});

  // Create the fetch function with the async query
  const fetchEntitiesPage = React.useMemo(
    () => createFetchEntitiesPage(queryEntitiesAsync),
    [queryEntitiesAsync]
  );

  // For queries, use infinite query for virtualization
  const {
    data: queryData,
    fetchNextPage,
    hasNextPage,
    isFetching,
    isFetchingNextPage,
    isLoading: isQueryLoading,
  } = useInfiniteQuery({
    queryKey: ['power-tools-entities', where, spaceId],
    queryFn: ({ pageParam }) => fetchEntitiesPage({ pageParam, where }),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    enabled: source.type === 'SPACES' || source.type === 'GEO',
    staleTime: 30000,
    refetchOnWindowFocus: false,
  });

  // Flatten pages of data
  const queriedEntities = React.useMemo(
    () => (queryData ? queryData.pages.flatMap((page) => page.entities) : []),
    [queryData]
  );

  // Since we don't have total count from API, estimate based on fetched + hasMore
  const totalDBRowCount = hasNextPage ? '?' : queriedEntities.length;
  const totalFetched = queriedEntities.length;

  // Get ALL properties (not just shown ones)
  const allPropertyIds = React.useMemo(() => {
    const ids = new Set<string>();

    let entities: Entity[] = [];
    if (source.type === 'COLLECTION' && collectionItems) {
      entities = collectionItems;
    } else if ((source.type === 'GEO' || source.type === 'SPACES') && queriedEntities) {
      entities = queriedEntities;
    }

    entities.forEach(entity => {
      const values = entity.values || [];
      const relations = entity.relations || [];
      values.forEach(value => {
        ids.add(value.property.id);
      });
      relations.forEach(relation => {
        ids.add(relation.type.id);
      });
    });

    return Array.from(ids);
  }, [collectionItems, queriedEntities, blockRelationEntity?.relations, source.type]);

  const propertiesSchema = useProperties(allPropertyIds);
  const properties = React.useMemo(() => {
    return propertiesSchema ? Object.values(propertiesSchema) : [];
  }, [propertiesSchema]);

  // Create a placeholder row for adding new entities
  const makePlaceholderRow = React.useCallback((entityId: string, propertyIds: string[]): Row => {
    const columns: Record<string, Cell> = {};

    propertyIds.forEach(propId => {
      columns[propId] = {
        slotId: `${entityId}-${propId}`,
        propertyId: propId,
        name: null,
      };
    });

    return {
      entityId,
      columns,
      placeholder: true,
    };
  }, []);

  // Convert entities to rows
  const entitiesToRows = React.useCallback((entities: Entity[], propertyIds: string[], collectionRels: Relation[] = []): Row[] => {
    return entities.map(entity => {
      const row: Row = {
        entityId: entity.id,
        columns: {},
      };

      const values = entity.values || [];
      const relations = entity.relations || [];

      propertyIds.forEach(propId => {
        const tripleValues = values.filter(t => t.property.id === propId);
        const tripleRelations = relations.filter(t => t.type.id === propId);

        const cell: Cell = {
          slotId: `${entity.id}-${propId}`,
          propertyId: propId,
          name: null,
        };

        if (tripleValues.length > 0) {
          cell.name = tripleValues.map(t => t.value).join(', ');
        }

        if (tripleRelations.length > 0 && tripleRelations[0]) {
          cell.relationId = tripleRelations[0].id;
          cell.name = tripleRelations[0].toEntity?.name || null;
        }

        if (cell.name || cell.relationId) {
          row.columns[propId] = cell;
        }
      });

      return row;
    });
  }, []);

  // Build rows for display based on source type
  const loadedRows = React.useMemo(() => {
    let entities: Entity[] = [];

    if (source.type === 'COLLECTION' && collectionItems) {
      entities = collectionItems;
    } else if ((source.type === 'GEO' || source.type === 'SPACES') && queriedEntities) {
      entities = queriedEntities;
    }

    const entityRows = entities.length === 0 ? [] : entitiesToRows(
      entities,
      allPropertyIds,
      source.type === 'COLLECTION' ? collectionRelations : []
    );

    // Add placeholder row at the beginning if we're showing it
    if (showPlaceholderRow) {
      return [makePlaceholderRow(nextEntityId, allPropertyIds), ...entityRows];
    }

    return entityRows;
  }, [collectionItems, queriedEntities, source.type, allPropertyIds, collectionRelations, entitiesToRows, showPlaceholderRow, nextEntityId, makePlaceholderRow]);

  // Selection handlers
  const handleSelectRow = React.useCallback((entityId: string, selected: boolean) => {
    setSelectedRows(prev => {
      const next = new Set(prev);
      if (selected) {
        next.add(entityId);
      } else {
        next.delete(entityId);
      }
      return next;
    });
  }, []);

  const handleSelectAll = React.useCallback((selected: boolean) => {
    if (selected) {
      setSelectedRows(new Set(loadedRows.map(row => row.entityId)));
    } else {
      setSelectedRows(new Set());
    }
  }, [loadedRows]);

  const handleSelectRange = React.useCallback((startIndex: number, endIndex: number, selected: boolean) => {
    const affectedRows = loadedRows.slice(startIndex, endIndex + 1);
    setSelectedRows(prev => {
      const next = new Set(prev);
      affectedRows.forEach(row => {
        if (selected) {
          next.add(row.entityId);
        } else {
          next.delete(row.entityId);
        }
      });
      return next;
    });
  }, [loadedRows]);

  // Bulk operations handlers
  const handleBulkOperation = React.useCallback((
    operation: 'add-values' | 'add-relations' | 'remove-values' | 'remove-relations',
    propertyId: string,
    value?: string,
    entityId?: string
  ) => {
    const selectedEntityIds = Array.from(selectedRows);
    if (selectedEntityIds.length === 0) return;

    try {
      const edits = selectedEntityIds.map(entityId => ({
        entityId,
        propertyId,
        value: value || '',
        operation,
      }));

      console.log('Performing bulk operation:', edits);

      // Here you would implement the actual bulk edit logic
      // This would involve updating the entities in your store/database

      // After successful edit, invalidate queries and clear selection
      queryClient.invalidateQueries();
      setSelectedRows(new Set());
    } catch (error) {
      console.error('Failed to perform bulk operation:', error);
    }
  }, [selectedRows, queryClient]);

  // Copy/paste handlers
  const handleCopy = React.useCallback(async () => {
    const selectedRowData = loadedRows.filter(row => selectedRows.has(row.entityId));
    if (selectedRowData.length === 0) return;

    try {
      await copyRowsToClipboard(selectedRowData, properties);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  }, [loadedRows, selectedRows, properties, copyRowsToClipboard]);

  const handlePaste = React.useCallback(async () => {
    try {
      const pastedRows = await pasteRowsFromClipboard();
      if (!pastedRows || pastedRows.rows.length === 0) {
        alert('No valid data found in clipboard');
        return;
      }

      // Create new entities from pasted data
      const newEntities: Entity[] = pastedRows.rows.map((row, rowIndex) => {
        const entity: Entity = {
          id: ID.createEntityId(),
          name: row[0] || `New Entity ${rowIndex + 1}`,
          description: null,
          spaces: [spaceId],
          types: [],
          relations: [],
          values: [],
        };

        // TODO: Add proper value/relation creation from clipboard data
        // For now, just creating basic entities

        return entity;
      });

      console.log('Creating new entities from pasted data:', newEntities);

      // Here you would save the new entities to your store/database
      // await storage.createEntities(newEntities);

      // Invalidate queries to refresh the table
      queryClient.invalidateQueries();
    } catch (error) {
      console.error('Failed to paste:', error);
      alert('Failed to paste data. Please check the format and try again.');
    }
  }, [pasteRowsFromClipboard, properties, spaceId, queryClient]);

  // Handler for showing placeholder row (entity creation happens when user types)
  const handleAddPlaceholder = React.useCallback(() => {
    setShowPlaceholderRow(true);
  }, []);

  // Handler for cell changes - creates entities when placeholder row is edited
  const handleChangeEntry = React.useCallback((context: any, event: any) => {
    // Handle placeholder row - create entity when user types
    if (context.entityId === nextEntityId) {
      // Handle cancel event
      if (event.type === 'Cancel') {
        setShowPlaceholderRow(false);
        return;
      }

      setShowPlaceholderRow(false);

      // Only create entity if not using Find (for collections)
      if (event.type !== 'Find') {
        const maybeName = event.type === 'Create' ? event.data.name : undefined;

        // Create the entity with any active filters
        createEntityWithTypes({
          name: maybeName,
          filters: filterState,
        });

        // If this is a collection, add the new entity to the collection
        if (source.type === 'COLLECTION' && source.value) {
          storage.relations.set({
            id: ID.createEntityId(),
            entityId: ID.createEntityId(),
            spaceId,
            position: Position.generate(),
            renderableType: 'RELATION',
            verified: false,
            type: {
              id: SystemIds.COLLECTION_ITEM_RELATION_TYPE,
              name: 'Collection Item',
            },
            fromEntity: {
              id: source.value,
              name: null,
            },
            toEntity: {
              id: context.entityId,
              name: null,
              value: context.entityId,
            },
            isLocal: true,
          });
        }
      }
    }

    // Invalidate query cache to refresh data
    queryClient.invalidateQueries();
  }, [nextEntityId, createEntityWithTypes, filterState, source, spaceId, queryClient]);

  // Handler for linking entries (used for collection items)
  const handleLinkEntry = React.useCallback((id: string, to: {id: string; name: string | null; space?: string; verified?: boolean}) => {
    // This is typically used for updating relation metadata like space and verified status
    // For now, we'll just log it
    console.log('Link entry:', id, to);
  }, []);

  // Check clipboard permissions
  React.useEffect(() => {
    if (isClipboardSupported) {
      navigator.permissions.query({ name: 'clipboard-read' as PermissionName }).then(result => {
        setCanPaste(result.state === 'granted' || result.state === 'prompt');
      }).catch(() => {
        setCanPaste(false);
      });
    }
  }, [isClipboardSupported]);

  const isLoading = isBlockRelationLoading || (source.type === 'COLLECTION' ? isCollectionLoading : isQueryLoading);

  return (
    <div className="flex h-screen flex-col bg-white">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-grey-02 p-4">
        <div className="flex items-center gap-3">
          <Text variant="mediumTitle">{blockName || 'Power Tools'}</Text>
          {selectedRows.size > 0 && (
            <div className="flex items-center gap-2 rounded bg-action-bg px-3 py-1">
              <Text variant="metadata">{selectedRows.size} selected</Text>
              <button
                onClick={() => setSelectedRows(new Set())}
                className="text-grey-04 hover:text-text"
              >
                <Close />
              </button>
            </div>
          )}
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-2">
          {/* Add new entity button */}
          <button
            onClick={handleAddPlaceholder}
            className="flex items-center gap-1 rounded bg-action px-3 py-1.5 text-white hover:bg-action-hover"
            title="Add new entity"
          >
            <Plus />
            <Text variant="metadata">Add Entity</Text>
          </button>

          {/* Actions popover - only show when rows are selected */}
          {selectedRows.size > 0 && (
            <PowerToolsActionsPopover
              selectedCount={selectedRows.size}
              properties={properties}
              spaceId={spaceId}
              onOperation={handleBulkOperation}
              onCopy={isClipboardSupported ? handleCopy : undefined}
              onPaste={isClipboardSupported && canPaste ? handlePaste : undefined}
              canPaste={canPaste}
            />
          )}
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-hidden">
        {isLoading ? (
          <div className="flex h-full items-center justify-center">
            <Text variant="body" color="grey-04">
              Loading...
            </Text>
          </div>
        ) : (
          <PowerToolsTableVirtual
            rows={loadedRows}
            propertiesSchema={propertiesSchema}
            spaceId={spaceId}
            selectedRows={selectedRows}
            onSelectRow={handleSelectRow}
            onSelectAll={handleSelectAll}
            onSelectRange={handleSelectRange}
            hasNextPage={source.type === 'COLLECTION' ? false : (hasNextPage ?? false)}
            isFetchingNextPage={source.type === 'COLLECTION' ? false : isFetchingNextPage}
            fetchNextPage={source.type === 'COLLECTION' ? () => {} : fetchNextPage}
            totalDBRowCount={source.type === 'COLLECTION' ? collectionItems?.length ?? 0 : (typeof totalDBRowCount === 'number' ? totalDBRowCount : queriedEntities.length)}
            totalFetched={source.type === 'COLLECTION' ? collectionItems?.length ?? 0 : totalFetched}
            onChangeEntry={handleChangeEntry}
            onLinkEntry={handleLinkEntry}
            source={source}
          />
        )}
      </div>

    </div>
  );
}