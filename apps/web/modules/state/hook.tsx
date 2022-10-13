import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { BehaviorSubject } from 'rxjs';
import { useTripleStore } from '../services';

// TODO: Track data access so we only re-render components when the data they're accessing has changed
export function useSharedObservable<T>(stateContainer: BehaviorSubject<T>) {
  const subscription = useMemo(
    () => ({
      getCurrentValue: () => stateContainer.value,
      subscribe: (callback: () => void) => {
        const subscription = stateContainer.subscribe(callback);
        return () => subscription.unsubscribe();
      },
    }),

    // Re-subscribe any time the behaviorSubject ref changes
    [stateContainer]
  );

  return useSyncExternalStore(subscription.subscribe, subscription.getCurrentValue, subscription.getCurrentValue);
}

export const useTriples = () => {
  const { create, update, publish, triples$, changedTriples$, entityNames$, setQuery } = useTripleStore();
  const triples = useSharedObservable(triples$);
  const changedTriples = useSharedObservable(changedTriples$);
  const entityNames = useSharedObservable(entityNames$);

  return {
    triples,
    changedTriples,
    entityNames,
    create,
    update,
    publish,
    setQuery,
  };
};
