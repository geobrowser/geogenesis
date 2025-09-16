'use client';

import { SystemIds, Position } from '@graphprotocol/grc-20';
import { useRouter } from 'next/navigation';
import { keepPreviousData } from '@tanstack/react-query';

import * as React from 'react';

import { useDataBlock } from '~/core/blocks/data/use-data-block';
import { filterStateToWhere, useDataBlockInstance } from '~/core/blocks/data/use-data-block';
import { useSource } from '~/core/blocks/data/use-source';
import { useFilters } from '~/core/blocks/data/use-filters';
import { useCollection } from '~/core/blocks/data/use-collection';
import { useQueryEntities, useQueryEntity, getValues, getRelations } from '~/core/sync/use-store';
import { ID } from '~/core/id';
import { useProperties } from '~/core/hooks/use-properties';
import { storage } from '~/core/sync/use-mutate';
import { Entities } from '~/core/utils/entity';
import { Cell, Entity, Relation, Row } from '~/core/v2.types';

import { Close } from '~/design-system/icons/close';
import { Text } from '~/design-system/text';

import { BulkActionsBar } from './bulk-actions-bar';
import { BulkEditModal, BulkEditOperation } from './bulk-edit-modal';
import { PowerToolsTable } from './power-tools-table';

const BATCH_SIZE = 50;

export function PowerToolsView() {
  const router = useRouter();
  const { entityId, spaceId, relationId } = useDataBlockInstance();
  const [offset, setOffset] = React.useState(0);
  const [selectedRows, setSelectedRows] = React.useState<Set<string>>(new Set());
  const [modalOpen, setModalOpen] = React.useState(false);
  const [currentOperation, setCurrentOperation] = React.useState<BulkEditOperation | null>(null);
  
  // Use standard data block hooks now that we have EditorProvider
  const { blockEntity: dataBlockEntity, name: blockName } = useDataBlock();
  const { source } = useSource();
  const { filterState } = useFilters();
  const where = filterStateToWhere(filterState);
  
  const { entity: blockRelationEntity, isLoading: isBlockRelationLoading } = useQueryEntity({
    spaceId: spaceId,
    id: relationId,
  });
  
  // Get collection data (always fetch all at once for collections)
  const { collectionItems, collectionRelations, isLoading: isCollectionLoading } = useCollection({});
  
  // For queries, fetch ALL entities at once to avoid accumulation issues
  const { entities: queriedEntities, isLoading: isQueryLoading } = useQueryEntities({
    where: where,
    enabled: source.type === 'SPACES' || source.type === 'GEO',
  });

  // Get ALL properties (not just shown ones)
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
    
    return Array.from(ids);
  }, [collectionItems, queriedEntities, blockRelationEntity?.relations, source.type]);
  
  const propertiesSchema = useProperties(allPropertyIds);
  const properties = propertiesSchema ? Object.values(propertiesSchema) : [];
  
  // Convert entities to rows
  const entitiesToRows = React.useCallback((entities: Entity[], propertyIds: string[], collectionRels: Relation[] = []): Row[] => {
    return entities.map(entity => {
      const columns: Record<string, Cell> = {};
      
      propertyIds.forEach(propertyId => {
        const cell: Cell = {
          slotId: propertyId,
          propertyId: propertyId,
          entityId: entity.id,
          name: null,
        };
        
        if (propertyId === SystemIds.NAME_PROPERTY) {
          cell.name = entity.name;
          cell.description = entity.description;
          cell.image = Entities.cover(entity.relations) ?? Entities.avatar(entity.relations) ?? null;
          
          const collectionRelation = collectionRels.find(r => r.toEntity.id === entity.id);
          if (collectionRelation) {
            cell.relationId = collectionRelation.id;
            cell.collectionId = collectionRelation.fromEntity.id;
            cell.space = collectionRelation.toSpaceId;
            cell.verified = collectionRelation.verified;
          }
        } else {
          const value = entity.values?.find(v => v.property.id === propertyId);
          if (value) {
            cell.value = value.value;
            cell.dataType = value.property.dataType;
          } else {
            const relation = entity.relations?.find(r => r.type.id === propertyId);
            if (relation) {
              cell.relation = {
                id: relation.toEntity.id,
                name: relation.toEntity.name,
              };
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
  
  // Build rows for display with virtual scrolling
  const loadedRows = React.useMemo(() => {
    let entities: Entity[] = [];
    
    if (source.type === 'COLLECTION' && collectionItems) {
      // For collections, paginate through the items
      const startIdx = offset;
      const endIdx = Math.min(offset + BATCH_SIZE, collectionItems.length);
      entities = collectionItems.slice(startIdx, endIdx);
    } else if ((source.type === 'GEO' || source.type === 'SPACES') && queriedEntities) {
      // For queries, paginate through the items
      const startIdx = offset;
      const endIdx = Math.min(offset + BATCH_SIZE, queriedEntities.length);
      entities = queriedEntities.slice(startIdx, endIdx);
    }
    
    if (entities.length === 0) return [];
    
    return entitiesToRows(
      entities,
      allPropertyIds,
      source.type === 'COLLECTION' ? collectionRelations : []
    );
  }, [collectionItems, queriedEntities, source.type, allPropertyIds, collectionRelations, entitiesToRows, offset]);
  
  // Determine if there are more rows to load
  const hasMore = React.useMemo(() => {
    if (source.type === 'COLLECTION') {
      return collectionItems ? offset + BATCH_SIZE < collectionItems.length : false;
    } else {
      return queriedEntities ? offset + BATCH_SIZE < queriedEntities.length : false;
    }
  }, [source.type, collectionItems, queriedEntities, offset]);
  
  const loadMore = React.useCallback(() => {
    if (!hasMore) return;
    setOffset(prev => prev + BATCH_SIZE);
  }, [hasMore]);
  
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
  
  const handleSelectAll = React.useCallback((selected: boolean) => {
    if (selected) {
      // Select all current rows
      setSelectedRows(new Set(loadedRows.map(row => row.entityId)));
    } else {
      // Clear selection
      setSelectedRows(new Set());
    }
  }, [loadedRows]);
  
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
  
  const handleAddValues = React.useCallback(() => {
    setCurrentOperation('add-values');
    setModalOpen(true);
  }, []);
  
  const handleRemoveValues = React.useCallback(() => {
    setCurrentOperation('remove-values');
    setModalOpen(true);
  }, []);
  
  const handleAddRelations = React.useCallback(() => {
    setCurrentOperation('add-relations');
    setModalOpen(true);
  }, []);
  
  const handleRemoveRelations = React.useCallback(() => {
    setCurrentOperation('remove-relations');
    setModalOpen(true);
  }, []);
  
  // Modal handlers
  const handleModalClose = React.useCallback(() => {
    setModalOpen(false);
    setCurrentOperation(null);
  }, []);
  
  const handleModalConfirm = React.useCallback((propertyId: string, value: string, entityId?: string) => {
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
        const targetEntityId = entityId || value.trim();
        if (!targetEntityId) return;
        
        selectedEntityIds.forEach(fromEntityId => {
          storage.relations.set({
            id: ID.createEntityId(),
            entityId: fromEntityId,
            type: { id: propertyId, name: property.name },
            fromEntity: { id: fromEntityId, name: null },
            toEntity: { id: targetEntityId, name: null, value: targetEntityId },
            renderableType: 'TEXT' as const,
            spaceId,
            verified: false,
            isLocal: true,
          });
        });
        break;
      }
      
      case 'remove-relations': {
        const targetEntityId = entityId || value.trim();
        
        selectedEntityIds.forEach(fromEntityId => {
          const relations = getRelations({
            selector: r => r.fromEntity.id === fromEntityId && r.type.id === propertyId && !r.isDeleted
          });
          
          relations.forEach(r => {
            // If a specific relation target was provided, only remove matching relations
            if (targetEntityId && r.toEntity.id !== targetEntityId) {
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
    
    // Clear selection after operation
    setSelectedRows(new Set());
  }, [currentOperation, selectedRows, propertiesSchema, spaceId]);
  
  const handleClose = () => {
    router.back();
  };
  
  const isLoading = isBlockRelationLoading || (source.type === 'COLLECTION' ? isCollectionLoading : isQueryLoading);
  const isInitialLoading = isLoading && offset === 0;

  return (
    <div className="flex h-screen flex-col bg-white">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-grey-02 px-6 py-4">
        <div className="flex items-center gap-3">
          <Text variant="largeTitleMedium">Power Tools</Text>
          {blockName && (
            <>
              <Text variant="largeTitleMedium" color="grey-03">•</Text>
              <Text variant="largeTitleMedium" color="grey-04">{blockName}</Text>
            </>
          )}
        </div>
        <button
          onClick={handleClose}
          className="flex h-8 w-8 items-center justify-center rounded-sm hover:bg-grey-01"
        >
          <Close />
        </button>
      </div>

      {/* Bulk Actions Bar */}
      <BulkActionsBar
        selectedCount={selectedRows.size}
        onClearSelection={handleClearSelection}
        onAddValues={handleAddValues}
        onRemoveValues={handleRemoveValues}
        onAddRelations={handleAddRelations}
        onRemoveRelations={handleRemoveRelations}
      />

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {isInitialLoading ? (
          <div className="flex h-full items-center justify-center">
            <Text variant="bodyLarge" color="grey-04">Loading data...</Text>
          </div>
        ) : (
          <PowerToolsTable
            rows={loadedRows}
            properties={properties}
            propertiesSchema={propertiesSchema}
            spaceId={spaceId}
            hasMore={hasMore}
            loadMore={loadMore}
            selectedRows={selectedRows}
            onSelectRow={handleSelectRow}
            onSelectAll={handleSelectAll}
            onSelectRange={handleSelectRange}
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
        onClose={handleModalClose}
        onConfirm={handleModalConfirm}
      />
    </div>
  );
}