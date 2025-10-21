import { SystemIds } from '@graphprotocol/grc-20';
import { redirect } from 'next/navigation';
import { ErrorBoundary } from 'react-error-boundary';

import * as React from 'react';

import { fetchOnchainProfileByEntityId } from '~/core/io/fetch-onchain-profile-by-entity-id';
import { EntityId } from '~/core/io/schema';
import { NavUtils } from '~/core/utils/utils';

import { EmptyErrorComponent } from '~/design-system/empty-error-component';

import { BacklinksServerContainer } from '~/partials/entity-page/backlinks-server-container';

import { cachedFetchEntityPage } from './cached-fetch-entity';
import { ProfilePageComponent } from './profile-entity-page';

interface Props {
  params: { id: string; entityId: string };
}

export async function ProfileEntityServerContainer({ params }: Props) {
  const spaceId = params.id;
  const entityId = params.entityId;

  const [entityPage, profile] = await Promise.all([
    cachedFetchEntityPage(entityId, spaceId),
    fetchOnchainProfileByEntityId(entityId),
  ]);

  const person = entityPage?.entity;

  // @TODO: Real error handling
  if (!person) {
    return (
      <ProfilePageComponent
        id={params.entityId}
        values={[]}
        spaceId={params.id}
        relations={[]}
        referencedByComponent={
          <ErrorBoundary fallback={<EmptyErrorComponent />}>
            <React.Suspense fallback={<div />}>
              <BacklinksServerContainer entityId={params.entityId} />
            </React.Suspense>
          </ErrorBoundary>
        }
      />
    );
  }

  // Redirect from space configuration page to space page. An entity might be a Person _and_ a Space.
  // In that case we want to render on the space front page.
  // if (person?.types.some(type => type.id === EntityId(SystemIds.SPACE_TYPE)) && profile?.homeSpaceId) {
  //   console.log(`Redirecting from space configuration entity ${person.id} to space page ${profile?.homeSpaceId}`);

  //   // We need to stay in the space that we're currently in
  //   return redirect(NavUtils.toSpace(profile.homeSpaceId));
  // }

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
      values={person.values}
      spaceId={params.id}
      relations={person.relations}
      referencedByComponent={
        <ErrorBoundary fallback={<EmptyErrorComponent />}>
          <React.Suspense fallback={<div />}>
            <BacklinksServerContainer entityId={params.entityId} />
          </React.Suspense>
        </ErrorBoundary>
      }
    />
  );
}
