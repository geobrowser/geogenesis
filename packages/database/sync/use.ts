import { BehaviorSubject } from 'rxjs'
import { useMemo, useSyncExternalStore } from 'react'

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

  // Light wrapper over useSyncExternalStore
  return useSyncExternalStore(
    subscription.subscribe,
    subscription.getCurrentValue,
    subscription.getCurrentValue
  )
}
