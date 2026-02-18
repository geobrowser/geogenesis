import { SystemIds } from '@geoprotocol/geo-sdk';
import { redirect } from 'next/navigation';
import { ErrorBoundary } from 'react-error-boundary';

import * as React from 'react';

import { fetchOnchainProfileByEntityId } from '~/core/io/fetch-onchain-profile-by-entity-id';
import { EntityId } from '~/core/io/substream-schema';
import { Spaces } from '~/core/utils/space';
import { NavUtils } from '~/core/utils/utils';

import { EmptyErrorComponent } from '~/design-system/empty-error-component';

import { BacklinksServerContainer } from '~/partials/entity-page/backlinks-server-container';

import { cachedFetchEntityPage } from './cached-fetch-entity';
import { ProfilePageComponent } from './profile-entity-page';

interface Props {
  params: { id: string; entityId: string };
  searchParams?: { [key: string]: string | string[] | undefined };
}

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

    return redirect(NavUtils.toEntity(newSpaceId, entityId));
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
          <ErrorBoundary fallback={<EmptyErrorComponent />}>
            <React.Suspense fallback={<div />}>
              <BacklinksServerContainer entityId={params.entityId} />
            </React.Suspense>
          </ErrorBoundary>
        }
      />
    );
  }

  const spaces = person.spaces ?? [];
  const deterministicSpaceId = Spaces.getDeterministicSpaceId(spaces, spaceId) ?? profile?.homeSpaceId ?? null;
  const preventRedirect = searchParams?.edit === 'true';

  /**
   * When navigating from edit mode, ?edit=true is passed which sets
   * preventRedirect. This preserves the user's editing context by
   * keeping them in the current space. This is safe because entity
   * data is fetched by entityId (spaceId is contextual, not an access
   * boundary) and write operations are gated by on-chain governance.
   */
  if (deterministicSpaceId && params.id !== deterministicSpaceId && !preventRedirect) {
    console.log(
      `Redirecting from incorrect space ${params.id} to correct space ${deterministicSpaceId} for profile ${entityId}`
    );
    return redirect(NavUtils.toEntity(deterministicSpaceId, entityId));
  }

  if (person?.types.some(type => type.id === EntityId(SystemIds.SPACE_TYPE)) && !preventRedirect && deterministicSpaceId) {
    console.log(`Redirecting from space configuration entity ${person.id} to space page ${deterministicSpaceId}`);
    return redirect(NavUtils.toSpace(deterministicSpaceId));
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
