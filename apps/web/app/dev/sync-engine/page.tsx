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
      value: { equals: 'Yaniv Tal' },
    },
  ],
};

const whereNik: WhereCondition = {
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
      entityName: 'Yaniv Tal',
      space: ID.createEntityId(),
      value: {
        type: 'TEXT',
        value: 'Yaniv Tal',
      },
    });
  };

  const makeNotAByron = () => {
    store.setTriple({
      attributeId: SystemIds.NAME_PROPERTY,
      entityId: ID.createEntityId(),
      attributeName: 'Name',
      entityName: 'Nik Graf',
      space: ID.createEntityId(),
      value: {
        type: 'TEXT',
        value: 'Nik Graf',
      },
    });
  };

  return (
    <div className="font-mono">
      <button>Clear</button>
      <div className="flex w-full justify-between">
        <div>
          <button onClick={makeAnotherByron}>Make entity to match Yaniv filter</button>
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
  const { store } = useSyncEngine();
  const { entities, isLoading } = useQueryEntities({
    where: whereByron,
  });

  console.log('Yaniv rendering');

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
      space: entity.spaces[0],
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

function Nik() {
  const { store } = useSyncEngine();
  const { entities, isLoading } = useQueryEntities({
    where: whereNik,
  });

  console.log('Nik rendering');

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
      space: entity.spaces[0],
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
