'use client';

import { SystemIds } from '@graphprotocol/grc-20';

import { ID } from '~/core/id';
import { Entity } from '~/core/io/dto/entities';
import { WhereCondition } from '~/core/sync/experimental_query-layer';
import { useQueryEntities } from '~/core/sync/use-store';
import { useSyncEngine } from '~/core/sync/use-sync-engine';

const whereByron: WhereCondition = {
  triples: [
    {
      attributeId: { equals: SystemIds.NAME_PROPERTY },
      value: { equals: 'Byron' },
    },
  ],
};

const whereNik = {
  triples: [
    {
      attributeId: { equals: SystemIds.NAME_PROPERTY },
      value: { equals: 'Nik Graf' },
    },
  ],
};

export default function Page() {
  const { store } = useSyncEngine();

  const makeAnotherByron = () => {
    store.setTriple({
      attributeId: SystemIds.NAME_PROPERTY,
      entityId: ID.createEntityId(),
      attributeName: 'Name',
      entityName: 'Byron',
      space: '5',
      value: {
        type: 'TEXT',
        value: 'Byron',
      },
    });
  };

  const makeNotAByron = () => {
    store.setTriple({
      attributeId: SystemIds.NAME_PROPERTY,
      entityId: ID.createEntityId(),
      attributeName: 'Name',
      entityName: 'Nik Graf',
      space: '5',
      value: {
        type: 'TEXT',
        value: 'Nik Graf',
      },
    });
  };

  return (
    <div className="font-mono">
      <div className="flex w-full justify-between">
        <div>
          <button onClick={makeAnotherByron}>Make entity to match Byron filter</button>
          <Byron />
        </div>
        <div>
          <button onClick={makeNotAByron}>Make entity to match Nik filter</button>

          <Nik />
        </div>
      </div>
    </div>
  );
}

function Byron() {
  const { entities, isLoading } = useQueryEntities({
    where: whereByron,
  });

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (entities.length === 0) {
    return <div>Nothing to show...</div>;
  }

  return (
    <div>
      {entities.map(e => (
        <div key={e.id}>
          {e.name} – {e.id}
        </div>
      ))}
    </div>
  );
}

function Nik() {
  const { store } = useSyncEngine();
  const { entities, isLoading } = useQueryEntities({
    where: whereNik,
  });

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (entities.length === 0) {
    return <div>Nothing to show...</div>;
  }

  const onRemove = (entity: Entity) => {
    store.deleteTriple({
      attributeName: null,
      entityName: null,
      space: '5',
      attributeId: SystemIds.NAME_PROPERTY,
      entityId: entity.id,
      value: {
        type: 'TEXT',
        value: '',
      },
    });
  };

  return (
    <div>
      {entities.map(e => (
        <div onClick={() => onRemove(e)} key={e.id}>
          {e.name} – {e.id}
        </div>
      ))}
    </div>
  );
}
