import { SYSTEM_IDS } from '@geogenesis/ids';
import { redirect } from 'next/navigation';

import * as React from 'react';

import { Subgraph } from '~/core/io';
import { fetchOnchainProfileByEntityId } from '~/core/io/fetch-onchain-profile-by-entity-id';
import { NavUtils } from '~/core/utils/utils';

import {
  EntityReferencedByLoading,
  EntityReferencedByServerContainer,
} from '~/partials/entity-page/entity-page-referenced-by-server-container';

import { ProfilePageComponent } from './profile-entity-page';

interface Props {
  params: { id: string; entityId: string };
}

export async function ProfileEntityServerContainer({ params }: Props) {
  const entityId = decodeURIComponent(params.entityId);

  const [person, profile] = await Promise.all([
    Subgraph.fetchEntity({ id: entityId }),
    fetchOnchainProfileByEntityId(entityId),
  ]);

  // @TODO: Real error handling
  if (!person) {
    return <ProfilePageComponent id={params.entityId} triples={[]} spaceId={params.id} referencedByComponent={null} />;
  }

  // Redirect from space configuration page to space page. An entity might be a Person _and_ a Space.
  // In that case we want to render on the space front page.
  if (person?.types.some(type => type.id === SYSTEM_IDS.SPACE_CONFIGURATION) && profile?.homeSpaceId) {
    console.log(`Redirecting from space configuration entity ${person.id} to space page ${profile?.homeSpaceId}`);

    // We need to stay in the space that we're currently in
    return redirect(NavUtils.toSpace(profile.homeSpaceId));
  }

  // @HACK: Entities we are rendering might be in a different space. Right now we aren't fetching
  // the space for the entity we are rendering, so we need to redirect to the correct space.
  // Once we have cross-space entity data we won't redirect and will instead only show the data
  // from the current space for the selected entity.
  if (profile?.homeSpaceId) {
    if (params.id !== profile.homeSpaceId) {
      console.log('redirect url', NavUtils.toEntity(profile.homeSpaceId, entityId));

      console.log(
        `Redirecting from incorrect space ${params.id} to correct space ${profile.homeSpaceId} for profile ${entityId}`
      );
      return redirect(NavUtils.toEntity(profile.homeSpaceId, entityId));
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
