'use client';

import { SystemIds } from '@graphprotocol/grc-20';

import { useQueryEntity } from '~/core/sync/use-store';
import { SyncEngineProvider, useSyncEngine } from '~/core/sync/use-sync-engine';

export default function SyncPage() {
  return (
    <SyncEngineProvider>
      <div className="space-y-8">
        <SingleEntityQueryComponent />
      </div>
    </SyncEngineProvider>
  );
}

function SingleEntityQueryComponent() {
  const { store } = useSyncEngine();
  const { entity, isLoading } = useQueryEntity({ id: 'EHoZ9qvSPmzxNmReVcCTSw' });

  const onClick = () => {
    store.setTriple({
      space: '25omwWh6HYgeRQKCaSpVpa',
      entityId: 'EHoZ9qvSPmzxNmReVcCTSw',
      attributeId: SystemIds.COVER_ATTRIBUTE,
      value: { type: 'TEXT', value: 'Random text property' },
      entityName: 'Geo',
      attributeName: 'Name',
    });
  };

  if (isLoading) {
    return <div>Loading...</div>;
  }

  return (
    <div>
      <h1 className="text-lg">Single Entity Query</h1>
      <button onClick={onClick}>Make random text property</button>
      <p>Name: {entity?.name}</p>
      <p>Description: {entity?.description}</p>
      <p>Random text property: {entity?.triples.find(t => t.attributeId === SystemIds.COVER_ATTRIBUTE)?.value.value}</p>
      <p>Triples: {entity?.triples.length}</p>
      <p>Relations: {entity?.relationsOut.length}</p>
    </div>
  );
}
