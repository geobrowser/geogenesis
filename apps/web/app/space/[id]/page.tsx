import { IdUtils, SystemIds } from '@geoprotocol/geo-sdk';
import { notFound } from 'next/navigation';

import * as React from 'react';

import type { Metadata } from 'next';

import { Subspace } from '~/core/io/dto/subspaces';
import { TrackedErrorBoundary } from '~/core/telemetry/tracked-error-boundary';
import { firstLine } from '~/core/opengraph';
import { Entities } from '~/core/utils/entity';

import { EmptyErrorComponent } from '~/design-system/empty-error-component';
import { Skeleton } from '~/design-system/skeleton';
import { Spacer } from '~/design-system/spacer';

import { Editor } from '~/partials/editor/editor';
import { BacklinksServerContainer } from '~/partials/entity-page/backlinks-server-container';
import { ToggleEntityPage } from '~/partials/entity-page/toggle-entity-page';
import { Subspaces } from '~/partials/space-page/subspaces';

import { cachedFetchSpace } from './cached-fetch-space';

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const params = await props.params;
  const spaceId = params.id;

  if (!IdUtils.isValid(spaceId)) {
    return { title: 'Not Found' };
  }

  const space = await cachedFetchSpace(spaceId);
  const entity = space?.entity;

  if (!entity) {
    return {
      title: `Space ${spaceId}`,
      description: 'No entity found for this space.',
    };
  }

  const entityName = entity.name ?? null;
  const description = firstLine(Entities.description(entity.values ?? []));

  return {
    title: entityName ?? spaceId,
    description,
  };
}

export default async function SpacePage(props0: Props) {
  const params = await props0.params;
  const spaceId = params.id;

  if (!IdUtils.isValid(spaceId)) {
    notFound();
  }

  const props = await getSpaceFrontPage(spaceId);

  return (
    <>
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
      <TrackedErrorBoundary fallback={<EmptyErrorComponent />}>
        <React.Suspense fallback={<div />}>
          <BacklinksServerContainer entityId={props.id} />
        </React.Suspense>
      </TrackedErrorBoundary>
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
