import * as React from 'react';

import { Environment } from '~/core/environment';
import { API, Subgraph } from '~/core/io';
import { Entity } from '~/core/utils/entity';

import {
  EntityReferencedByLoading,
  EntityReferencedByServerContainer,
} from '~/partials/entity-page/entity-page-referenced-by-server-container';

import { ProfilePageComponent } from './profile-entity-page';

export const runtime = 'edge';

interface Props {
  params: { id: string; entityId: string };
}

export async function ProfileEntityServerContainer({ params }: Props) {
  let config = Environment.getConfig(process.env.NEXT_PUBLIC_APP_ENV);

  const { isPermissionlessSpace } = await API.space(params.id);

  if (isPermissionlessSpace) {
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

  return (
    <ProfilePageComponent
      id={params.entityId}
      triples={profile.triples}
      spaceId={params.id}
      referencedByComponent={
        <React.Suspense fallback={<EntityReferencedByLoading />}>
          <EntityReferencedByServerContainer entityId={person.id} name={person.name} spaceId={params.id} />
        </React.Suspense>
      }
    />
  );
}
