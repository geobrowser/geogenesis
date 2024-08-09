'use client';

import { useEntities } from '~/core/database/entities';
import { useWriteOps } from '~/core/database/write';
import { makeStubTriple } from '~/core/io/mocks/mock-network';

export function Database() {
  const { upsert } = useWriteOps();
  const { entities } = useEntities();

  return (
    <div>
      <h1>Database</h1>
      <button
        onClick={() => {
          upsert(makeStubTriple(Math.random().toString(36).slice(2)), '0x35483105944CD199BD336D6CEf476ea20547a9b5');
        }}
      >
        Add triple
      </button>

      {entities.map(entity => (
        <div key={entity.id}>
          <h2>{entity.name}</h2>
          <ul>
            {entity.typesIds.map(typeId => (
              <li key={typeId}>{typeId}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
