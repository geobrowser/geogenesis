'use client';

import { SystemIds, Position } from '@graphprotocol/grc-20';
import { useRouter } from 'next/navigation';

import * as React from 'react';

import { useDataBlock } from '~/core/blocks/data/use-data-block';
import { filterStateToWhere, useDataBlockInstance } from '~/core/blocks/data/use-data-block';
import { useSource } from '~/core/blocks/data/use-source';
import { useFilters } from '~/core/blocks/data/use-filters';
import { useCollection } from '~/core/blocks/data/use-collection';
import { useQueryEntities, useQueryEntity, getValues, getRelations, useQueryEntitiesAsync, useRelations, useValues } from '~/core/sync/use-store';
import { useInfiniteQueryEntities } from '~/core/sync/use-infinite-query-entities';
import { useQueryClient, useQuery, keepPreviousData } from '@tanstack/react-query';
import { GeoStore } from '~/core/sync/store';
import { ID } from '~/core/id';
import { useProperties } from '~/core/hooks/use-properties';
import { useCreateProperty } from '~/core/hooks/use-create-property';
import { useCreateEntityWithFilters } from '~/core/hooks/use-create-entity-with-filters';
import { useEditableSpaces } from '~/core/hooks/use-editable-spaces';
import { useUserIsEditing } from '~/core/hooks/use-user-is-editing';
import { storage } from '~/core/sync/use-mutate';
import { Entities } from '~/core/utils/entity';
import { Cell, Entity, Property, Relation, Row } from '~/core/v2.types';
import { getSchemaFromTypeIds } from '~/core/database/entities';

import { Close } from '~/design-system/icons/close';
import { Plus } from '~/design-system/icons/plus';
import { Text } from '~/design-system/text';

import { BulkActionsBar } from './bulk-actions-bar';
import { BulkEditModal, BulkEditOperation } from './bulk-edit-modal';
import { PowerToolsTableVirtual } from './power-tools-table-virtual';
import { useClipboard } from './use-clipboard';

// Load all items at once for Power Tools (bulk operations need to see everything)
const INITIAL_BATCH_SIZE = 100;
const LOAD_MORE_BATCH_SIZE = 50;

export function PowerToolsView() {
  const router = useRouter();
  const { spaceId, relationId } = useDataBlockInstance();
  const [displayLimit, setDisplayLimit] = React.useState(INITIAL_BATCH_SIZE);
  const [selectedRows, setSelectedRows] = React.useState<Set<string>>(new Set());
  const [isSelectingAll, setIsSelectingAll] = React.useState(false);
  const [selectAllState, setSelectAllState] = React.useState<'none' | 'partial' | 'all'>('none');
  const [modalOpen, setModalOpen] = React.useState(false);
  const [currentOperation, setCurrentOperation] = React.useState<BulkEditOperation | null>(null);
  const [canPaste, setCanPaste] = React.useState(false);
  const queryClient = useQueryClient();

  const { copyRowsToClipboard, pasteRowsFromClipboard, isClipboardSupported, parseRelationUUIDs } = useClipboard();
  const { addPropertyToEntity } = useCreateProperty(spaceId);
  const { editableSpaceIds } = useEditableSpaces();
  const isEditing = useUserIsEditing(spaceId);

  // Hook for creating new entities with filters
  const { nextEntityId, onClick: createEntityWithTypes } = useCreateEntityWithFilters(spaceId);
  const [placeholderRowIds, setPlaceholderRowIds] = React.useState<string[]>([]);
  const [pendingEntityId, setPendingEntityId] = React.useState<string | null>(null);

  // Use standard data block hooks now that we have EditorProvider
  const { name: blockName } = useDataBlock();
  const { source } = useSource();
  const { filterState } = useFilters();
  const where = filterStateToWhere(filterState);
  
  const { entity: blockRelationEntity, isLoading: isBlockRelationLoading } = useQueryEntity({
    spaceId: spaceId,
    id: relationId,
  });

  // For collections, also query the collection entity to get ALL collection relations (not paginated)
  // This is needed for select all functionality
  const { entity: collectionEntity } = useQueryEntity({
    spaceId: spaceId,
    id: source.type === 'COLLECTION' ? source.value : undefined,
    enabled: source.type === 'COLLECTION',
  });

  // Get collection data with progressive pagination
  // useCollection already fetches entities via useQueryEntities which merges local + remote data
  const { collectionItems, collectionRelations, isLoading: isCollectionLoading, collectionLength } = useCollection({
    first: displayLimit, // Pass the display limit to control server-side pagination
    skip: 0,
  });

  // Get collection entity IDs from the collection relations
  const collectionEntityIds = React.useMemo(() => {
    if (source.type !== 'COLLECTION') return [];
    return collectionRelations.map(r => r.toEntity.id);
  }, [source.type, collectionRelations]);
  
  // For queries, use infinite scroll to handle large datasets
  const {
    entities: queriedEntities,
    hasMore: queryHasMore,
    loadMore: queryLoadMore,
    isLoading: isQueryLoading,
    isLoadingMore: isQueryLoadingMore,
  } = useInfiniteQueryEntities({
    where: where,
    enabled: source.type === 'SPACES' || source.type === 'GEO',
  });

  // Create a placeholder row for adding new entities
  const makePlaceholderRow = React.useCallback((entityId: string, properties: Property[]): Row => {
    const columns: Record<string, Cell> = {};

    properties.forEach(property => {
      columns[property.id] = {
        slotId: `${entityId}-${property.id}`,
        propertyId: property.id,
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
  const entitiesToRows = React.useCallback((entities: Entity[], propertyIds: string[], collectionRels: Relation[] = [], storeRelations: Relation[] = [], storeValues: any[] = []): Row[] => {
    return entities.map(entity => {
      const columns: Record<string, Cell> = {};
      
      propertyIds.forEach(propertyId => {

        const cell: Cell = {
          slotId: propertyId,
          propertyId: propertyId,
          name: null,
        };
        
        if (propertyId === SystemIds.NAME_PROPERTY) {
          // Check store values first for local/unpublished name changes
          const nameValues = storeValues.filter(v => v.entity.id === entity.id && v.property.id === SystemIds.NAME_PROPERTY);
          cell.name = nameValues.length > 0 ? nameValues[0].value : entity.name;
          cell.description = entity.description;
          cell.image = Entities.cover(entity.relations) ?? Entities.avatar(entity.relations) ?? null;

          const collectionRelation = collectionRels.find(r => r.toEntity.id === entity.id);
          if (collectionRelation) {
            cell.relationId = collectionRelation.id;
            cell.collectionId = collectionRelation.fromEntity.id;
            // Use toSpaceId if available, otherwise fall back to entity's primary space
            cell.space = collectionRelation.toSpaceId ?? entity.spaces?.[0];
            cell.verified = collectionRelation.verified;
          } else {
            // For non-collection entities, determine space from entity data
            // Use the entity's primary space (spaces[0])
            // This determines where edits would actually go
            cell.space = entity.spaces?.[0] ?? spaceId;
          }
        } else {
          // Get values from the passed store data (includes local/unpublished changes)
          const entityValues = storeValues.filter(v => v.entity.id === entity.id && v.property.id === propertyId);

          // Check if this is a relation property
          const currentProperty = properties.find(p => p.id === propertyId);
          const isRelationProperty = currentProperty?.dataType === 'RELATION';

          // For relation properties, ignore any values and only process relations
          // For non-relation properties or unknown properties, check values first
          if (!isRelationProperty && entityValues.length > 0) {
            // Use the most recent value (they should be the same for a single property)
            const value = entityValues[0];
            (cell as any).value = value.value;
            (cell as any).dataType = value.property.dataType;
          }

          // Always check for relations (for relation properties or when no values exist)
          // This handles both known relation properties and properties we don't have schema for yet
          if (isRelationProperty || entityValues.length === 0 || (entityValues.length > 0 && entityValues[0].value === '')) {
            // Get relations from the passed store data (includes local/unpublished changes)
            const entityRelations = storeRelations.filter(r => r.fromEntity.id === entity.id && r.type.id === propertyId);

            if (entityRelations.length === 1) {
              // Single relation - use existing structure for backward compatibility
              const relation = entityRelations[0];
              (cell as any).relation = {
                id: relation.toEntity.id,
                relationId: relation.id,
                relationEntityId: relation.entityId,
                name: relation.toEntity.name,
                spaceId: relation.spaceId,
                toSpaceId: relation.toSpaceId,
              };
              // Clear any empty value if this is a relation property
              if (isRelationProperty && (cell as any).value === '') {
                delete (cell as any).value;
                delete (cell as any).dataType;
              }
            } else if (entityRelations.length > 1) {
              // Multiple relations - store all of them
              (cell as any).relations = entityRelations.map(r => ({
                id: r.toEntity.id,
                relationId: r.id,
                relationEntityId: r.entityId,
                name: r.toEntity.name,
                spaceId: r.spaceId,
                toSpaceId: r.toSpaceId,
              }));
              // For text display, show first relation name
              (cell as any).relation = {
                id: entityRelations[0].toEntity.id,
                relationId: entityRelations[0].id,
                relationEntityId: entityRelations[0].entityId,
                name: entityRelations[0].toEntity.name,
                spaceId: entityRelations[0].spaceId,
                toSpaceId: entityRelations[0].toSpaceId,
              };
              // Clear any empty value if this is a relation property
              if (isRelationProperty && (cell as any).value === '') {
                delete (cell as any).value;
                delete (cell as any).dataType;
              }
            }
          }
        }
        
        columns[propertyId] = cell;
      });
      
      return {
        entityId: entity.id,
        columns,
      };
    });
  }, []);
  
  // NOTE: We intentionally do NOT prepend locally created entities for non-collection sources.
  // The data block uses useQueryEntities which handles filtering server-side.
  // Prepending local entities would show entities that don't match the filter criteria.

  // Get current entity IDs for reactive store queries
  const currentEntityIds = React.useMemo(() => {
    if (source.type === 'COLLECTION') {
      // Use collectionEntityIds which includes local relations (newly created entities)
      return collectionEntityIds;
    } else if ((source.type === 'GEO' || source.type === 'SPACES') && queriedEntities) {
      // Use only queried entities - they are already filtered by the server
      return queriedEntities.map(e => e.id);
    }
    return [];
  }, [source.type, collectionEntityIds, queriedEntities]);

  // Get all relations for current entities from store (includes local changes)
  const allRelations = useRelations({
    selector: r => currentEntityIds.includes(r.fromEntity.id) && !r.isDeleted
  });

  // Get all values for current entities from store (includes local changes)
  const allValues = useValues({
    selector: v => currentEntityIds.includes(v.entity.id) && !v.isDeleted
  });


  // Get ALL properties (not just shown ones) - includes store properties
  const allPropertyIds = React.useMemo(() => {
    const ids = new Set<string>();
    ids.add(SystemIds.NAME_PROPERTY);

    // Add properties from block relation
    const propertiesRelations = blockRelationEntity?.relations.filter(
      r => r.type.id === SystemIds.PROPERTIES || r.type.id === SystemIds.SHOWN_COLUMNS
    ) || [];

    propertiesRelations.forEach(pr => {
      ids.add(pr.toEntity.id);
    });

    // Add all properties found in entities
    const sampleEntities = source.type === 'COLLECTION' ? collectionItems : queriedEntities;
    sampleEntities?.forEach(entity => {
      entity.values?.forEach(v => ids.add(v.property.id));
      entity.relations?.forEach(r => ids.add(r.type.id));
    });

    // Add properties from store relations (includes local/unpublished relations)
    allRelations.forEach(r => {
      if (currentEntityIds.includes(r.fromEntity.id)) {
        ids.add(r.type.id);
      }
    });

    // Add properties from store values (includes local/unpublished values)
    allValues.forEach(v => {
      if (currentEntityIds.includes(v.entity.id)) {
        ids.add(v.property.id);
      }
    });

    return Array.from(ids);
  }, [collectionItems, queriedEntities, blockRelationEntity?.relations, source.type, allRelations, allValues, currentEntityIds]);

  // Get all available entities and determine hasMore/loadMore based on source type
  const { allAvailableEntities, hasMore, loadMore } = React.useMemo(() => {
    if (source.type === 'COLLECTION' && collectionItems) {
      // For collections, check if there are any local entity IDs in collection relations
      // that aren't yet in collectionItems
      const existingEntityIds = new Set(collectionItems.map(e => e.id));
      const missingEntityIds = collectionEntityIds.filter(id => !existingEntityIds.has(id));

      // If there are missing entities, we need to include placeholder entities for them
      const placeholderEntities = missingEntityIds.map(id => ({
        id,
        name: null,
        description: null,
        values: [],
        relations: [],
        spaces: [spaceId],
        types: [],
      }));

      return {
        allAvailableEntities: [...placeholderEntities, ...collectionItems],
        hasMore: displayLimit < (collectionLength || 0),
        loadMore: () => {
          if (displayLimit < (collectionLength || 0)) {
            setDisplayLimit(prev => prev + LOAD_MORE_BATCH_SIZE);
          }
        },
      };
    } else if ((source.type === 'GEO' || source.type === 'SPACES')) {
      // For queries, use only the filtered entities from the server
      // Don't prepend local entities - they would bypass filter criteria
      return {
        allAvailableEntities: queriedEntities || [],
        hasMore: queryHasMore,
        loadMore: queryLoadMore,
      };
    }
    return {
      allAvailableEntities: [],
      hasMore: false,
      loadMore: () => {},
    };
  }, [collectionItems, queriedEntities, source.type, displayLimit, queryHasMore, queryLoadMore, collectionLength, collectionEntityIds, spaceId]);

  // Get all unique type IDs from all entities to fetch schema properties
  const allTypeIds = React.useMemo(() => {
    const typeIds = new Set<string>();

    // Get types from available entities
    allAvailableEntities.forEach(entity => {
      entity.types?.forEach(type => {
        typeIds.add(type.id);
      });
    });

    // Get types from store relations (includes local changes)
    allRelations.forEach(r => {
      if (r.type.id === SystemIds.TYPES_PROPERTY && currentEntityIds.includes(r.fromEntity.id)) {
        typeIds.add(r.toEntity.id);
      }
    });

    return Array.from(typeIds);
  }, [allAvailableEntities, allRelations, currentEntityIds]);

  // Fetch schema properties for all entity types
  const { data: schemaProperties } = useQuery({
    enabled: allTypeIds.length > 0,
    queryKey: ['power-tools-schema', allTypeIds],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      return await getSchemaFromTypeIds(allTypeIds);
    },
  });

  // Merge schema properties with existing property IDs to show all columns from schemas
  const allPropertyIdsWithSchema = React.useMemo(() => {
    const ids = new Set(allPropertyIds);

    // Add properties from entity type schemas (shows all schema columns even without values)
    schemaProperties?.forEach(property => {
      ids.add(property.id);
    });

    return Array.from(ids);
  }, [allPropertyIds, schemaProperties]);

  // Get properties schema using merged property IDs (includes schema properties)
  const propertiesSchema = useProperties(allPropertyIdsWithSchema);
  const properties = React.useMemo(() => {
    return propertiesSchema ? Object.values(propertiesSchema) : [];
  }, [propertiesSchema]);

  // Clear pending ID once the actual entity appears in the data
  React.useEffect(() => {
    if (pendingEntityId) {
      // Check in all available entities
      if (allAvailableEntities.find(e => e.id === pendingEntityId)) {
        // Entity appeared, remove the placeholder
        setPendingEntityId(null);
        setPlaceholderRowIds(prev => prev.filter(id => id !== pendingEntityId));
      } else {
        // Fallback: clear pending state after 3 seconds if entity doesn't appear
        const timeout = setTimeout(() => {
          setPendingEntityId(null);
          setPlaceholderRowIds(prev => prev.filter(id => id !== pendingEntityId));
        }, 3000);

        return () => clearTimeout(timeout);
      }
    }
  }, [pendingEntityId, allAvailableEntities]);

  // Build rows for display
  const loadedRows = React.useMemo(() => {
    // Both collections and queries now use all available entities
    // Server-side pagination is handled by the respective hooks
    const entities = allAvailableEntities;

    const rows = entities.length === 0 ? [] : entitiesToRows(
      entities,
      allPropertyIdsWithSchema,
      source.type === 'COLLECTION' ? collectionRelations : [],
      allRelations,
      allValues
    );

    // Create placeholder rows for all placeholder IDs that don't already exist in rows
    const existingRowIds = new Set(rows.map(r => r.entityId));
    const placeholderRows = placeholderRowIds
      .filter(id => !existingRowIds.has(id))
      .map(id => makePlaceholderRow(id, properties));

    // Include pending entity ID if it's not in rows yet
    if (pendingEntityId && !existingRowIds.has(pendingEntityId) && !placeholderRowIds.includes(pendingEntityId)) {
      placeholderRows.push(makePlaceholderRow(pendingEntityId, properties));
    }

    return placeholderRows.length > 0
      ? [...placeholderRows, ...rows]
      : rows;
  }, [allAvailableEntities, allPropertyIdsWithSchema, collectionRelations, entitiesToRows, source.type, allRelations, allValues, placeholderRowIds, pendingEntityId, makePlaceholderRow, properties]);

  // Compute which entities are editable based on their space
  const editableEntityIds = React.useMemo(() => {
    const editable = new Set<string>();

    loadedRows.forEach(row => {
      // Placeholder rows are always editable (they're being created in current space)
      if (row.placeholder) {
        editable.add(row.entityId);
        return;
      }

      // Get the entity's space from the name column
      const nameCell = row.columns[SystemIds.NAME_PROPERTY];
      const entitySpaceId = nameCell?.space ?? spaceId;

      // Check if user can edit this space
      if (editableSpaceIds.has(entitySpaceId)) {
        editable.add(row.entityId);
      }
    });

    return editable;
  }, [loadedRows, editableSpaceIds, spaceId]);

  // Compute editable selected count
  const editableSelectedCount = React.useMemo(() => {
    return Array.from(selectedRows).filter(id => editableEntityIds.has(id)).length;
  }, [selectedRows, editableEntityIds]);

  // Selection handlers
  const handleSelectRow = React.useCallback((entityId: string, selected: boolean) => {
    setSelectedRows(prev => {
      const newSet = new Set(prev);
      if (selected) {
        newSet.add(entityId);
      } else {
        newSet.delete(entityId);
      }
      return newSet;
    });
  }, []);
  
  const queryEntitiesAsync = useQueryEntitiesAsync();

  const handleSelectAll = React.useCallback(async (selected: boolean) => {
    if (selected) {
      // Optimistic update: immediately update UI
      setIsSelectingAll(true);
      setSelectAllState('all');

      // For collections, get ALL entity IDs from the collection entity's relations (not paginated)
      if (source.type === 'COLLECTION') {
        // Get all collection item relations from the collection entity
        const allCollectionRelations = collectionEntity?.relations.filter(
          r => r.fromEntity.id === source.value && r.type.id === SystemIds.COLLECTION_ITEM_RELATION_TYPE
        ) ?? [];
        const allEntityIds = allCollectionRelations.map(r => r.toEntity.id);
        setSelectedRows(new Set(allEntityIds));
        setIsSelectingAll(false);
      } else if (source.type === 'GEO' || source.type === 'SPACES') {
        // For queries, we need to fetch ALL entities, not just loaded ones
        try {
          // Fetch with a very large limit to get all entities
          const allEntities = await queryEntitiesAsync({
            where,
            first: 10000, // Large limit to get all
            skip: 0,
          });
          setSelectedRows(new Set(allEntities.map(entity => entity.id)));
        } catch (error) {
          console.error('Failed to fetch all entities for selection:', error);
          // Revert optimistic update on error
          setSelectAllState('none');
          // Fallback to currently loaded rows
          setSelectedRows(new Set(loadedRows.map(row => row.entityId)));
          setSelectAllState('partial');
        } finally {
          setIsSelectingAll(false);
        }
      }
    } else {
      // Clear selection
      setSelectedRows(new Set());
      setSelectAllState('none');
    }
  }, [loadedRows, source, collectionEntity, where, queryEntitiesAsync]);
  
  const handleSelectRange = React.useCallback((startIndex: number, endIndex: number, selected: boolean) => {
    setSelectedRows(prev => {
      const newSet = new Set(prev);
      for (let i = startIndex; i <= endIndex; i++) {
        const row = loadedRows[i];
        if (row) {
          if (selected) {
            newSet.add(row.entityId);
          } else {
            newSet.delete(row.entityId);
          }
        }
      }
      return newSet;
    });
  }, [loadedRows]);
  
  // Bulk action handlers
  const handleClearSelection = React.useCallback(() => {
    setSelectedRows(new Set());
  }, []);
  
  const handleAddValues = React.useCallback((
    propertyId: string,
    value?: string,
    _entityIds?: string[],
    _entityData?: Array<{ id: string; name: string | null }>
  ) => {
    if (!value?.trim()) return;

    // Only apply to editable entities
    const selectedEntityIds = Array.from(selectedRows).filter(id => editableEntityIds.has(id));
    const property = propertiesSchema?.[propertyId];

    if (!property) {
      console.error('Property not found:', propertyId);
      return;
    }

    if (selectedEntityIds.length === 0) {
      console.warn('No editable entities selected');
      return;
    }

    selectedEntityIds.forEach(entityId => {
      storage.values.set({
        id: ID.createValueId({ entityId, propertyId, spaceId }),
        entity: { id: entityId, name: null },
        property,
        value: value.trim(),
        spaceId,
        isLocal: true,
      });
    });

    // Invalidate query cache and clear selection
    queryClient.invalidateQueries({
      queryKey: GeoStore.queryKeys(where),
    });
    setSelectedRows(new Set());
  }, [selectedRows, editableEntityIds, propertiesSchema, spaceId, queryClient, where]);

  const handleRemoveValues = React.useCallback((
    propertyId: string,
    value?: string,
    _entityIds?: string[],
    _entityData?: Array<{ id: string; name: string | null }>
  ) => {
    // Only apply to editable entities
    const selectedEntityIds = Array.from(selectedRows).filter(id => editableEntityIds.has(id));

    if (selectedEntityIds.length === 0) {
      console.warn('No editable entities selected');
      return;
    }

    selectedEntityIds.forEach(entityId => {
      const values = getValues({
        selector: v => v.entity.id === entityId && v.property.id === propertyId && !v.isDeleted
      });

      values.forEach(v => {
        // If a specific value was provided, only remove matching values
        if (value?.trim() && v.value !== value.trim()) {
          return;
        }
        storage.values.delete(v);
      });
    });

    // Invalidate query cache and clear selection
    queryClient.invalidateQueries({
      queryKey: GeoStore.queryKeys(where),
    });
    setSelectedRows(new Set());
  }, [selectedRows, editableEntityIds, queryClient, where]);

  const handleAddRelations = React.useCallback((
    propertyId: string,
    value?: string,
    entityIds?: string[],
    entityData?: Array<{ id: string; name: string | null }>
  ) => {
    // Only apply to editable entities
    const selectedEntityIds = Array.from(selectedRows).filter(id => editableEntityIds.has(id));
    const property = propertiesSchema?.[propertyId];

    if (!property) {
      console.error('Property not found:', propertyId);
      return;
    }

    if (selectedEntityIds.length === 0) {
      console.warn('No editable entities selected');
      return;
    }

    // Normalize input: convert single entity to array format
    let entitiesToLink: Array<{ id: string; name: string | null }>;

    if (entityData && entityData.length > 0) {
      // Multi-select case: use entityData as-is
      entitiesToLink = entityData;
    } else {
      // Single entity case: convert to array format
      const targetEntityId = entityIds?.[0] || value?.trim();
      if (!targetEntityId) return;
      entitiesToLink = [{ id: targetEntityId, name: null }];
    }

    // Create relations for all selected entities
    selectedEntityIds.forEach(fromEntityId => {
      entitiesToLink.forEach(relationEntity => {
        const newRelation = {
          id: ID.createEntityId(),
          entityId: ID.createEntityId(),
          type: { id: propertyId, name: property.name },
          fromEntity: { id: fromEntityId, name: null },
          toEntity: {
            id: relationEntity.id,
            name: relationEntity.name,
            value: relationEntity.id
          },
          renderableType: 'RELATION' as const,
          spaceId,
          position: Position.generate(),
          verified: false,
          isLocal: true,
        };

        storage.relations.set(newRelation);
      });
    });

    // Invalidate query cache and clear selection
    queryClient.invalidateQueries({
      queryKey: GeoStore.queryKeys(where),
    });
    setSelectedRows(new Set());
  }, [selectedRows, editableEntityIds, propertiesSchema, spaceId, queryClient, where]);

  const handleRemoveRelations = React.useCallback((
    propertyId: string,
    value?: string,
    entityIds?: string[],
    entityData?: Array<{ id: string; name: string | null }>
  ) => {
    // Only apply to editable entities
    const selectedEntityIds = Array.from(selectedRows).filter(id => editableEntityIds.has(id));

    if (selectedEntityIds.length === 0) {
      console.warn('No editable entities selected');
      return;
    }

    // Normalize input: extract entity IDs to remove (or undefined to remove all)
    let targetEntityIdsToRemove: string[] | undefined;

    if (entityData && entityData.length > 0) {
      // Multi-select case: extract IDs from entityData
      targetEntityIdsToRemove = entityData.map(e => e.id);
    } else if (entityIds && entityIds.length > 0) {
      // Array case: use entityIds as-is
      targetEntityIdsToRemove = entityIds;
    } else if (value?.trim()) {
      // Single entity case: convert to array
      targetEntityIdsToRemove = [value.trim()];
    }
    // If undefined, remove all relations for this property

    selectedEntityIds.forEach(fromEntityId => {
      const relations = getRelations({
        selector: r => r.fromEntity.id === fromEntityId && r.type.id === propertyId && !r.isDeleted
      });

      relations.forEach(r => {
        // If specific relation targets were provided, only remove matching relations
        if (targetEntityIdsToRemove && !targetEntityIdsToRemove.includes(r.toEntity.id)) {
          return;
        }
        storage.relations.delete(r);
      });
    });

    // Invalidate query cache and clear selection
    queryClient.invalidateQueries({
      queryKey: GeoStore.queryKeys(where),
    });
    setSelectedRows(new Set());
  }, [selectedRows, editableEntityIds, queryClient, where]);

  const handleAddProperty = React.useCallback((propertyId: string, propertyName: string) => {
    // Only apply to editable entities
    const selectedEntityIds = Array.from(selectedRows).filter(id => editableEntityIds.has(id));

    if (selectedEntityIds.length === 0) {
      console.warn('No editable entities selected for property addition');
      return;
    }

    // First, add the property to the block's PROPERTIES relation so it shows up in the table
    // Check if the property is already in the block's properties
    const isPropertyAlreadyShown = blockRelationEntity?.relations.some(
      r => (r.type.id === SystemIds.PROPERTIES || r.type.id === SystemIds.SHOWN_COLUMNS) &&
           r.toEntity.id === propertyId
    );

    if (!isPropertyAlreadyShown && relationId) {
      // Add the property to the block's PROPERTIES relation
      storage.relations.set({
        id: ID.createEntityId(),
        entityId: ID.createEntityId(),
        spaceId: spaceId,
        position: Position.generate(),
        renderableType: 'RELATION',
        type: {
          id: SystemIds.PROPERTIES,
          name: 'Properties',
        },
        fromEntity: {
          id: relationId,
          name: null,
        },
        toEntity: {
          id: propertyId,
          name: propertyName,
          value: propertyId,
        },
        verified: false,
        isLocal: true,
      });
    }

    // Add the property to each selected entity
    // This adds a placeholder value/relation for the property on each entity
    selectedEntityIds.forEach(entityId => {
      // Simply adding the property relation to make it appear
      // Users will then need to fill in actual values later
      addPropertyToEntity({
        entityId,
        propertyId,
        propertyName,
      });
    });

    // Invalidate query cache to refresh the table
    queryClient.invalidateQueries({
      queryKey: GeoStore.queryKeys(where),
    });

    // Clear selection after adding property
    setSelectedRows(new Set());
  }, [selectedRows, editableEntityIds, blockRelationEntity, relationId, spaceId, addPropertyToEntity, queryClient, where]);

  // Copy/Paste handlers
  const handleCopyRows = React.useCallback(async () => {
    if (selectedRows.size === 0) return;

    const selectedRowData = loadedRows.filter(row => selectedRows.has(row.entityId));
    const success = await copyRowsToClipboard(selectedRowData, properties);

    if (success) {
      // You could show a toast notification here
    }
  }, [selectedRows, loadedRows, properties, copyRowsToClipboard]);

  const handlePasteRows = React.useCallback(async () => {
    const clipboardData = await pasteRowsFromClipboard();
    if (!clipboardData) return;

    try {
      // Map headers to property IDs
      const headerToPropertyMap = new Map<string, Property>();
      clipboardData.headers.forEach(header => {
        const property = properties.find(p =>
          (p.id === SystemIds.NAME_PROPERTY && header === 'Name') ||
          (p.name === header) ||
          (p.id === header)
        );
        if (property) {
          headerToPropertyMap.set(header, property);
        }
      });

      // First pass: collect all UUIDs we need to fetch
      const allUUIDs = new Set<string>();
      clipboardData.rows.forEach(rowData => {
        rowData.forEach((cellValue: string, index: number) => {
          const header = clipboardData.headers[index];
          const property = headerToPropertyMap.get(header);
          if (!property || !cellValue.trim() || property.id === SystemIds.NAME_PROPERTY) return;

          const relationUUIDs = parseRelationUUIDs(cellValue);
          relationUUIDs.forEach(uuid => allUUIDs.add(uuid));
        });
      });

      // Fetch all entities for the UUIDs to get their names
      const uuidToNameMap = new Map<string, string | null>();
      if (allUUIDs.size > 0) {
        try {
          const fetchedEntities = await queryEntitiesAsync({
            where: {
              id: {
                in: Array.from(allUUIDs),
              },
            },
            first: allUUIDs.size,
            skip: 0,
          });
          fetchedEntities.forEach(entity => {
            uuidToNameMap.set(entity.id, entity.name);
          });
        } catch (error) {
          console.warn('Failed to fetch entity names for UUIDs:', error);
          // Continue without names - fallback to UUID display
        }
      }

      const newEntityIds: string[] = [];

      // Process each row with unified UUID detection logic
      for (const rowData of clipboardData.rows) {
        const newEntityId = ID.createEntityId();
        newEntityIds.push(newEntityId);

        // Process each cell in the row
        rowData.forEach((cellValue: string, index: number) => {
          const header = clipboardData.headers[index];
          const property = headerToPropertyMap.get(header);

          if (!property || !cellValue.trim()) return;

          if (property.id === SystemIds.NAME_PROPERTY) {
            // Set the entity name
            storage.values.set({
              id: ID.createValueId({
                entityId: newEntityId,
                propertyId: SystemIds.NAME_PROPERTY,
                spaceId,
              }),
              entity: {
                id: newEntityId,
                name: cellValue.trim(),
              },
              property: {
                id: SystemIds.NAME_PROPERTY,
                name: 'Name',
                dataType: 'TEXT',
              },
              spaceId,
              value: cellValue.trim(),
              isLocal: true,
            });
          } else {
            // Try to detect UUIDs for relation properties
            const relationUUIDs = parseRelationUUIDs(cellValue);

            if (relationUUIDs.length > 0) {
              // Create relations for detected UUIDs
              for (const uuid of relationUUIDs) {
                storage.relations.set({
                  id: ID.createEntityId(),
                  entityId: newEntityId,
                  spaceId,
                  position: Position.generate(),
                  renderableType: 'RELATION',
                  verified: false,
                  type: {
                    id: property.id,
                    name: property.name || property.id,
                  },
                  fromEntity: {
                    id: newEntityId,
                    name: null,
                  },
                  toEntity: {
                    id: uuid,
                    name: uuidToNameMap.get(uuid) || null,
                    value: uuid,
                  },
                  isLocal: true,
                });
              }
            } else {
              // No UUIDs detected, treat as a regular value
              storage.values.set({
                id: ID.createValueId({
                  entityId: newEntityId,
                  propertyId: property.id,
                  spaceId,
                }),
                entity: {
                  id: newEntityId,
                  name: null,
                },
                property,
                spaceId,
                value: cellValue.trim(),
                isLocal: true,
              });
            }
          }
        });
      }

      // If this is a collection, add all new entities to the collection
      if (source.type === 'COLLECTION') {
        for (const newEntityId of newEntityIds) {
          storage.relations.set({
            id: ID.createEntityId(),
            entityId: ID.createEntityId(),
            spaceId,
            toSpaceId: spaceId, // New entity is in the current space
            position: Position.generate(),
            renderableType: 'RELATION',
            verified: false,
            type: {
              id: SystemIds.COLLECTION_ITEM_RELATION_TYPE,
              name: 'Collection Item',
            },
            fromEntity: {
              id: source.value, // Collection ID
              name: null,
            },
            toEntity: {
              id: newEntityId,
              name: null,
              value: newEntityId,
            },
            isLocal: true,
          });
        }
      }

      // For queries (non-collection sources), invalidate the query cache to refresh results
      if (source.type !== 'COLLECTION') {
        // Invalidate the entities query to refresh and show new entities
        await queryClient.invalidateQueries({
          queryKey: GeoStore.queryKeys(where),
        });
      }

      // Clear selection after successful paste
      setSelectedRows(new Set());

    } catch (error) {
      console.error('Failed to create entities from pasted data:', error);
      alert('Failed to paste data. Please check the format and try again.');
    }
  }, [pasteRowsFromClipboard, properties, spaceId, source, where, parseRelationUUIDs, queryClient, queryEntitiesAsync]);

  // Check clipboard permissions and update canPaste state
  React.useEffect(() => {
    const checkClipboard = async () => {
      if (!isClipboardSupported) {
        setCanPaste(false);
        return;
      }

      try {
        const text = await navigator.clipboard.readText();
        setCanPaste(!!text.trim());
      } catch {
        setCanPaste(false);
      }
    };

    // Check initially
    checkClipboard();

    // Check when window gains focus (user might have copied something)
    const handleFocus = () => checkClipboard();
    window.addEventListener('focus', handleFocus);

    return () => window.removeEventListener('focus', handleFocus);
  }, [isClipboardSupported]);

  // Keyboard shortcuts
  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isCtrlOrCmd = event.ctrlKey || event.metaKey;

      if (isCtrlOrCmd && event.key === 'c' && selectedRows.size > 0) {
        event.preventDefault();
        handleCopyRows();
      } else if (isCtrlOrCmd && event.key === 'v' && canPaste) {
        event.preventDefault();
        handlePasteRows();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [selectedRows.size, canPaste, handleCopyRows, handlePasteRows]);
  
  // Modal handlers
  const handleModalClose = React.useCallback(() => {
    setModalOpen(false);
    setCurrentOperation(null);
  }, []);
  
  const handleModalConfirm = React.useCallback((propertyId: string, value: string, entityIds?: string[]) => {
    if (!currentOperation) return;

    const selectedEntityIds = Array.from(selectedRows);
    const property = propertiesSchema?.[propertyId];

    if (!property) {
      console.error('Property not found:', propertyId);
      return;
    }

    switch (currentOperation) {
      case 'add-values': {
        if (!value.trim()) return;

        selectedEntityIds.forEach(entityId => {
          storage.values.set({
            id: ID.createValueId({ entityId, propertyId, spaceId }),
            entity: { id: entityId, name: null },
            property,
            value: value.trim(),
            spaceId,
            isLocal: true,
          });
        });
        break;
      }

      case 'remove-values': {
        selectedEntityIds.forEach(entityId => {
          const values = getValues({
            selector: v => v.entity.id === entityId && v.property.id === propertyId && !v.isDeleted
          });

          values.forEach(v => {
            // If a specific value was provided, only remove matching values
            if (value.trim() && v.value !== value.trim()) {
              return;
            }
            storage.values.delete(v);
          });
        });
        break;
      }

      case 'add-relations': {
        // Normalize input: convert single entity to array format
        let entitiesToLink: string[];

        if (entityIds && entityIds.length > 0) {
          entitiesToLink = entityIds;
        } else if (value.trim()) {
          entitiesToLink = [value.trim()];
        } else {
          return;
        }

        selectedEntityIds.forEach(fromEntityId => {
          entitiesToLink.forEach(targetEntityId => {
            const newRelation = {
              id: ID.createEntityId(),
              entityId: ID.createEntityId(),
              type: { id: propertyId, name: property.name },
              fromEntity: { id: fromEntityId, name: null },
              toEntity: { id: targetEntityId, name: null, value: targetEntityId },
              renderableType: 'RELATION' as const,
              spaceId,
              position: Position.generate(),
              verified: false,
              isLocal: true,
            };
            storage.relations.set(newRelation);
          });
        });
        break;
      }

      case 'remove-relations': {
        // Normalize input: extract entity IDs to remove (or undefined to remove all)
        let targetEntityIdsToRemove: string[] | undefined;

        if (entityIds && entityIds.length > 0) {
          targetEntityIdsToRemove = entityIds;
        } else if (value.trim()) {
          targetEntityIdsToRemove = [value.trim()];
        }

        selectedEntityIds.forEach(fromEntityId => {
          const relations = getRelations({
            selector: r => r.fromEntity.id === fromEntityId && r.type.id === propertyId && !r.isDeleted
          });

          relations.forEach(r => {
            // If specific relation targets were provided, only remove matching relations
            if (targetEntityIdsToRemove && !targetEntityIdsToRemove.includes(r.toEntity.id)) {
              return;
            }
            storage.relations.delete(r);
          });
        });
        break;
      }

      default:
        console.error('Unknown operation:', currentOperation);
    }

    // Invalidate query cache to refresh data and show local changes
    queryClient.invalidateQueries({
      queryKey: GeoStore.queryKeys(where),
    });

    // Clear selection after operation
    setSelectedRows(new Set());
  }, [currentOperation, selectedRows, propertiesSchema, spaceId, queryClient, where]);

  const handleAddPropertyToEntities = React.useCallback((propertyId: string, propertyName: string) => {
    const selectedEntityIds = Array.from(selectedRows);

    if (selectedEntityIds.length === 0) {
      console.warn('No entities selected for property addition');
      return;
    }

    // First, add the property to the block's PROPERTIES relation so it shows up in the table
    // Check if the property is already in the block's properties
    const isPropertyAlreadyShown = blockRelationEntity?.relations.some(
      r => (r.type.id === SystemIds.PROPERTIES || r.type.id === SystemIds.SHOWN_COLUMNS) &&
           r.toEntity.id === propertyId
    );

    if (!isPropertyAlreadyShown && relationId) {
      // Add the property to the block's PROPERTIES relation
      storage.relations.set({
        id: ID.createEntityId(),
        entityId: ID.createEntityId(),
        spaceId: spaceId,
        position: Position.generate(),
        renderableType: 'RELATION',
        type: {
          id: SystemIds.PROPERTIES,
          name: 'Properties',
        },
        fromEntity: {
          id: relationId,
          name: blockRelationEntity?.name ?? null,
        },
        toEntity: {
          id: propertyId,
          name: propertyName,
          value: propertyId,
        },
      });
    }

    // Then add the property to each selected entity
    selectedEntityIds.forEach(entityId => {
      addPropertyToEntity({
        entityId,
        propertyId,
        propertyName,
      });
    });

    // Invalidate query cache to refresh data and show new property
    queryClient.invalidateQueries({
      queryKey: GeoStore.queryKeys(where),
    });

    // Clear selection after operation
    setSelectedRows(new Set());
  }, [selectedRows, addPropertyToEntity, queryClient, where, blockRelationEntity, relationId, spaceId]);
  
  const handleClose = () => {
    router.back();
  };

  // Handler for showing placeholder row (entity creation happens when user types)
  const handleAddPlaceholder = React.useCallback(() => {
    const newPlaceholderId = ID.createEntityId();
    setPlaceholderRowIds(prev => [...prev, newPlaceholderId]);
  }, []);

  // Handler for cell changes - creates entities when placeholder row is edited
  const handleChangeEntry = React.useCallback((context: any, event: any) => {
    // Check if this is a placeholder row
    const isPlaceholder = placeholderRowIds.includes(context.entityId);

    if (isPlaceholder) {
      // Handle cancel event
      if (event.type === 'Cancel') {
        setPlaceholderRowIds(prev => prev.filter(id => id !== context.entityId));
        setPendingEntityId(null);
        return;
      }

      // Remove this placeholder from the list
      setPlaceholderRowIds(prev => prev.filter(id => id !== context.entityId));

      // Only create entity if not using Find (for collections)
      if (event.type !== 'Find') {
        const maybeName = event.type === 'Create' ? event.data.name : undefined;

        // Mark the nextEntityId as pending (the entity will be created with this ID)
        setPendingEntityId(nextEntityId);

        // Create the entity with any active filters
        createEntityWithTypes({
          name: maybeName,
          filters: filterState,
        });

        // If this is a collection, add the new entity to the collection
        // Use nextEntityId since that's what createEntityWithTypes uses
        if (source.type === 'COLLECTION' && source.value) {
          storage.relations.set({
            id: ID.createEntityId(),
            entityId: ID.createEntityId(),
            spaceId,
            toSpaceId: spaceId, // New entity is in the current space
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
              id: nextEntityId,
              name: null,
              value: nextEntityId,
            },
            isLocal: true,
          });
        }
      }
    }

    // Invalidate query cache to refresh data
    queryClient.invalidateQueries({
      queryKey: GeoStore.queryKeys(where),
    });
  }, [placeholderRowIds, nextEntityId, createEntityWithTypes, filterState, source, spaceId, queryClient, where]);

  // Handler for linking entries (used for collection items)
  const handleLinkEntry = React.useCallback((id: string, to: {id: string; name: string | null; space?: string; verified?: boolean}) => {
    const relation = getRelations({
      selector: r => r.spaceId === spaceId && r.id === id
    })[0];

    if (relation) {
      storage.relations.update(relation, draft => {
        draft.toSpaceId = to.space;
        draft.verified = to.verified;
      });
    }
  }, [spaceId]);

  const isLoading = isBlockRelationLoading || (source.type === 'COLLECTION' ? isCollectionLoading : isQueryLoading);
  const isInitialLoading = isLoading && (source.type === 'COLLECTION' ? displayLimit === INITIAL_BATCH_SIZE : queriedEntities.length === 0);
  const isLoadingMore = source.type === 'COLLECTION' ? false : isQueryLoadingMore;

  return (
    <div
      className="fixed inset-0 z-50 bg-white overflow-hidden"
      style={{
        top: '60px', // Account for navbar height
        display: 'grid',
        gridTemplateRows: 'auto auto 1fr'
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-grey-02 px-4 py-2">
        <div className="flex items-center gap-3">
          <Text variant="largeTitle">Power Tools</Text>
          {blockName && (
            <>
              <Text variant="largeTitle" color="grey-03">•</Text>
              <Text variant="largeTitle" color="grey-04">{blockName}</Text>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Add new entity button - only show when in edit mode */}
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
            onClick={handleClose}
            className="flex h-8 w-8 items-center justify-center rounded-sm hover:bg-grey-01"
          >
            <Close />
          </button>
        </div>
      </div>

      {/* Bulk Actions Bar - wrapper div ensures grid row is always occupied */}
      <div>
        <BulkActionsBar
          selectedCount={selectedRows.size}
          editableSelectedCount={editableSelectedCount}
          spaceId={spaceId}
          properties={properties}
          canUserEdit={isEditing}
          onClearSelection={handleClearSelection}
          onAddValues={handleAddValues}
          onRemoveValues={handleRemoveValues}
          onAddRelations={handleAddRelations}
          onRemoveRelations={handleRemoveRelations}
          onAddProperty={handleAddProperty}
          onCopyRows={handleCopyRows}
          onPasteRows={handlePasteRows}
          canPaste={canPaste && isClipboardSupported}
        />
      </div>

      {/* Content */}
      <div className="h-full overflow-hidden">
        {isInitialLoading ? (
          <div className="flex h-full items-center justify-center">
            <Text variant="body" color="grey-04">Loading data...</Text>
          </div>
        ) : (
          <PowerToolsTableVirtual
            rows={loadedRows}
            propertiesSchema={propertiesSchema}
            spaceId={spaceId}
            selectedRows={selectedRows}
            editableEntityIds={editableEntityIds}
            onSelectRow={handleSelectRow}
            onSelectAll={handleSelectAll}
            onSelectRange={handleSelectRange}
            hasNextPage={hasMore}
            isFetchingNextPage={isLoadingMore}
            fetchNextPage={loadMore}
            totalDBRowCount={allAvailableEntities.length}
            totalFetched={loadedRows.length}
            allAvailableEntityIds={allAvailableEntities.map(entity => entity.id)}
            isSelectingAll={isSelectingAll}
            selectAllState={selectAllState}
            onChangeEntry={handleChangeEntry}
            onLinkEntry={handleLinkEntry}
            source={source}
          />
        )}
      </div>
      
      {/* Bulk Edit Modal */}
      <BulkEditModal
        isOpen={modalOpen}
        operation={currentOperation}
        selectedCount={selectedRows.size}
        properties={properties}
        spaceId={spaceId}
        selectedEntityIds={Array.from(selectedRows)}
        onClose={handleModalClose}
        onConfirm={handleModalConfirm}
        onAddProperty={handleAddPropertyToEntities}
      />
    </div>
  );
}