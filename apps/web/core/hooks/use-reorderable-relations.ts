'use client';

import { Relation as R, SystemIds } from '@graphprotocol/grc-20';
import * as React from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { RelationRenderableProperty } from '~/core/types';
import { useEditEvents } from '~/core/events/edit-events';
import { useEntityPageStore } from '~/core/state/entity-page-store/entity-store';
import { sortRelationsWithIndices, RelationWithIndex } from '~/core/utils/relations';
import { GeoStore } from '~/core/sync/store';

/**
 * Helper function to fix indices for items in the new order
 */
function fixItemIndices(
  newOrder: RelationWithIndex[],
  spaceId: string,
  send: ReturnType<typeof useEditEvents>,
  pendingRelationUpdatesRef: React.MutableRefObject<Set<string>>
) {
  // Work through each item in the new order and check if its index is correct relative to neighbors
  for (let i = 0; i < newOrder.length; i++) {
    const currentItem = newOrder[i];
    if (!currentItem?.relationId) continue;

    const beforeItem = i > 0 ? newOrder[i - 1] : undefined;
    const afterItem = i < newOrder.length - 1 ? newOrder[i + 1] : undefined;

    const currentIndex = currentItem.index;
    const beforeIndex = beforeItem?.index;
    const afterIndex = afterItem?.index;

    // Check if current item's index is in the correct position relative to neighbors
    let needsUpdate = false;
    
    // If there's no index at all, needs update
    if (!currentIndex) {
      needsUpdate = true;
    }
    // If there's a before item, current index should be > before index
    else if (beforeIndex && currentIndex <= beforeIndex) {
      needsUpdate = true;
    }
    // If there's an after item, current index should be < after index  
    else if (afterIndex && currentIndex >= afterIndex) {
      needsUpdate = true;
    }

    if (needsUpdate) {
      try {
        // Validate that beforeIndex < afterIndex to avoid R.reorder errors
        let validBeforeIndex = beforeIndex;
        let validAfterIndex = afterIndex;
        
        // If both indices exist and beforeIndex >= afterIndex, skip one of them
        if (validBeforeIndex && validAfterIndex && validBeforeIndex >= validAfterIndex) {
          // Prefer to keep the beforeIndex and remove afterIndex constraint
          validAfterIndex = undefined;
        }

        const newTripleOrdering = R.reorder({
          relationId: currentItem.relationId,
          beforeIndex: validBeforeIndex,
          afterIndex: validAfterIndex,
        });

        // Track this relation as pending
        pendingRelationUpdatesRef.current.add(currentItem.relationId);

        console.log('Fixing item index:', {
          relationId: currentItem.relationId,
          value: currentItem.valueName,
          oldIndex: currentIndex,
          newIndex: newTripleOrdering.triple.value.value,
          position: i,
          beforeIndex: validBeforeIndex,
          afterIndex: validAfterIndex
        });
        
        send({
          type: 'UPSERT_RENDERABLE_TRIPLE_VALUE',
          payload: {
            renderable: {
              type: 'TEXT',
              entityId: currentItem.relationId,
              entityName: null,
              attributeId: SystemIds.RELATION_INDEX,
              attributeName: 'Index',
              spaceId,
              value: newTripleOrdering.triple.value.value,
            },
            value: {
              type: 'TEXT',
              value: newTripleOrdering.triple.value.value,
            },
          },
        });
        
        // Update the item's index in our local copy so subsequent items use the correct indices
        currentItem.index = newTripleOrdering.triple.value.value;
      } catch (error) {
        console.error('Error fixing item index:', error);
      }
    }
  }
}

interface UseReorderableRelationsProps {
  relations: RelationRenderableProperty[];
  attributeId: string;
  attributeName: string | null;
  isDragging?: boolean;
}

export function useReorderableRelations({ 
  relations, 
  attributeId, 
  attributeName,
  isDragging = false
}: UseReorderableRelationsProps) {
  const { id, name, spaceId, relations: allRelations } = useEntityPageStore();
  const [isReordering, setIsReordering] = React.useState(false);
  const lastProcessedOrderRef = React.useRef<string>('');
  const queryClient = useQueryClient();
  const pendingRelationUpdatesRef = React.useRef<Set<string>>(new Set());
  
  console.log('SystemIds.RELATION_INDEX value:', SystemIds.RELATION_INDEX);
  
  const send = useEditEvents({
    context: {
      entityId: id,
      spaceId,
      entityName: name ?? '',
    },
  });

  const relationIndexMap = React.useMemo(() => {
    const map = new Map<string, string>();
    allRelations.forEach(relation => {
      map.set(relation.id, relation.index);
    });
    
    return map;
  }, [allRelations, relations]);

  const sortedRelations = React.useMemo(() => {
    console.log('new sortedRelations in useReorderableRelations:', relations);
    console.log(relationIndexMap);
    // only re-sort if the relations are the same as relationIndexMap
    return sortRelationsWithIndices(relations, relationIndexMap);
  }, [relations, relationIndexMap]);

  // UI state is source of truth - only initialize from database on first load
  const [currentOrder, setCurrentOrder] = React.useState<RelationWithIndex[]>(() => sortedRelations);
  const [isInitialized, setIsInitialized] = React.useState(false);

  // Only sync with database state on initial load
  React.useEffect(() => {
    if (!isInitialized && sortedRelations.length > 0) {
      console.log('Initial load - setting order from database:', sortedRelations);
      setCurrentOrder(sortedRelations);
      setIsInitialized(true);
    }
  }, [sortedRelations, isInitialized]);

  React.useEffect(() => {
    console.log("1 - relations updated", relations )
  }, [relations]);

  React.useEffect(() => {
    console.log("1 - allRelations updated", relations )
  }, [allRelations]);

  // Handle UI-only reordering (during drag)
  const handleReorder = React.useCallback((newOrder: RelationWithIndex[]) => {
    if (!newOrder.length) return;
    setCurrentOrder(newOrder);
  }, []);

  // Handle database persistence (on drop)
  const handleDrop = React.useCallback((finalOrder: RelationWithIndex[]) => {
    if (!finalOrder.length) return;
    
    // Prevent overlapping operations
    if (isReordering) {
      console.log("Reorder operation already in progress, ignoring drop event");
      return;
    }

    console.log('Handling drop with final order:', finalOrder);

    // Create a signature of the current order to detect duplicate events
    const orderSignature = finalOrder.map(r => r.relationId).join(',');
    
    if (orderSignature === lastProcessedOrderRef.current) {
      return;
    }

    // Check if this is actually different from our current database state
    const currentOrderSignature = sortedRelations.map(r => r.relationId).join(',');
    
    if (orderSignature === currentOrderSignature) {
      return;
    }

    console.log('Executing database write on drop for order:', {
      orderSignature,
      finalOrder: finalOrder.map(r => ({ id: r.relationId, index: r.index })),
      databaseOrder: sortedRelations.map(r => ({ id: r.relationId, index: r.index }))
    });
    
    lastProcessedOrderRef.current = orderSignature;
    setIsReordering(true);

    // Simple optimistic update: just use the final order as-is
    setCurrentOrder(finalOrder);

    try {
      // Use unified algorithm to fix any items with incorrect indices
      fixItemIndices(finalOrder, spaceId, send, pendingRelationUpdatesRef);
      
      // Note: We don't invalidate queries here to avoid overwriting UI state with stale DB state
      setIsReordering(false);
      
      // Use a reasonable timeout to wait for database and refetch
      setTimeout(() => {
        console.log('Clearing isReordering after timeout');
        setIsReordering(false);
        lastProcessedOrderRef.current = '';
      }, 1000);
    } catch (error) {
      console.error('Error in reorder operation:', error);
      // On error, clear isReordering immediately
      pendingRelationUpdatesRef.current.clear();
      setIsReordering(false);
    }
  }, [send, spaceId, isReordering, sortedRelations, queryClient, id]);

  return {
    sortedRelations: currentOrder, // Return current order for UI display
    handleReorder, // UI-only updates during drag
    handleDrop, // Database persistence on drop
    isReordering,
  };
}