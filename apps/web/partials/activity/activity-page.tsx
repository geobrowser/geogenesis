import { SystemIds } from '@geoprotocol/geo-sdk';
import { Effect } from 'effect';

import { Suspense } from 'react';

import { PLACEHOLDER_SPACE_IMAGE } from '~/core/constants';
import { fetchProposalsByUser } from '~/core/io/fetch-proposals-by-user';
import { fetchProfile } from '~/core/io/subgraph';
import { getProposalName } from '~/core/utils/utils';

import { GeoImage } from '~/design-system/geo-image';
import { Spacer } from '~/design-system/spacer';

import { ActivityLoading } from './activity-loading';
import { cachedFetchEntity } from '~/app/space/(entity)/[id]/[entityId]/cached-fetch-entity';

interface Props {
  entityId: string | null;

  searchParams: {
    spaceId?: string;
  };
}

export async function ActivityPage({ searchParams, entityId }: Props) {
  return (
    // loading.tsx only runs on the server the first time you load the page. Subsequent loads
    // require a manually defined suspense boundary.
    // https://github.com/vercel/next.js/issues/43548
    <Suspense key={`?spaceId=${searchParams?.spaceId}`} fallback={<ActivityLoading />}>
      <ActivityList entityId={entityId} searchParams={searchParams} />
    </Suspense>
  );
}

async function ActivityList({ searchParams, entityId }: Props) {
  if (!entityId) {
    return <p className="pt-1 text-body text-grey-04">There is no information here yet.</p>;
  }

  const entity = await cachedFetchEntity(entityId);

  // Fetch the activity based on the wallets defined on the entity's Wallets triple
  // Right now we assume it's set as an entity value but it might be a collection at
  // some point in the future.
  const address = entity?.relations.find(t => t.type.id === SystemIds.ACCOUNTS_PROPERTY)?.toEntity.name;

  const profile = address ? await Effect.runPromise(fetchProfile(address)) : null;

  const proposals = profile?.spaceId
    ? await fetchProposalsByUser({
        proposerSpaceId: profile.spaceId,
        spaceId: searchParams.spaceId,
      })
    : [];

  if (proposals.length === 0) return <p className="pt-1 text-body text-grey-04">There is no information here yet.</p>;

  return (
    <div className="divide-y divide-divider">
      {proposals.length === 0 ? (
        <>
          <Spacer height={20} />
          <p className="py-3 text-body text-grey-04">There is no information here yet.</p>
        </>
      ) : (
        proposals.map(p => {
          const space = p.space;
          const spaceName = space.name ?? space.id;
          const spaceImage = space.image ?? PLACEHOLDER_SPACE_IMAGE;

          // e.g. Mar 12, 2023
          const formattedLastEditedDate =
            p.createdAt === 0
              ? ''
              : new Date(p.createdAt * 1000).toLocaleDateString(undefined, {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                });

          const proposalName = getProposalName({ ...p, name: p.name ?? p.id });

          return (
            <div key={p.id} className="flex flex-col gap-2 py-3">
              <div className="flex w-full items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="relative h-4 w-4 overflow-hidden rounded-sm">
                    <GeoImage
                      style={{ objectFit: 'cover' }}
                      priority
                      fill
                      value={spaceImage ?? PLACEHOLDER_SPACE_IMAGE}
                      alt=""
                    />
                  </div>
                  <p className="text-metadataMedium">{proposalName}</p>
                </div>
                <p className="text-breadcrumb text-grey-04 tabular-nums">{formattedLastEditedDate}</p>
              </div>

              <p className="pl-6 text-breadcrumb">{spaceName}</p>
            </div>
          );
        })
      )}
    </div>
  );
}
