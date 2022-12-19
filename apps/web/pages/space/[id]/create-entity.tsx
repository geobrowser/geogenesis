import { GetServerSideProps } from 'next';
import { useMemo } from 'react';
import { EditableEntityPage } from '~/modules/components/entity/editable-entity-page';
import { ID } from '~/modules/id';
import { EntityStoreProvider } from '~/modules/state/entity-store-provider';

interface Props {
  spaceId: string;
}

export default function CreateEntity({ spaceId }: Props) {
  const newId = useMemo(() => ID.createEntityId(), []);

  return (
    <EntityStoreProvider id={newId} spaceId={spaceId} initialTriples={[]}>
      <EditableEntityPage id={newId} name="" space={spaceId} triples={[]} />
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
