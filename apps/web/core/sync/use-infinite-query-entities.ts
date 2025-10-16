import { keepPreviousData } from '@tanstack/react-query';
import * as React from 'react';
import { Entity } from '../v2.types';
import { WhereCondition } from './experimental_query-layer';
import { useQueryEntities, useQueryEntitiesAsync } from './use-store';

const BATCH_SIZE = 50;

interface UseInfiniteQueryEntitiesOptions {
  where: WhereCondition;
  enabled?: boolean;
}

interface UseInfiniteQueryEntitiesReturn {
  entities: Entity[];
  hasMore: boolean;
  loadMore: () => Promise<void>;
  isLoading: boolean;
  isLoadingMore: boolean;
}

export function useInfiniteQueryEntities({
  where,
  enabled = true,
}: UseInfiniteQueryEntitiesOptions): UseInfiniteQueryEntitiesReturn {
  const [loadedEntities, setLoadedEntities] = React.useState<Entity[]>([]);
  const [currentSkip, setCurrentSkip] = React.useState(0);
  const [isLoadingMore, setIsLoadingMore] = React.useState(false);
  const [hasReachedEnd, setHasReachedEnd] = React.useState(false);

  // Get the async query function for fetching additional batches
  const queryEntitiesAsync = useQueryEntitiesAsync();

  // Set initial data only once when first loaded
  const [hasInitialized, setHasInitialized] = React.useState(false);

  // Initial fetch using the regular hook - force fresh query when space filtering
  const { entities: initialData, isLoading } = useQueryEntities({
    where,
    first: BATCH_SIZE,
    skip: 0,
    enabled,
    placeholderData: where.spaces ? undefined : keepPreviousData, // Don't use cached data for space filters
  });

  React.useEffect(() => {
    console.log('[useInfiniteQueryEntities] Effect running:', {
      hasInitialData: !!initialData,
      initialDataLength: initialData?.length,
      hasInitialized,
      loadedEntitiesLength: loadedEntities.length,
      willUpdate: !!(initialData && (!hasInitialized || loadedEntities.length === 0))
    });

    // Initialize loaded entities when we have initial data and haven't initialized yet
    // OR when we have initial data but loadedEntities is empty (e.g., after navigation)
    if (initialData && (!hasInitialized || loadedEntities.length === 0)) {
      console.log('[useInfiniteQueryEntities] Setting loaded entities:', initialData.length);
      setLoadedEntities(initialData);
      setCurrentSkip(BATCH_SIZE);
      setHasReachedEnd(initialData.length < BATCH_SIZE);
      setHasInitialized(true);
    }
  }, [initialData, hasInitialized, loadedEntities.length]);

  // Reset when where conditions change (using JSON stringify to compare)
  const whereKey = JSON.stringify(where);
  const previousWhereKey = React.useRef<string | null>(null);

  React.useEffect(() => {
    // Only reset if the where key actually changed from a previous value
    // Don't reset on initial mount
    if (previousWhereKey.current !== null && previousWhereKey.current !== whereKey) {
      console.log('[useInfiniteQueryEntities] Where changed, resetting state');
      setLoadedEntities([]);
      setCurrentSkip(0);
      setHasReachedEnd(false);
      setHasInitialized(false);
    }
    previousWhereKey.current = whereKey;
  }, [whereKey]);

  // Load more function
  const loadMore = React.useCallback(async () => {
    if (isLoadingMore || hasReachedEnd || !enabled) return;

    setIsLoadingMore(true);

    try {
      const nextBatch = await queryEntitiesAsync({
        where,
        first: BATCH_SIZE,
        skip: currentSkip,
      });

      setLoadedEntities(prev => [...prev, ...nextBatch]);
      setCurrentSkip(prev => prev + BATCH_SIZE);

      if (nextBatch.length < BATCH_SIZE) {
        setHasReachedEnd(true);
      }
    } catch (error) {
      console.error('Failed to load more entities:', error);
    } finally {
      setIsLoadingMore(false);
    }
  }, [where, currentSkip, isLoadingMore, hasReachedEnd, enabled, queryEntitiesAsync]);

  const result = {
    entities: loadedEntities,
    hasMore: !hasReachedEnd,
    loadMore,
    isLoading,
    isLoadingMore,
  };

  console.log('[useInfiniteQueryEntities] Returning:', {
    entitiesLength: loadedEntities.length,
    hasMore: !hasReachedEnd,
    isLoading,
    isLoadingMore,
  });

  return result;
}