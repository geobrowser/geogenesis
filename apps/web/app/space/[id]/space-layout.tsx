import { SYSTEM_IDS } from '@geogenesis/ids';
import { redirect } from 'next/navigation';

import * as React from 'react';

import { AppConfig, Environment } from '~/core/environment';
import { API, Subgraph } from '~/core/io';
import { fetchSubspaces } from '~/core/io/subgraph/fetch-subspaces';
import { EntityStoreProvider } from '~/core/state/entity-page-store/entity-store-provider';
import { DEFAULT_PAGE_SIZE } from '~/core/state/triple-store/triple-store';
import { TypesStoreServerContainer } from '~/core/state/types-store/types-store-server-container';
import { Entity } from '~/core/utils/entity';
import { NavUtils } from '~/core/utils/utils';
import { Value } from '~/core/utils/value';

import { Skeleton } from '~/design-system/skeleton';
import { Spacer } from '~/design-system/spacer';
import { TabGroup } from '~/design-system/tab-group';

import { EditableHeading } from '~/partials/entity-page/editable-entity-header';
import { EntityPageContentContainer } from '~/partials/entity-page/entity-page-content-container';
import { EntityPageCover } from '~/partials/entity-page/entity-page-cover';
import { SpaceEditors } from '~/partials/space-page/space-editors';
import { SpaceMembers } from '~/partials/space-page/space-members';
import { SpacePageMetadataHeader } from '~/partials/space-page/space-metadata-header';
import { Subspaces } from '~/partials/space-page/subspaces';

interface Props {
  params: { id: string };
  children: React.ReactNode;
  usePermissionlessSpace?: boolean;
}

// We don't want this layout to nest within the space/ route component tree,
// so we use it like normal React component instead of a Next.js route layout.
export async function SpaceLayout({ params, children, usePermissionlessSpace }: Props) {
  let config = Environment.getConfig(process.env.NEXT_PUBLIC_APP_ENV);

  if (usePermissionlessSpace) {
    config = {
      ...config,
      subgraph: config.permissionlessSubgraph,
    };
  }

  const props = await getData(params.id, config);

  const coverUrl = Entity.cover(props.triples);

  return (
    <TypesStoreServerContainer spaceId={params.id}>
      <EntityStoreProvider
        id={props.id}
        spaceId={props.spaceId}
        initialTriples={props.triples}
        initialSchemaTriples={[]}
        initialBlockIdsTriple={props.blockIdsTriple}
        initialBlockTriples={props.blockTriples}
      >
        <EntityPageCover avatarUrl={null} coverUrl={coverUrl} />
        <EntityPageContentContainer>
          <EditableHeading
            spaceId={props.spaceId}
            entityId={props.id}
            name={props.name}
            triples={props.triples}
            showAccessControl
          />
          <SpacePageMetadataHeader
            spaceId={props.spaceId}
            membersComponent={
              <React.Suspense fallback={<MembersSkeleton />}>
                <SpaceEditors spaceId={params.id} />
                <SpaceMembers spaceId={params.id} />
              </React.Suspense>
            }
          />
          <Spacer height={40} />
          <TabGroup
            tabs={[
              {
                label: 'Overview',
                href: `${NavUtils.toSpace(params.id)}`,
              },
              {
                label: 'Governance',
                href: `${NavUtils.toSpace(params.id)}/governance`,
              },
            ]}
          />
          <Spacer height={20} />
          <React.Suspense fallback={null}>
            <SubspacesContainer entityId={props.id} />
          </React.Suspense>
          {children}
        </EntityPageContentContainer>
      </EntityStoreProvider>
    </TypesStoreServerContainer>
  );
}

type SubspacesContainerProps = {
  entityId: string;
};

const SubspacesContainer = async ({ entityId }: SubspacesContainerProps) => {
  const config = Environment.getConfig(process.env.NEXT_PUBLIC_APP_ENV);
  const subspaces = await fetchSubspaces({ entityId, endpoint: config.subgraph });

  return <Subspaces subspaces={subspaces} />;
};

function MembersSkeleton() {
  return (
    <div className="flex items-center gap-2">
      <Skeleton className="h-6 w-24" />
      <Skeleton className="h-6 w-36" />
    </div>
  );
}

const getData = async (spaceId: string, config: AppConfig) => {
  const { isPermissionlessSpace, space } = await API.space(spaceId);

  if (isPermissionlessSpace) {
    config = {
      ...config,
      subgraph: config.permissionlessSubgraph,
    };
  }

  const entityId = space?.spaceConfigEntityId;

  if (!entityId) {
    console.log(`Redirecting to /space/${spaceId}/entities`);
    redirect(`/space/${spaceId}/entities`);
  }

  const entity = await Subgraph.fetchEntity({ endpoint: config.subgraph, id: entityId });

  // @HACK: Entities we are rendering might be in a different space. Right now there's a bug where we aren't
  // fetching the space for the entity we are rendering, so we need to redirect to the correct space.
  if (entity?.nameTripleSpace) {
    if (spaceId !== entity?.nameTripleSpace) {
      console.log('Redirecting to space from space configuration entity', entity?.nameTripleSpace);
      redirect(`/space/${entity?.nameTripleSpace}/${entityId}`);
    }
  }

  const spaceName = space?.attributes[SYSTEM_IDS.NAME] ?? null;

  const blockIdsTriple = entity?.triples.find(t => t.attributeId === SYSTEM_IDS.BLOCKS) || null;
  const blockIds: string[] = blockIdsTriple ? JSON.parse(Value.stringValue(blockIdsTriple) || '[]') : [];

  const blockTriples = (
    await Promise.all(
      blockIds.map(blockId => {
        return Subgraph.fetchTriples({
          endpoint: config.subgraph,
          query: '',
          skip: 0,
          first: DEFAULT_PAGE_SIZE,
          filter: [{ field: 'entity-id', value: blockId }],
        });
      })
    )
  ).flatMap(triples => triples);

  return {
    triples: entity?.triples ?? [],
    id: entityId,
    name: entity?.name ?? spaceName ?? '',
    description: Entity.description(entity?.triples ?? []),
    spaceId,

    // For entity page editor
    blockIdsTriple,
    blockTriples,

    space,
  };
};
