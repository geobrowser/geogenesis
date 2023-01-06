import { GetServerSideProps } from 'next';
import { useMemo } from 'react';
import { EditableEntityPage } from '~/modules/components/entity/editable-entity-page';
import { ID } from '~/modules/id';
import { EntityStoreProvider } from '~/modules/entity/entity-store-provider';
import { Triple } from '~/modules/types';
import { Params } from '~/modules/params';
import { StorageClient } from '~/modules/services/storage';
import { Network } from '~/modules/services/network';

interface Props {
  spaceId: string;
  triples: Triple[];
  attributes: Triple[];
}

export default function CreateEntity({ spaceId, triples, attributes }: Props) {
  const newId = useMemo(() => ID.createEntityId(), []);

  return (
    <EntityStoreProvider id={newId} spaceId={spaceId} initialTriples={[]}>
      <EditableEntityPage id={newId} name="" space={spaceId} triples={triples} attributes={attributes} />
    </EntityStoreProvider>
  );
}

export const getServerSideProps: GetServerSideProps<Props> = async context => {
  const space = context.query.id as string;
  const config = Params.getConfigFromUrl(context.resolvedUrl, context.req.cookies[Params.ENV_PARAM_NAME]);
  const storage = new StorageClient(config.ipfs);

  const network = new Network(storage, config.subgraph);

  const [triples, attributes] = await Promise.all([
    network.fetchTriples({
      space,
      query: '',
      skip: 0,
      first: 100,
      filter: [],
    }),
    network.fetchTriples({
      space,
      query: '',
      skip: 0,
      first: 100,
      filter: [{ field: 'attribute-name', value: 'Attributes' }],
    }),
  ]);

  return {
    props: {
      spaceId: space,
      triples: triples.triples,
      attributes: attributes.triples,
    },
  };
};
