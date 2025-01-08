import { SYSTEM_IDS } from '@geogenesis/sdk';
import { redirect } from 'next/navigation';

import * as React from 'react';

import { Subgraph } from '~/core/io';
import { Entity } from '~/core/io/dto/entities';
import { fetchBlocks } from '~/core/io/fetch-blocks';
import { EntityId } from '~/core/io/schema';
import { fetchInFlightSubspaceProposalsForSpaceId } from '~/core/io/subgraph/fetch-in-flight-subspace-proposals';
import { fetchSubspacesBySpaceId } from '~/core/io/subgraph/fetch-subspaces';
import { fetchTabs } from '~/core/io/subgraph/fetch-tabs';
import { EditorProvider } from '~/core/state/editor/editor-provider';
import { EntityStoreProvider } from '~/core/state/entity-page-store/entity-store-provider';
import { TypesStoreServerContainer } from '~/core/state/types-store/types-store-server-container';
import { Entities } from '~/core/utils/entity';
import { NavUtils } from '~/core/utils/utils';

import { MenuItem } from '~/design-system/menu';
import { Skeleton } from '~/design-system/skeleton';
import { Spacer } from '~/design-system/spacer';
import { TabGroup } from '~/design-system/tab-group';

import { EditableHeading } from '~/partials/entity-page/editable-entity-header';
import { EntityPageContentContainer } from '~/partials/entity-page/entity-page-content-container';
import { EntityPageCover } from '~/partials/entity-page/entity-page-cover';
import { AddSubspaceDialog } from '~/partials/space-page/add-subspace-dialog';
import { SpaceEditors } from '~/partials/space-page/space-editors';
import { SpaceMembers } from '~/partials/space-page/space-members';
import { SpacePageMetadataHeader } from '~/partials/space-page/space-metadata-header';

import { cachedFetchSpace } from './cached-fetch-space';

interface Props {
  params: { id: string };
  children: React.ReactNode;
}

interface EntityType {
  id: string;
  name: string | null;
}

interface TabProps {
  label: string;
  href: string;
  priority: 1 | 2 | 3;
  hidden?: boolean;
}

async function buildTabsForSpacePage(types: EntityType[], params: Props['params']): Promise<TabProps[]> {
  const typeIds = types.map(t => t.id);
  const tabs = [];

  const spaceId = params.id;

  let teamCount = 0;

  const tabEntities = await fetchTabs({ spaceId });

  const hasPostsPage = getHasPage(tabEntities, SYSTEM_IDS.POSTS_PAGE);
  // const hasProductsPage = getHasPage(tabEntities, SYSTEM_IDS.PRODUCTS_PAGE);
  // const hasServicesPage = getHasPage(tabEntities, SYSTEM_IDS.SERVICES_PAGE);
  const hasNewsPage = getHasPage(tabEntities, SYSTEM_IDS.EVENTS_PAGE);
  const hasEventsPage = getHasPage(tabEntities, SYSTEM_IDS.EVENTS_PAGE);
  const hasProjectsPage = getHasPage(tabEntities, SYSTEM_IDS.PROJECTS_PAGE);
  const hasPeoplePage = getHasPage(tabEntities, SYSTEM_IDS.PEOPLE_PAGE);
  const hasJobsPage = getHasPage(tabEntities, SYSTEM_IDS.JOBS_PAGE);
  const hasFinancesPage = getHasPage(tabEntities, SYSTEM_IDS.FINANCES_PAGE);

  if (typeIds.includes(SYSTEM_IDS.COMPANY_TYPE) || typeIds.includes(SYSTEM_IDS.NONPROFIT_TYPE)) {
    const roleTriples = await Subgraph.fetchTriples({
      space: params.id,
      query: '',
      skip: 0,
      first: 1000,
      filter: [{ field: 'attribute-id', value: SYSTEM_IDS.ROLE_ATTRIBUTE }],
    });

    if (roleTriples.length > 0) {
      teamCount = roleTriples.length;
    }
  }

  const INDUSTRY_TABS = [
    {
      label: 'Overview',
      href: `${NavUtils.toSpace(params.id)}`,
      priority: 1 as const,
    },
    {
      label: 'News',
      href: `${NavUtils.toSpace(params.id)}/news`,
      priority: 1 as const,
      hidden: !hasNewsPage,
    },
    {
      label: 'Events',
      href: `${NavUtils.toSpace(params.id)}/events`,
      priority: 1 as const,
      hidden: !hasEventsPage,
    },
    {
      label: 'Projects',
      href: `${NavUtils.toSpace(params.id)}/projects`,
      priority: 1 as const,
      hidden: !hasProjectsPage,
    },
    {
      label: 'People',
      href: `${NavUtils.toSpace(params.id)}/people`,
      priority: 1 as const,
      hidden: !hasPeoplePage,
    },
    {
      label: 'Jobs',
      href: `${NavUtils.toSpace(params.id)}/jobs`,
      priority: 1 as const,
      hidden: !hasJobsPage,
    },
    {
      label: 'Activity',
      href: `${NavUtils.toSpace(params.id)}/activity`,
      priority: 3 as const,
    },
  ];

  const COMPANY_TABS = [
    {
      label: 'Overview',
      href: `${NavUtils.toSpace(params.id)}`,
      priority: 1 as const,
    },
    {
      label: 'Posts',
      href: `${NavUtils.toSpace(params.id)}/posts`,
      priority: 1 as const,
      hidden: !hasPostsPage,
    },
    // be sure to also restore actions in `generate-ops-for-company.ts`
    // {
    //   label: 'Products',
    //   href: `${NavUtils.toSpace(params.id)}/products`,
    //   priority: 1 as const,
    //   hidden: !hasProductsPage,
    // },
    // {
    //   label: 'Services',
    //   href: `${NavUtils.toSpace(params.id)}/services`,
    //   priority: 1 as const,
    //   hidden: !hasServicesPage,
    // },
    {
      label: 'Events',
      href: `${NavUtils.toSpace(params.id)}/events`,
      priority: 1 as const,
      hidden: !hasEventsPage,
    },
    {
      label: 'Jobs',
      href: `${NavUtils.toSpace(params.id)}/jobs`,
      priority: 1 as const,
      hidden: !hasJobsPage,
    },
    {
      label: 'Team',
      href: `${NavUtils.toSpace(params.id)}/team`,
      priority: 1 as const,
      badge: <>{teamCount.toString()}</>,
    },
    {
      label: 'Activity',
      href: `${NavUtils.toSpace(params.id)}/activity`,
      priority: 3 as const,
    },
  ];

  const NONPROFIT_TABS = [
    {
      label: 'Overview',
      href: `${NavUtils.toSpace(params.id)}`,
      priority: 1 as const,
    },
    {
      label: 'Posts',
      href: `${NavUtils.toSpace(params.id)}/posts`,
      priority: 1 as const,
      hidden: !hasPostsPage,
    },
    {
      label: 'Projects',
      href: `${NavUtils.toSpace(params.id)}/projects`,
      priority: 1 as const,
      hidden: !hasProjectsPage,
    },
    {
      label: 'Team',
      href: `${NavUtils.toSpace(params.id)}/team`,
      priority: 1 as const,
      badge: <>{teamCount.toString()}</>,
    },
    {
      label: 'Finances',
      href: `${NavUtils.toSpace(params.id)}/finances`,
      priority: 1 as const,
      hidden: !hasFinancesPage,
    },
  ];

  const PERSON_TABS = [
    {
      label: 'Overview',
      href: `${NavUtils.toSpace(params.id)}`,
      priority: 1 as const,
    },
    {
      label: 'Posts',
      href: `${NavUtils.toSpace(params.id)}/posts`,
      priority: 1 as const,
      hidden: !hasPostsPage,
    },
    {
      label: 'Spaces',
      href: `${NavUtils.toSpace(params.id)}/spaces`,
      priority: 1 as const,
    },
    {
      label: 'Activity',
      href: `${NavUtils.toSpace(params.id)}/activity`,
      priority: 3 as const,
    },
  ];

  const ALL_SPACES_TABS = [
    {
      label: 'Overview',
      href: `${NavUtils.toSpace(params.id)}`,
      priority: 1 as const,
    },
  ];

  const ROOT_TABS = [
    {
      label: 'Education',
      href: `${NavUtils.toSpace(params.id)}/education`,
      priority: 2 as const,
    },
    {
      label: 'Ontology',
      href: `${NavUtils.toSpace(params.id)}/ontology`,
      priority: 2 as const,
    },
    {
      label: 'About',
      href: `${NavUtils.toSpace(params.id)}/about`,
      priority: 2 as const,
    },
  ];

  const SOME_SPACES_TABS = [
    {
      label: 'Governance',
      href: `${NavUtils.toSpace(params.id)}/governance`,
      priority: 2 as const,
    },
  ];

  if (typeIds.includes(SYSTEM_IDS.ROOT_SPACE_TYPE)) {
    tabs.push(...ROOT_TABS);
  }

  // Order of how we add the tabs matters. We want to
  // show "content-based" tabs first, then "space-based" tabs.

  if (typeIds.includes(SYSTEM_IDS.INDUSTRY_TYPE)) {
    tabs.push(...INDUSTRY_TABS);
  }

  if (typeIds.includes(SYSTEM_IDS.COMPANY_TYPE)) {
    tabs.push(...COMPANY_TABS);
  }

  if (typeIds.includes(SYSTEM_IDS.NONPROFIT_TYPE)) {
    tabs.push(...NONPROFIT_TABS);
  }

  if (typeIds.includes(SYSTEM_IDS.PERSON_TYPE)) {
    tabs.push(...PERSON_TABS);
  }

  if (typeIds.includes(SYSTEM_IDS.SPACE_CONFIGURATION)) {
    tabs.push(...ALL_SPACES_TABS);
    if (!typeIds.includes(SYSTEM_IDS.PERSON_TYPE)) {
      tabs.push(...SOME_SPACES_TABS);
    }
  }

  const seen = new Map<string, TabProps>();

  for (const tab of tabs) {
    if (!seen.has(tab.label)) {
      seen.set(tab.label, tab);
    }
  }

  return [...seen.values()].sort((a, b) => a.priority - b.priority);
}

const getHasPage = (tabEntities: Entity[], pageTypeId: string) => {
  return !!tabEntities.find(entity => entity.relationsOut.find(relation => relation.toEntity.id === pageTypeId));
};

export default async function Layout({ children, params }: Props) {
  const [props, subspaces, inflightSubspaces] = await Promise.all([
    getData(params.id),
    fetchSubspacesBySpaceId(params.id),
    fetchInFlightSubspaceProposalsForSpaceId(params.id),
  ]);
  const coverUrl = Entities.cover(props.relationsOut);

  const typeNames = props.space.spaceConfig?.types?.flatMap(t => (t.name ? [t.name] : [])) ?? [];
  const tabs = await buildTabsForSpacePage(props.space.spaceConfig?.types ?? [], params);

  return (
    <TypesStoreServerContainer spaceId={params.id}>
      <EntityStoreProvider
        id={props.id}
        spaceId={props.spaceId}
        initialSpaces={props.spaces}
        initialTriples={props.triples}
        initialRelations={props.relationsOut}
      >
        <EditorProvider
          id={props.id}
          spaceId={props.spaceId}
          initialBlockRelations={props.blockRelations}
          initialBlocks={props.blocks}
        >
          <EntityPageCover avatarUrl={null} coverUrl={coverUrl} />
          <EntityPageContentContainer>
            <EditableHeading spaceId={props.spaceId} entityId={props.id} />
            <SpacePageMetadataHeader
              typeNames={typeNames}
              spaceId={props.spaceId}
              entityId={props.id}
              addSubspaceComponent={
                <AddSubspaceDialog
                  spaceId={params.id}
                  trigger={<MenuItem>Add subspace</MenuItem>}
                  subspaces={subspaces}
                  inflightSubspaces={inflightSubspaces}
                  spaceType={props.space.type}
                />
              }
              membersComponent={
                <React.Suspense fallback={<MembersSkeleton />}>
                  <SpaceEditors spaceId={params.id} />
                  <SpaceMembers spaceId={params.id} />
                </React.Suspense>
              }
            />
            <Spacer height={40} />
            <TabGroup tabs={tabs} />
            <Spacer height={20} />
            {children}
          </EntityPageContentContainer>
        </EditorProvider>
      </EntityStoreProvider>
    </TypesStoreServerContainer>
  );
}

function MembersSkeleton() {
  return (
    <div className="flex items-center gap-2">
      <Skeleton className="h-6 w-24" />
      <Skeleton className="h-6 w-36" />
    </div>
  );
}

const getData = async (spaceId: string) => {
  // @TODO: If there's no space we should 404
  const space = await cachedFetchSpace(spaceId);
  const entity = space?.spaceConfig;

  if (!entity) {
    console.log(`Redirecting to /space/${spaceId}/entities`);
    redirect(`/space/${spaceId}/entities`);
  }

  const spaces = entity?.spaces ?? [];
  const blockIds = entity?.relationsOut
    .filter(r => r.typeOf.id === EntityId(SYSTEM_IDS.BLOCKS))
    ?.map(r => r.toEntity.id);

  const blocks = blockIds ? await fetchBlocks(blockIds) : [];

  return {
    triples: entity.triples,
    relationsOut: entity.relationsOut,
    id: entity.id,
    name: entity.name,
    description: Entities.description(entity.triples),
    spaceId,
    spaces,

    blockRelations: entity.relationsOut,
    blocks,

    space,
  };
};
