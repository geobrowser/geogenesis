'use client';

import { Providers } from '~/core/providers';
import { useEntities, useEntity } from '~/core/v2.db/entities';

export default function Page() {
  return <Idk />;
}

function Idk() {
  const entity = useEntity('1155beff-fad5-49b7-a2e0-da4777b8792c');
  // const entities = useEntities();
  console.log('entity', entity);

  return <Providers>{JSON.stringify(entity, null, 2)}</Providers>;
}
