import { Signer } from 'ethers';
import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { BehaviorSubject } from 'rxjs';
import { Triple } from '../types';
import { TripleStore } from './triple-store';

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

// TODO: Inject TripleStore via context
export const useTriples = (tripleStore: TripleStore) => {
  const triples = useSharedObservable(tripleStore.triples$);

  useEffect(() => {
    tripleStore.getNetworkTriples();
  }, [tripleStore]);

  const createTriple = (triple: Triple, signer: Signer) => tripleStore.createTriple(triple, signer);
  return { triples, createTriple };
};
