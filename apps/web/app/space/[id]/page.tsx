import { SYSTEM_IDS } from '@geogenesis/sdk';
import { redirect } from 'next/navigation';

import * as React from 'react';

import type { Metadata } from 'next';

import { fetchSubspacesBySpaceId } from '~/core/io/subgraph/fetch-subspaces';
import { Triple as ITriple } from '~/core/types';
import { NavUtils, getOpenGraphMetadataForEntity } from '~/core/utils/utils';
import { Value } from '~/core/utils/value';

import { Skeleton } from '~/design-system/skeleton';
import { Spacer } from '~/design-system/spacer';

import { Editor } from '~/partials/editor/editor';
import {
  EntityReferencedByLoading,
  EntityReferencedByServerContainer,
} from '~/partials/entity-page/entity-page-referenced-by-server-container';
import { ToggleEntityPage } from '~/partials/entity-page/toggle-entity-page';
import { SpaceNotices } from '~/partials/space-page/space-notices';
import { Subspaces } from '~/partials/space-page/subspaces';

import { cachedFetchSpace } from './cached-fetch-space';

interface Props {
  params: { id: string };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const spaceId = params.id;

  const space = await cachedFetchSpace(spaceId);
  const entity = space?.spaceConfig;

  if (!entity) {
    console.log(`Redirecting to /space/${spaceId}/entities`);
    redirect(`/space/${spaceId}/entities`);
  }

  const { entityName, description, openGraphImageUrl } = getOpenGraphMetadataForEntity(entity);

  return {
    title: entityName ?? spaceId,
    description,
    openGraph: {
      title: entityName ?? spaceId,
      description: description ?? undefined,
      url: `https://geobrowser.io${NavUtils.toEntity(spaceId, entity.id)}`,
      images: openGraphImageUrl
        ? [
            {
              url: openGraphImageUrl,
            },
          ]
        : undefined,
    },
    twitter: {
      card: 'summary_large_image',
      description: description ?? undefined,
      images: openGraphImageUrl
        ? [
            {
              url: openGraphImageUrl,
            },
          ]
        : undefined,
    },
  };
}

export default async function SpacePage({ params }: Props) {
  const spaceId = params.id;
  const props = await getData(spaceId);
  const spaceType = getSpaceType(props.triples);

  return (
    <>
      {spaceType && <SpaceNotices spaceType={spaceType} spaceId={spaceId} />}
      <React.Suspense fallback={<SubspacesSkeleton />}>
        <SubspacesContainer spaceId={params.id} />
      </React.Suspense>
      <Editor shouldHandleOwnSpacing spacePage />
      <ToggleEntityPage {...props} />
      <Spacer height={40} />
      <React.Suspense fallback={<EntityReferencedByLoading />}>
        <EntityReferencedByServerContainer entityId={props.id} name={props.name} spaceId={spaceId} />
      </React.Suspense>
    </>
  );
}

const SubspacesSkeleton = () => {
  return (
    <>
      <div className="h-10" />
      <div className="no-scrollbar grid grid-cols-3 gap-8 overflow-x-scroll xl:grid-cols-2" aria-hidden>
        <Skeleton className="aspect-video w-full" />
        <Skeleton className="aspect-video w-full" />
        <Skeleton className="aspect-video w-full xl:hidden" />
      </div>
      <Spacer height={40} />
    </>
  );
};

type SubspacesContainerProps = {
  spaceId: string;
};

const SubspacesContainer = async ({ spaceId }: SubspacesContainerProps) => {
  const subspaces = await fetchSubspacesBySpaceId(spaceId);

  if (subspaces.length === 0) {
    return null;
  }

  return <Subspaces subspaces={subspaces} />;
};

const getData = async (spaceId: string) => {
  const space = await cachedFetchSpace(spaceId);
  const entity = space?.spaceConfig;

  if (!entity) {
    console.log(`Redirecting to /space/${spaceId}/entities`);
    redirect(`/space/${spaceId}/entities`);
  }

  return {
    name: entity?.name ?? null,
    triples: entity?.triples ?? [],
    id: entity.id,
    spaceId,
    subspaces: [],
  };
};

export type SpacePageType = 'person' | 'company' | 'nonprofit';

// @TODO: Fetch the types on the entity directly instead of parsing the triples.
// This is broken right now as the type triple might be an entity or might be
// a collection.
const getSpaceType = (triples: Array<ITriple>): SpacePageType | null => {
  const typeTriples = triples.filter(triple => triple.attributeId === SYSTEM_IDS.TYPES);

  if (typeTriples.some(triple => Value.entityValue(triple) === SYSTEM_IDS.PERSON_TYPE)) {
    return 'person';
  } else if (typeTriples.some(triple => Value.entityValue(triple) === SYSTEM_IDS.COMPANY_TYPE)) {
    return 'company';
  } else if (typeTriples.some(triple => Value.entityValue(triple) === SYSTEM_IDS.NONPROFIT_TYPE)) {
    return 'nonprofit';
  } else {
    return null;
  }
};
