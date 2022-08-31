import { sync } from '@geogenesis/database'

export default function SyncExample() {
  const snapshot = sync.useSharedObservable(sync.facts$)

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
