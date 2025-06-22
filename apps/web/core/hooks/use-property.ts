import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { Effect } from 'effect';

import { useSyncEngine } from '~/core/sync/use-sync-engine';
import { getProperty } from '~/core/io/v2/queries';
import { DataType } from '../v2.types';

interface UsePropertyOptions {
  id: string;
  enabled?: boolean;
}

interface PropertyData {
  id: string;
  dataType: DataType;
  dataTypeId?: string | null;
  renderableType?: string | null;
}

export function useProperty({ id, enabled = true }: UsePropertyOptions) {
  const { store, stream } = useSyncEngine();
  const cache = useQueryClient();

  const queryResult = useQuery({
    queryKey: ['property', id],
    enabled: enabled && !!id,
    queryFn: async ({ signal }) => {
      console.log('useProperty queryFn called with id:', id);
      
      // Properties are entities, so first check if we have it in the entity store
      const localEntity = store.getEntity(id);
      console.log('localEntity found:', !!localEntity);
      
      // Always fetch from the server for now to debug
      try {
        const result = await Effect.runPromise(getProperty(id, signal));
        console.log('getProperty result:', result);
        
        if (!result) {
          console.log('getProperty returned null');
          return null;
        }

        // Map the Property type to our PropertyData interface
        const mapped = mapPropertyToData(result);
        console.log('mapped PropertyData:', mapped);
        return mapped;
      } catch (error) {
        console.error('Error in getProperty:', error);
        return null;
      }
    },
  });

  // Subscribe to sync events for real-time updates
  useEffect(() => {
    if (!enabled || !id) return;

    const unsubscribe = stream.on('entity:updated', event => {
      // Handle entity updates that might affect this property
      if (event.entity.id === id) {
        cache.invalidateQueries({ queryKey: ['property', id] });
      }
    });

    return () => {
      unsubscribe();
    };
  }, [id, enabled, stream, cache]);

  // Return the full query result object to match useQuery's return type
  return queryResult;
}

function mapPropertyToData(property: any): PropertyData {
  return {
    id: property.id,
    dataType: property.dataType,
    dataTypeId: null, // This is mapped client-side based on dataType
    renderableType: property.renderableType || null,
  };
}