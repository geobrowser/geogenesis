import { topDownGraphQl } from '@geogenesis/database'
import useSWR from 'swr'

export default function TopDownGraphQlExample() {
  const { data: snapshot, error } = useSWR(
    'topDownGraphQl.read.getFacts',
    topDownGraphQl.read.getFacts
  )

  if (!snapshot) return <div className="layout"> Loading...</div>

  return (
    <div className="layout">
      {snapshot.map((fact) => (
        <div key={fact.id}>
          <p>id: {fact.id}</p>
          <p>entityId: {fact.entityId}</p>
          <p>attribute: {fact.attribute}</p>
          <p>value: {fact.value}</p>
        </div>
      ))}
    </div>
  )
}
