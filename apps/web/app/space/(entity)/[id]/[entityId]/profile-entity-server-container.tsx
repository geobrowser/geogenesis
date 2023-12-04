import * as React from 'react';

import { Environment } from '~/core/environment';
import { API, Subgraph } from '~/core/io';
import { Entity } from '~/core/utils/entity';

import {
  EntityReferencedByLoading,
  EntityReferencedByServerContainer,
} from '~/partials/entity-page/entity-page-referenced-by-server-container';

import { ProfilePageComponent } from './profile-entity-page';

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

  const personTriples = await Subgraph.fetchTriples({
    query: '',
    space: params.id,
    filter: [{ field: 'entity-id', value: params.entityId }],
    endpoint: config.subgraph,
    skip: 0,
    first: 100,
  });

  if (personTriples.length === 0) {
    <ProfilePageComponent
      id={params.entityId}
      triples={personTriples}
      spaceId={params.id}
      referencedByComponent={
        <React.Suspense fallback={<EntityReferencedByLoading />}>
          <EntityReferencedByServerContainer entityId={params.entityId} name={null} spaceId={params.id} />
        </React.Suspense>
      }
    />;
  }

  return (
    <ProfilePageComponent
      id={params.entityId}
      triples={personTriples}
      spaceId={params.id}
      referencedByComponent={
        <React.Suspense fallback={<EntityReferencedByLoading />}>
          <EntityReferencedByServerContainer
            entityId={params.entityId}
            name={Entity.name(personTriples)}
            spaceId={params.id}
          />
        </React.Suspense>
      }
    />
  );
}
