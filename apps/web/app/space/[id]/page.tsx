import { SystemIds } from '@geoprotocol/geo-sdk';
import { ErrorBoundary } from 'react-error-boundary';

import * as React from 'react';

import type { Metadata } from 'next';

import { Subspace } from '~/core/io/dto/subspaces';
import { NavUtils, getOpenGraphMetadataForEntity } from '~/core/utils/utils';

import { EmptyErrorComponent } from '~/design-system/empty-error-component';
import { Skeleton } from '~/design-system/skeleton';
import { Spacer } from '~/design-system/spacer';

import { Editor } from '~/partials/editor/editor';
import { BacklinksServerContainer } from '~/partials/entity-page/backlinks-server-container';
import { ToggleEntityPage } from '~/partials/entity-page/toggle-entity-page';
import { SpaceNotices } from '~/partials/space-page/space-notices';
import { Subspaces } from '~/partials/space-page/subspaces';

import { cachedFetchSpace } from './cached-fetch-space';

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const params = await props.params;
  const spaceId = params.id;

  const space = await cachedFetchSpace(spaceId);
  const entity = space?.entity;

  if (!entity) {
    return {
      title: `Space ${spaceId}`,
      description: 'No entity found for this space.',
    };
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

export default async function SpacePage(props0: Props) {
  const params = await props0.params;
  const spaceId = params.id;
  const props = await getSpaceFrontPage(spaceId);
  const spaceType = getSpaceType(props.spaceTypes);

  return (
    <>
      {spaceType && <SpaceNotices spaceType={spaceType} spaceId={spaceId} entityId={props.id} />}
      <React.Suspense fallback={<SubspacesSkeleton />}>
        <SubspacesContainer spaceId={params.id} />
      </React.Suspense>
      <React.Suspense fallback={null}>
        <Editor spaceId={spaceId} shouldHandleOwnSpacing spacePage />
      </React.Suspense>
      <ToggleEntityPage id={props.id} spaceId={spaceId} />
      <Spacer height={40} />
      {/*
        Some SEO parsers fail to parse meta tags if there's no fallback in a suspense
        boundary. We don't want to show any referenced by loading states but do want to
        stream it in
      */}
      <ErrorBoundary fallback={<EmptyErrorComponent />}>
        <React.Suspense fallback={<div />}>
          <BacklinksServerContainer entityId={props.id} />
        </React.Suspense>
      </ErrorBoundary>
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
  // const subspaces = await fetchSubspacesBySpaceId(spaceId);
  const subspaces: Subspace[] = [];

  if (subspaces.length === 0) {
    return null;
  }

  return <Subspaces subspaces={subspaces} />;
};

const getSpaceFrontPage = async (spaceId: string) => {
  const space = await cachedFetchSpace(spaceId);
  const entity = space?.entity;

  if (!entity) {
    return {
      id: '',
      name: null,
      values: [],
      relations: [],
      spaceTypes: [],
    };
  }

  return {
    name: entity?.name ?? null,
    values: entity?.values ?? [],
    id: entity.id,
    spaceTypes: space?.entity?.types ?? [],
    relationsOut: entity?.relations ?? [],
  };
};

export type SpacePageType = 'person' | 'company' | 'nonprofit';

const getSpaceType = (types: { id: string; name: string | null }[]): SpacePageType | null => {
  if (types.some(type => type.id === SystemIds.PERSON_TYPE)) {
    return 'person';
  } else if (types.some(type => type.id === SystemIds.COMPANY_TYPE)) {
    return 'company';
  } else if (types.some(type => type.id === SystemIds.NONPROFIT_TYPE)) {
    return 'nonprofit';
  } else {
    return null;
  }
};
