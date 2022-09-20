import { BehaviorSubject } from 'rxjs';
import { useMemo, useSyncExternalStore } from 'react';
import { FactsStore } from './facts';
import { IFact } from '../types';

// TODO: Track data access so we only re-render components when the data they're accessing has changed
export function useSharedObservable<T>(stateContainer: BehaviorSubject<T>) {
  const subscription = useMemo(
    () => ({
      getCurrentValue: () => stateContainer.getValue(),
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

// TODO: Inject FactsStore via context
export const useFacts = (factsStore: FactsStore) => {
  const snapshot = useSharedObservable(factsStore.facts$);
  const createFact = (fact: IFact) => factsStore.createFact(fact);
  return { facts: snapshot, createFact };
};
