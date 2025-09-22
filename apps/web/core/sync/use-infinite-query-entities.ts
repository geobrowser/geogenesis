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

  // Initial fetch using the regular hook
  const { entities: initialData, isLoading } = useQueryEntities({
    where,
    first: BATCH_SIZE,
    skip: 0,
    enabled,
  });

  // Set initial data only once when first loaded
  const [hasInitialized, setHasInitialized] = React.useState(false);

  React.useEffect(() => {
    if (initialData && !hasInitialized) {
      console.log('useInfiniteQueryEntities: received initial data', initialData.length);
      setLoadedEntities(initialData);
      setCurrentSkip(BATCH_SIZE);
      setHasReachedEnd(initialData.length < BATCH_SIZE);
      setHasInitialized(true);
    }
  }, [initialData, hasInitialized]);

  // Reset when where conditions change (using JSON stringify to compare)
  const whereKey = JSON.stringify(where);
  React.useEffect(() => {
    setLoadedEntities([]);
    setCurrentSkip(0);
    setHasReachedEnd(false);
    setHasInitialized(false);
  }, [whereKey]);

  // Load more function
  const loadMore = React.useCallback(async () => {
    console.log('useInfiniteQueryEntities: loadMore called', {
      isLoadingMore,
      hasReachedEnd,
      enabled,
      currentSkip
    });

    if (isLoadingMore || hasReachedEnd || !enabled) return;

    setIsLoadingMore(true);

    try {
      // Fetch next batch using the async version
      console.log('useInfiniteQueryEntities: fetching next batch', {
        skip: currentSkip,
        first: BATCH_SIZE
      });

      const nextBatch = await queryEntitiesAsync({
        where,
        first: BATCH_SIZE,
        skip: currentSkip,
      });

      console.log('useInfiniteQueryEntities: received next batch', nextBatch.length);

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

  return {
    entities: loadedEntities,
    hasMore: !hasReachedEnd,
    loadMore,
    isLoading,
    isLoadingMore,
  };
}