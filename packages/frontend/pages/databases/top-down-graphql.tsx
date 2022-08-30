import { network } from '@geogenesis/database'
import useSWR from 'swr'

export default function TopDownGraphQlExample() {
  const {
    data: snapshot,
    error,
    mutate,
  } = useSWR('topDownGraphQl.read.getFacts', network.read.getFacts)

  if (!snapshot) return <div className="layout"> Loading...</div>

  const createFact = async () => {
    mutate([
      ...snapshot,
      await network.write.writeFact({
        id: '1487',
        entityId: '1023948124',
        attribute: 'Died in',
        value: 0,
      }),
    ])
  }

  return (
    <div className="layout">
      <>
        {snapshot?.map((fact) => (
          <div key={fact.id}>
            <p>id: {fact.id}</p>
            <p>entityId: {fact.entityId}</p>
            <p>attribute: {fact.attribute}</p>
            <p>value: {fact.value}</p>
          </div>
        ))}
      </>

      <button
        className="bg-geo-blue-100 text-geo-white-100 px-4 py-2 rounded"
        onClick={createFact}
      >
        Create fact
      </button>
    </div>
  )
}
