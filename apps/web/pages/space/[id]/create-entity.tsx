import type { GetServerSideProps } from 'next';
import { useMemo } from 'react';

import { EditableEntityPage } from '~/modules/components/entity/editable-entity-page';
import { EntityStoreProvider } from '~/modules/entity';
import { ID } from '~/modules/id';

interface Props {
  spaceId: string;
}

export default function CreateEntity({ spaceId }: Props) {
  const newId = useMemo(() => ID.createEntityId(), []);

  return (
    <EntityStoreProvider
      id={newId}
      spaceId={spaceId}
      initialTriples={[]}
      initialSchemaTriples={[]}
      initialBlockTriples={[]}
      initialBlockIdsTriple={null}
    >
      <EditableEntityPage versions={[]} id={newId} name="" space={spaceId} triples={[]} schemaTriples={[]} />
    </EntityStoreProvider>
  );
}

export const getServerSideProps: GetServerSideProps<Props> = async context => {
  const spaceId = context.query.id as string;

  return {
    props: {
      spaceId,
      key: spaceId,
    },
  };
};
