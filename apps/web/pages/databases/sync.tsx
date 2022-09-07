import { Facts, MockApi, useSharedObservable } from '@geogenesis/database'
import { Spacer } from '~/modules/design-system/spacer';

// Would probably be dependency injected with Context in the real implementation
const factsStore = new Facts(new MockApi());

export default function SyncExample() {
  const snapshot = useSharedObservable(factsStore.facts$);

  const createFact = () =>
    factsStore.createFact({
      id: (Math.random() * 100).toString(),
      entityId: 'askldjasd',
      attribute: 'Died in',
      value: 0,
    });

  return (
    <div>
      {snapshot.map(fact => (
        <div key={fact.id}>
          <p>id: {fact.id}</p>
          <p>entityId: {fact.entityId}</p>
          <p>attribute: {fact.attribute}</p>
          <p>value: {fact.value}</p>
        </div>
      ))}

      <Spacer height={20} />

      <button onClick={createFact}>Create fact</button>
    </div>
  );
}
