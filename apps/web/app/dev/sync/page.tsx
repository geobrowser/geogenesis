'use client';

import { SystemIds } from '@graphprotocol/grc-20';

import { useQueryEntities, useQueryEntity } from '~/core/sync/use-store';
import { SyncEngineProvider, useSyncEngine } from '~/core/sync/use-sync-engine';

import { PageStringField } from '~/design-system/editable-fields/editable-fields';

export default function SyncPage() {
  return (
    <SyncEngineProvider>
      <div className="space-y-8">
        <SingleEntityQueryComponent />
        <MultipleEntityQueryComponent />
      </div>
    </SyncEngineProvider>
  );
}

function SingleEntityQueryComponent() {
  const { store } = useSyncEngine();
  const { entity, isLoading } = useQueryEntity({ id: 'EHoZ9qvSPmzxNmReVcCTSw' });

  const onBlur = (value: string) => {
    store.setTriple({
      space: '25omwWh6HYgeRQKCaSpVpa',
      entityId: 'EHoZ9qvSPmzxNmReVcCTSw',
      attributeId: SystemIds.NAME_PROPERTY,
      value: { type: 'TEXT', value: value },
      entityName: value,
      attributeName: 'Name',
    });
  };

  if (isLoading) {
    return <div>Loading...</div>;
  }

  return (
    <div>
      <h1 className="text-lg">Single Entity Query</h1>
      <div className="flex items-center gap-2">
        <label>Name</label>
        <PageStringField
          variant="body"
          onChange={e => onBlur(e.currentTarget.value)}
          value={entity?.name ?? undefined}
        />
      </div>
      <p>Triples: {entity?.triples.length}</p>
      <p>Relations: {entity?.relationsOut.length}</p>
    </div>
  );
}

function MultipleEntityQueryComponent() {
  const { store } = useSyncEngine();
  const { entities, isLoading } = useQueryEntities({
    where: { id: { in: ['EHoZ9qvSPmzxNmReVcCTSw', '7gzF671tq5JTZ13naG4tnr'] } },
  });

  const onBlur = (entityId: string, value: string) => {
    store.setTriple({
      space: '25omwWh6HYgeRQKCaSpVpa',
      entityId: entityId,
      attributeId: SystemIds.NAME_PROPERTY,
      value: { type: 'TEXT', value: value },
      entityName: value,
      attributeName: 'Name',
    });
  };

  if (isLoading) {
    return <div>Loading...</div>;
  }

  return (
    <div className="space-y-4">
      <h1 className="text-lg">Multiple Entity Query</h1>

      {entities.map(entity => (
        <div key={entity.id}>
          <div className="flex items-center gap-2">
            <label>Name</label>
            <PageStringField
              variant="body"
              onChange={e => onBlur(entity.id, e.currentTarget.value)}
              value={entity?.name ?? undefined}
            />
          </div>
          <p>Triples: {entity?.triples.length}</p>
          <div className="flex flex-wrap items-center gap-2">
            Relations:{' '}
            {entity?.relationsOut.filter(r => r.toEntity.id === '7gzF671tq5JTZ13naG4tnr').map(r => r.toEntity.name)}
          </div>
        </div>
      ))}
    </div>
  );
}
