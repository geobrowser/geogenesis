'use client';

import { SystemIds } from '@graphprotocol/grc-20';

import { useQueryEntities, useQueryEntity } from '~/core/sync/use-store';
import { SyncEngineProvider, useSyncEngine } from '~/core/sync/use-sync-engine';

export default function SyncPage() {
  return (
    <SyncEngineProvider>
      <div className="space-y-8">
        <SingleEntityQueryComponent />
        <MultipleEntityQueryComponentWithSpecificId />
      </div>
    </SyncEngineProvider>
  );
}

function SingleEntityQueryComponent() {
  const { store } = useSyncEngine();
  const { entity } = useQueryEntity('entity-1');

  const onClick = () => {
    store.setTriple({
      space: 'space1',
      entityId: 'entity-1',
      attributeId: SystemIds.NAME_ATTRIBUTE,
      value: { type: 'TEXT', value: 'New name' },
      entityName: 'Company',
      attributeName: 'Name',
    });
  };

  return (
    <div>
      <h1 className="text-lg">Single Entity Query</h1>
      <button onClick={onClick}>Make name</button>
      <p>{JSON.stringify(entity?.triples, null, 2)}</p>
    </div>
  );
}

function MultipleEntityQueryComponentWithSpecificId() {
  const { entities } = useQueryEntities(['entity-2']);

  return (
    <div>
      <h1 className="text-lg">Multiple Entity Query with Specific IDs</h1>

      <p>{JSON.stringify(entities, null, 2)}</p>
    </div>
  );
}
