import type { GetServerSideProps } from 'next';
import { useMemo } from 'react';
import { EditableHeading } from '~/modules/components/entity/editable-entity-header';

import { EditableEntityPage } from '~/modules/components/entity/editable-entity-page';
import { EntityPageContentContainer } from '~/modules/components/entity/entity-page-content-container';
import { EntityPageCover } from '~/modules/components/entity/entity-page-cover';
import { Entity, EntityStoreProvider, useEntityStore } from '~/modules/entity';
import { ID } from '~/modules/id';
import { NetworkData } from '~/modules/io';
import { Params } from '~/modules/params';
import { StorageClient } from '~/modules/services/storage';
import { fetchForeignTypeTriples, fetchSpaceTypeTriples } from '~/modules/spaces/fetch-types';
import { TypesStoreProvider } from '~/modules/type/types-store';
import { Space, Triple } from '~/modules/types';

interface Props {
  spaceId: string;
  space: Space | null;
  spaceTypes: Triple[];
}

export default function CreateEntity({ spaceId, spaceTypes, space }: Props) {
  const newId = useMemo(() => ID.createEntityId(), []);

  return (
    <TypesStoreProvider initialTypes={spaceTypes} space={space}>
      <EntityStoreProvider
        id={newId}
        spaceId={spaceId}
        initialTriples={[]}
        initialSchemaTriples={[]}
        initialBlockTriples={[]}
        initialBlockIdsTriple={null}
      >
        <CreateEntityContent newId={newId} spaceId={spaceId} />
      </EntityStoreProvider>
    </TypesStoreProvider>
  );
}

export function CreateEntityContent({ spaceId, newId }: { spaceId: string; newId: string }) {
  const { triples } = useEntityStore();
  const avatarUrl = Entity.avatar(triples) ?? null;
  const coverUrl = Entity.cover(triples) ?? null;

  return (
    <>
      <EntityPageCover avatarUrl={avatarUrl} coverUrl={coverUrl} />
      <EntityPageContentContainer>
        <EditableHeading spaceId={spaceId} entityId={newId} name="" triples={triples} />
        <EditableEntityPage id={newId} name="" spaceId={spaceId} triples={[]} />
      </EntityPageContentContainer>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<Props> = async context => {
  const spaceId = context.query.id as string;
  const config = Params.getConfigFromUrl(context.resolvedUrl, context.req.cookies[Params.ENV_PARAM_NAME]);

  const storage = new StorageClient(config.ipfs);
  const network = new NetworkData.Network(storage, config.subgraph);

  const spaces = await network.fetchSpaces();
  const space = spaces.find(s => s.id === spaceId) ?? null;

  const [spaceTypes, foreignSpaceTypes] = await Promise.all([
    fetchSpaceTypeTriples(network, spaceId),
    space ? fetchForeignTypeTriples(network, space) : [],
  ]);

  return {
    props: {
      spaceId,
      space,
      spaceTypes: [...spaceTypes, ...foreignSpaceTypes],
    },
  };
};
