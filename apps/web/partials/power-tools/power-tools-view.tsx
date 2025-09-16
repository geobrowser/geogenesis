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
import { useQueryClient } from '@tanstack/react-query';
import { GeoStore } from '~/core/sync/store';
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
import { useClipboard } from './use-clipboard';

const BATCH_SIZE = 50;

export function PowerToolsView() {
  const router = useRouter();
  const { entityId, spaceId, relationId } = useDataBlockInstance();
  const [offset, setOffset] = React.useState(0);
  const [selectedRows, setSelectedRows] = React.useState<Set<string>>(new Set());
  const [modalOpen, setModalOpen] = React.useState(false);
  const [currentOperation, setCurrentOperation] = React.useState<BulkEditOperation | null>(null);
  const [canPaste, setCanPaste] = React.useState(false);
  const queryClient = useQueryClient();

  const { copyRowsToClipboard, pasteRowsFromClipboard, isClipboardSupported, parseRelationUUIDs } = useClipboard();
  
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
            (cell as any).value = value.value;
            (cell as any).dataType = value.property.dataType;
          } else {
            // Get ALL relations for this property, not just the first one
            const relations = entity.relations?.filter(r => r.type.id === propertyId) || [];
            if (relations.length === 1) {
              // Single relation - use existing structure for backward compatibility
              const relation = relations[0];
              (cell as any).relation = {
                id: relation.toEntity.id,
                name: relation.toEntity.name,
              };
            } else if (relations.length > 1) {
              // Multiple relations - store all of them
              (cell as any).relations = relations.map(r => ({
                id: r.toEntity.id,
                name: r.toEntity.name,
              }));
              // For text display, show first relation name
              (cell as any).relation = {
                id: relations[0].toEntity.id,
                name: relations[0].toEntity.name,
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

  // Copy/Paste handlers
  const handleCopyRows = React.useCallback(async () => {
    if (selectedRows.size === 0) return;

    const selectedRowData = loadedRows.filter(row => selectedRows.has(row.entityId));
    const success = await copyRowsToClipboard(selectedRowData, properties);

    if (success) {
      console.log(`Copied ${selectedRows.size} rows to clipboard`);
      // You could show a toast notification here
    }
  }, [selectedRows, loadedRows, properties, copyRowsToClipboard]);

  const handlePasteRows = React.useCallback(async () => {
    const clipboardData = await pasteRowsFromClipboard();
    if (!clipboardData) return;

    console.log('Pasted data:', clipboardData);

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
                    name: null, // We don't have the name, but that's okay
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

      console.log(`Created ${clipboardData.rows.length} new entities from pasted data`);

      // For queries (non-collection sources), invalidate the query cache to refresh results
      if (source.type !== 'COLLECTION') {
        console.log('Created entities for query-based power tools:', newEntityIds);
        console.log('Invalidating query cache to show new entities');

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
  }, [pasteRowsFromClipboard, properties, spaceId, source, where]);

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
        onCopyRows={handleCopyRows}
        onPasteRows={handlePasteRows}
        canPaste={canPaste && isClipboardSupported}
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