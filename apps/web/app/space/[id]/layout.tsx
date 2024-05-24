import { SYSTEM_IDS } from '@geogenesis/ids';
import { ROLE_ATTRIBUTE } from '@geogenesis/ids/system-ids';
import { Effect, Either } from 'effect';
import { redirect } from 'next/navigation';
import { v4 as uuid } from 'uuid';

import * as React from 'react';

import { Environment } from '~/core/environment';
import { Subgraph } from '~/core/io';
import { entityFragment } from '~/core/io/subgraph/fragments';
import { graphql } from '~/core/io/subgraph/graphql';
import { SubstreamEntity, getSpaceConfigFromMetadata } from '~/core/io/subgraph/network-local-mapping';
import { EditorProvider } from '~/core/state/editor-store';
import { EntityStoreProvider } from '~/core/state/entity-page-store/entity-store-provider';
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
import { AddSubspaceDialog } from '~/partials/space-page/add-subspace-dialog';
import { RemoveSubspaceDialog } from '~/partials/space-page/remove-subspace-dialog';
import { SpaceEditors } from '~/partials/space-page/space-editors';
import { SpaceMembers } from '~/partials/space-page/space-members';
import { SpacePageMetadataHeader } from '~/partials/space-page/space-metadata-header';
import { SpaceToAdd } from '~/partials/space-page/types';

import { cachedFetchSpace } from './cached-fetch-space';
import { getSubspacesForSpace } from './fetch-subspaces-for-space';

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
}

async function buildTabsForSpacePage(types: EntityType[], params: Props['params']): Promise<TabProps[]> {
  const typeIds = types.map(t => t.id);
  const tabs = [];

  let teamCount = 0;

  if (typeIds.includes(SYSTEM_IDS.COMPANY_TYPE) || typeIds.includes(SYSTEM_IDS.NONPROFIT_TYPE)) {
    const roleTriples = await Subgraph.fetchTriples({
      space: params.id,
      query: '',
      skip: 0,
      first: 1000,
      filter: [{ field: 'attribute-id', value: ROLE_ATTRIBUTE }],
    });

    if (roleTriples.length > 0) {
      teamCount = roleTriples.length;
    }
  }

  const COMPANY_TABS = [
    {
      label: 'Overview',
      href: `${NavUtils.toSpace(params.id)}`,
      priority: 1 as const,
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
      label: 'Projects',
      href: `${NavUtils.toSpace(params.id)}/projects`,
      priority: 1 as const,
    },
    {
      label: 'Posts',
      href: `${NavUtils.toSpace(params.id)}/posts`,
      priority: 1 as const,
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
    },
    {
      label: 'Activity',
      href: `${NavUtils.toSpace(params.id)}/activity`,
      priority: 3 as const,
    },
  ];

  const SPACE_TABS = [
    {
      label: 'Overview',
      href: `${NavUtils.toSpace(params.id)}`,
      priority: 1 as const,
    },
    {
      label: 'Governance',
      href: `${NavUtils.toSpace(params.id)}/governance`,
      priority: 2 as const,
    },
  ];

  // Order of how we add the tabs matters. We want to
  // show "content-based" tabs first, then "space-based" tabs.
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
    tabs.push(...SPACE_TABS);
  }

  const seen = new Map<string, TabProps>();

  for (const tab of tabs) {
    if (!seen.has(tab.label)) {
      seen.set(tab.label, tab);
    }
  }

  return [...seen.values()].sort((a, b) => a.priority - b.priority);
}

const getFetchSpacesQuery = () => `query {
  spaces {
    totalCount
    nodes {
      id
      spaceMembers {
        totalCount
      }
      metadata {
        nodes {
          ${entityFragment}
        }
      }
    }
  }
}`;

interface NetworkResult {
  spaces: {
    totalCount: number;
    nodes: {
      id: string;
      spaceMembers: { totalCount: number };
      metadata: { nodes: SubstreamEntity[] };
    }[];
  };
}

async function getSpacesForSubspaceManagement(): Promise<{ totalCount: number; spaces: SpaceToAdd[] }> {
  const queryId = uuid();
  const endpoint = Environment.getConfig().api;

  const graphqlFetchEffect = graphql<NetworkResult>({
    endpoint,
    query: getFetchSpacesQuery(),
  });

  const graphqlFetchWithErrorFallbacks = Effect.gen(function* (awaited) {
    const resultOrError = yield* awaited(Effect.either(graphqlFetchEffect));

    if (Either.isLeft(resultOrError)) {
      const error = resultOrError.left;

      switch (error._tag) {
        case 'AbortError':
          // Right now we re-throw AbortErrors and let the callers handle it. Eventually we want
          // the caller to consume the error channel as an effect. We throw here the typical JS
          // way so we don't infect more of the codebase with the effect runtime.
          throw error;
        case 'GraphqlRuntimeError':
          console.error(
            `Encountered runtime graphql error in fetchSpaces. queryId: ${queryId} endpoint: ${endpoint}

            queryString: ${getFetchSpacesQuery()}
            `,
            error.message
          );

          return {
            spaces: {
              totalCount: 0,
              nodes: [],
            },
          };

        default:
          console.error(`${error._tag}: Unable to fetch spaces, queryId: ${queryId} endpoint: ${endpoint}`);

          return {
            spaces: {
              totalCount: 0,
              nodes: [],
            },
          };
      }
    }

    return resultOrError.right;
  });

  const result = await Effect.runPromise(graphqlFetchWithErrorFallbacks);

  const spaces = result.spaces.nodes.map((space): SpaceToAdd => {
    const spaceConfigWithImage = getSpaceConfigFromMetadata(space.id, space.metadata.nodes[0]);

    return {
      id: space.id,
      spaceConfig: spaceConfigWithImage,
      totalMembers: space.spaceMembers.totalCount,
    };
  });

  return {
    totalCount: result.spaces.totalCount,
    spaces,
  };
}

export default async function Layout({ children, params }: Props) {
  const [props, spaces, subspaces] = await Promise.all([
    getData(params.id),
    getSpacesForSubspaceManagement(),
    getSubspacesForSpace(params.id),
  ]);
  const coverUrl = Entity.cover(props.triples);

  const typeNames = props.space.spaceConfig?.types?.flatMap(t => (t.name ? [t.name] : [])) ?? [];
  const tabs = await buildTabsForSpacePage(props.space.spaceConfig?.types ?? [], params);

  return (
    <TypesStoreServerContainer spaceId={params.id}>
      <EntityStoreProvider id={props.id} spaceId={props.spaceId} initialTriples={props.triples}>
        <EditorProvider
          id={props.id}
          spaceId={props.spaceId}
          initialBlockIdsTriple={props.blockIdsTriple}
          initialBlockTriples={props.blockTriples}
          initialBlockCollectionItems={props.blockCollectionItems}
          initialBlockCollectionItemTriples={props.blockCollectionItemTriples}
        >
          <EntityPageCover avatarUrl={null} coverUrl={coverUrl} />
          <EntityPageContentContainer>
            <EditableHeading spaceId={props.spaceId} entityId={props.id} name={props.name} triples={props.triples} />
            <SpacePageMetadataHeader
              typeNames={typeNames}
              spaceId={props.spaceId}
              entityId={props.id}
              addSubspaceComponent={
                <AddSubspaceDialog
                  mainVotingPluginAddress={props.space.mainVotingPluginAddress}
                  spacePluginAddress={props.space.spacePluginAddress}
                  spaces={spaces.spaces}
                  totalCount={spaces.totalCount}
                />
              }
              // If a space does not have any subspaces then
              removeSubspaceComponent={
                subspaces ? (
                  <RemoveSubspaceDialog
                    mainVotingPluginAddress={props.space.mainVotingPluginAddress}
                    spacePluginAddress={props.space.spacePluginAddress}
                    spaces={subspaces?.subspaces}
                    totalCount={subspaces.totalCount}
                  />
                ) : null
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

  const spaceName = space?.spaceConfig?.name ? space.spaceConfig?.name : space?.id ?? '';

  const blockIdsTriple =
    entity?.triples.find(t => t.attributeId === SYSTEM_IDS.BLOCKS && t.value.type === 'COLLECTION') || null;

  const blockCollectionItems =
    blockIdsTriple && blockIdsTriple.value.type === 'COLLECTION' ? blockIdsTriple.value.items : [];

  const blockIds: string[] = blockCollectionItems.map(item => item.entity.id);

  const [blockTriples, collectionItemTriples] = await Promise.all([
    Promise.all(
      blockIds.map(blockId => {
        return Subgraph.fetchEntity({ id: blockId });
      })
    ),
    Promise.all(
      blockCollectionItems.map(item => {
        return Subgraph.fetchEntity({ id: item.id });
      })
    ),
  ]);

  return {
    triples: entity?.triples ?? [],
    id: entity.id,
    name: entity?.name ?? spaceName ?? '',
    description: Entity.description(entity?.triples ?? []),
    spaceId,

    // For entity page editor
    blockIdsTriple,
    blockTriples: blockTriples.flatMap(entity => entity?.triples ?? []),
    blockCollectionItems,
    blockCollectionItemTriples: collectionItemTriples.flatMap(entity => entity?.triples ?? []),

    space,
  };
};
