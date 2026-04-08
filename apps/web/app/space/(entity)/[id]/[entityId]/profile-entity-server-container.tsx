import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import * as React from 'react';

import { redirect } from 'next/navigation';

import { fetchOnchainProfileByEntityId } from '~/core/io/fetch-onchain-profile-by-entity-id';
import { EntityId } from '~/core/io/substream-schema';
import { TrackedErrorBoundary } from '~/core/telemetry/tracked-error-boundary';
import { Spaces } from '~/core/utils/space';
import { NavUtils } from '~/core/utils/utils';

import { EmptyErrorComponent } from '~/design-system/empty-error-component';

import { BacklinksServerContainer } from '~/partials/entity-page/backlinks-server-container';

import { cachedFetchEntityPage } from './cached-fetch-entity';
import { ProfilePageComponent } from './profile-entity-page';
import { SpaceRedirect } from './space-redirect';
import { cachedFetchSpace } from '~/app/space/[id]/cached-fetch-space';

type Props = {
  params: { id: string; entityId: string };
  searchParams?: { [key: string]: string | string[] | undefined };
};

export async function ProfileEntityServerContainer({ params, searchParams }: Props) {
  const spaceId = params.id;
  const entityId = params.entityId;

  const [entityPage, profile] = await Promise.all([
    cachedFetchEntityPage(entityId, spaceId),
    fetchOnchainProfileByEntityId(entityId),
  ]);

  const person = entityPage?.entity;
  const spaces = person?.spaces ?? [];

  /**
   * This is temporary solution for redirecting from invalid space to valid one.
   * because fetchOnchainProfileByEntityId(entityId) is not implemented yet.
   *
   * Redirect from an invalid space to a valid one.
   *
   * We need to check that spaces has data. We could be navigating
   * to an entity with no data like a relation entity page.
   */

  if (person && spaces.length > 0 && !spaces.includes(spaceId)) {
    const newSpaceId = Spaces.getValidSpaceIdForEntity(person);

    if (newSpaceId) {
      return redirect(NavUtils.toEntity(newSpaceId, entityId));
    }
  }

  // @TODO: Real error handling
  if (!person) {
    return (
      <ProfilePageComponent
        id={params.entityId}
        values={[]}
        spaceId={params.id}
        relations={[]}
        referencedByComponent={
          <TrackedErrorBoundary fallback={<EmptyErrorComponent />}>
            <React.Suspense fallback={<div />}>
              <BacklinksServerContainer entityId={params.entityId} />
            </React.Suspense>
          </TrackedErrorBoundary>
        }
      />
    );
  }

  const deterministicSpaceId = Spaces.getDeterministicSpaceId(spaces, spaceId) ?? profile?.homeSpaceId ?? null;
  const preventRedirect = searchParams?.edit === 'true';

  if (
    person?.types.some(type => type.id === EntityId(SystemIds.SPACE_TYPE)) &&
    !preventRedirect &&
    deterministicSpaceId
  ) {
    const space = await cachedFetchSpace(deterministicSpaceId);
    if (space?.entity?.id === entityId) {
      return redirect(NavUtils.toSpace(deterministicSpaceId));
    }
  }

  return (
    <SpaceRedirect
      entityId={entityId}
      spaceId={spaceId}
      serverSpaces={spaces}
      deterministicSpaceId={deterministicSpaceId}
      preventRedirect={preventRedirect}
    >
      <ProfilePageComponent
        id={params.entityId}
        values={person.values}
        spaceId={params.id}
        relations={person.relations}
        referencedByComponent={
          <TrackedErrorBoundary fallback={<EmptyErrorComponent />}>
            <React.Suspense fallback={<div />}>
              <BacklinksServerContainer entityId={params.entityId} />
            </React.Suspense>
          </TrackedErrorBoundary>
        }
      />
    </SpaceRedirect>
  );
}
