import { Environment } from '~/core/environment';
import { Subgraph } from '~/core/io';
import { Entity } from '~/core/utils/entity';

import { ProfilePageComponent } from './profile-entity-page';

export const runtime = 'edge';

interface Props {
  params: { id: string; entityId: string };
}

export async function ProfileEntityServerContainer({ params }: Props) {
  let config = Environment.getConfig(process.env.NEXT_PUBLIC_APP_ENV);

  let space = await Subgraph.fetchSpace({ endpoint: config.subgraph, id: params.id });
  let usePermissionlessSubgraph = false;

  if (!space) {
    space = await Subgraph.fetchSpace({ endpoint: config.permissionlessSubgraph, id: params.id });
    if (space) usePermissionlessSubgraph = true;
  }

  if (usePermissionlessSubgraph) {
    config = {
      ...config,
      subgraph: config.permissionlessSubgraph,
    };
  }

  const person = await Subgraph.fetchEntity({ id: params.entityId, endpoint: config.subgraph });

  // @TODO: Real error handling
  if (!person) {
    return {
      id: params.entityId,
      name: null,
      avatarUrl: null,
      coverUrl: null,
      triples: [],
      types: [],
      description: null,
    };
  }

  const profile = {
    ...person,
    avatarUrl: Entity.avatar(person.triples),
    coverUrl: Entity.cover(person.triples),
  };

  return <ProfilePageComponent id={params.entityId} triples={profile.triples} spaceId={params.id} />;
}
