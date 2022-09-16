import { BehaviorSubject } from 'rxjs'
import { useMemo, useSyncExternalStore } from 'react'

// TODO: Track data access so we only re-render components when the data they're accessing has changed
export function useSharedObservable<T>(stateContainer: BehaviorSubject<T>) {
  const subscription = useMemo(
    () => ({
      getCurrentValue: () => stateContainer.getValue(),
      subscribe: (callback: () => void) => {
        const subscription = stateContainer.subscribe(callback)
        return () => subscription.unsubscribe()
      },
    }),

    // Re-subscribe any time the behaviorSubject changes
    [stateContainer]
  )

  return useSyncExternalStore(
    subscription.subscribe,
    subscription.getCurrentValue,
    subscription.getCurrentValue
  )
}
