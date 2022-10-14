import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { BehaviorSubject, Observable } from 'rxjs';
import { useTripleStore } from '../services';
import { Triple } from '../types';

// TODO: Track data access so we only re-render components when the data they're accessing has changed
export function useBehaviorSubject<T>(stateContainer: BehaviorSubject<T>) {
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

export function useObservable<T>(stateContainer: Observable<T>, initialValue: T) {
  const state = useMemo(() => new BehaviorSubject(initialValue), [initialValue]);

  useEffect(() => {
    const subscription = stateContainer.subscribe(state);

    return () => subscription.unsubscribe();
  }, [stateContainer, initialValue, state]);

  return useBehaviorSubject(state);
}

const emptyArray: Triple[] = [];

export const useTriples = () => {
  const { create, update, publish, triples$, actions$, entityNames$, setQuery } = useTripleStore();
  const triples = useObservable(triples$, emptyArray);
  const actions = useBehaviorSubject(actions$);
  const entityNames = useBehaviorSubject(entityNames$);

  return {
    triples,
    actions,
    entityNames,
    create,
    update,
    publish,
    setQuery,
  };
};
