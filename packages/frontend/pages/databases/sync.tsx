import { sync } from '@geogenesis/database'
import { BehaviorSubject } from 'rxjs'
import React, { useMemo } from 'react'
import { useSubscription } from 'use-subscription'

function useSharedObservable<T>(stateContainer: BehaviorSubject<T>): T {
  // State is stored in the observable passed from the parent. We need to tell React to
  // re-render when it changes so the UI actually updates.
  const rerender = React.useState({})[1]

  React.useEffect(() => {
    // When another components calls `next` on the observable, we execute
    // a callback to re-render this component if the state the component
    // is tracking has changed.
    //
    // We set up the state tracking in the Proxy in `get()`
    const sub = stateContainer.subscribe(() => rerender({}))

    return () => sub.unsubscribe()
  }, [stateContainer])

  return stateContainer.getValue()
}

function useSharedObservableExternalStore<T>(
  stateContainer: BehaviorSubject<T>
) {
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
  return useSubscription(subscription)
}

export default function SyncExample() {
  const snapshot = useSharedObservableExternalStore(sync.facts$)

  console.log(sync.facts$)

  return (
    <div className="layout">
      <div className="mb-4 space-y-4">
        {snapshot.map((fact) => (
          <div key={fact.id}>
            <p>id: {fact.id}</p>
            <p>entityId: {fact.entityId}</p>
            <p>attribute: {fact.attribute}</p>
            <p>value: {fact.value}</p>
          </div>
        ))}
      </div>

      <button
        className="bg-geo-blue-100 text-geo-white-100 px-4 py-2 rounded"
        onClick={() => {}}
      >
        Create fact
      </button>
    </div>
  )
}
