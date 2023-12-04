import { redirect } from 'next/navigation';

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

  const person = await Subgraph.fetchEntity({ id: params.entityId, endpoint: config.subgraph });

  // @TODO: Real error handling
  if (!person) {
    return (
      <ProfilePageComponent
        id={params.entityId}
        triples={[]}
        spaceId={params.id}
        referencedByComponent={
          <React.Suspense fallback={<EntityReferencedByLoading />}>
            <EntityReferencedByServerContainer entityId={params.entityId} name={null} spaceId={params.id} />
          </React.Suspense>
        }
      />
    );
  }

  // @HACK: Entities we are rendering might be in a different space. Right now we aren't fetching
  // the space for the entity we are rendering, so we need to redirect to the correct space.
  if (person?.nameTripleSpace) {
    if (params.id !== person?.nameTripleSpace) {
      console.log(
        `Redirecting from incorrect space ${params.id} to correct space ${person?.nameTripleSpace} for entity ${params.entityId}`
      );
      return redirect(`/space/${person?.nameTripleSpace}/${params.entityId}`);
    }
  }

  return (
    <ProfilePageComponent
      id={params.entityId}
      triples={person.triples}
      spaceId={params.id}
      referencedByComponent={
        <React.Suspense fallback={<EntityReferencedByLoading />}>
          <EntityReferencedByServerContainer entityId={person.id} name={person.name} spaceId={params.id} />
        </React.Suspense>
      }
    />
  );
}
