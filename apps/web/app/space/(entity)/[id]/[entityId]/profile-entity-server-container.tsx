import { SYSTEM_IDS } from '@geogenesis/ids';
import { redirect } from 'next/navigation';

import * as React from 'react';

import { Subgraph } from '~/core/io';

import {
  EntityReferencedByLoading,
  EntityReferencedByServerContainer,
} from '~/partials/entity-page/entity-page-referenced-by-server-container';

import { ProfilePageComponent } from './profile-entity-page';

interface Props {
  params: { id: string; entityId: string };
}

export async function ProfileEntityServerContainer({ params }: Props) {
  const person = await Subgraph.fetchEntity({ id: decodeURIComponent(params.entityId) });

  // @TODO: Real error handling
  if (!person) {
    return <ProfilePageComponent id={params.entityId} triples={[]} spaceId={params.id} referencedByComponent={null} />;
  }

  // @HACK: Entities we are rendering might be in a different space. Right now we aren't fetching
  // the space for the entity we are rendering, so we need to redirect to the correct space.
  // Once we have cross-space entity data we won't redirect and will instead only show the data
  // from the current space for the selected entity.
  if (person?.nameTripleSpace) {
    if (params.id !== person?.nameTripleSpace) {
      console.log(
        `Redirecting from incorrect space ${params.id} to correct space ${person?.nameTripleSpace} for entity ${params.entityId}`
      );
      return redirect(`/space/${person?.nameTripleSpace}/${encodeURIComponent(params.entityId)}`);
    }
  }

  // Redirect from space configuration page to space page
  if (person?.types.some(type => type.id === SYSTEM_IDS.SPACE_CONFIGURATION) && person?.nameTripleSpace) {
    console.log(`Redirecting from space configuration entity ${person.id} to space page ${person?.nameTripleSpace}`);
    return redirect(`/space/${person?.nameTripleSpace}`);
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
