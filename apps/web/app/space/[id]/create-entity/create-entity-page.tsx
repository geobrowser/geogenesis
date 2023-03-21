'use client';

import * as React from 'react';
import { useMemo } from 'react';

import { EditableEntityPage } from '~/modules/components/entity/editable-entity-page';
import { EntityStoreProvider } from '~/modules/entity';
import { ID } from '~/modules/id';

interface Props {
  spaceId: string;
}

export default function CreateEntityPageClient({ spaceId }: Props) {
  const newId = useMemo(() => ID.createEntityId(), []);

  return (
    <EntityStoreProvider id={newId} spaceId={spaceId} initialTriples={[]} initialSchemaTriples={[]}>
      <EditableEntityPage id={newId} name="" space={spaceId} triples={[]} schemaTriples={[]} />
    </EntityStoreProvider>
  );
}
