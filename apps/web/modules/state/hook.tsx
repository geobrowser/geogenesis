import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { BehaviorSubject } from 'rxjs';
import { useTripleStore } from '../services';

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

export const useTriples = () => {
  const tripleStore = useTripleStore();
  const triples = useSharedObservable(tripleStore.triples$);

  useEffect(() => {
    // This is how we're loading the initial triples data rather than waiting the 5
    // seconds for it to populate. Ideally we can fetch them externally and pass them
    // to the store, but this is a good workaround for now since we can't really
    // inject data into the Next app outside of their server/static APIs
    tripleStore.loadNetworkTriples();
  }, [tripleStore]);

  return {
    triples,
    upsertLocalTriple: tripleStore.upsertLocalTriple,
    createNetworkTriple: tripleStore.createNetworkTriple,
    updateNetworkTriple: tripleStore.updateNetworkTriple,
  };
};
