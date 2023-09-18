import { SYSTEM_IDS } from '@geogenesis/ids';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import * as React from 'react';

import { AppConfig } from '~/core/environment';
import { Subgraph } from '~/core/io';
import { Params } from '~/core/params';
import { serverRuntime } from '~/core/runtime';
import { EntityStoreProvider } from '~/core/state/entity-page-store';
import { DEFAULT_PAGE_SIZE } from '~/core/state/triple-store';
import { TypesStoreServerContainer } from '~/core/state/types-store/types-store-server-container';
import { ServerSideEnvParams } from '~/core/types';
import { Entity } from '~/core/utils/entity';
import { NavUtils } from '~/core/utils/utils';
import { Value } from '~/core/utils/value';

import { Spacer } from '~/design-system/spacer';
import { TabGroup } from '~/design-system/tab-group';

import { EditableHeading } from '~/partials/entity-page/editable-entity-header';
import { EntityPageContentContainer } from '~/partials/entity-page/entity-page-content-container';
import { EntityPageCover } from '~/partials/entity-page/entity-page-cover';
import { SpaceEditors } from '~/partials/space-page/space-editors';
import { SpaceMembers } from '~/partials/space-page/space-members';
import { SpacePageMetadataHeader } from '~/partials/space-page/space-metadata-header';

export const runtime = serverRuntime.runtime;
export const fetchCache = serverRuntime.fetchCache;

interface Props {
  params: { id: string };
  searchParams: ServerSideEnvParams;
  children: React.ReactNode;
}

// We don't want this layout to nest within the space/ route component tree,
// so we use it like normal React component instead of a Next.js route layout.
export async function SpaceLayout({ params, searchParams, children }: Props) {
  const env = cookies().get(Params.ENV_PARAM_NAME)?.value;
  const config = Params.getConfigFromParams(searchParams, env);

  const props = await getData(params.id, config);

  const avatarUrl = Entity.avatar(props.triples) ?? props.serverAvatarUrl;
  const coverUrl = Entity.cover(props.triples) ?? props.serverCoverUrl;

  return (
    // @ts-expect-error async JSX function
    <TypesStoreServerContainer spaceId={params.id} endpoint={config.subgraph}>
      <EntityStoreProvider
        id={props.id}
        spaceId={props.spaceId}
        initialTriples={props.triples}
        initialSchemaTriples={[]}
        initialBlockIdsTriple={props.blockIdsTriple}
        initialBlockTriples={props.blockTriples}
      >
        <EntityPageCover avatarUrl={avatarUrl} coverUrl={coverUrl} />

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
              <>
                {/* @ts-expect-error async JSX function */}
                <SpaceEditors spaceId={params.id} />
                {/* @ts-expect-error async JSX function */}
                <SpaceMembers spaceId={params.id} />
              </>
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

          {children}
        </EntityPageContentContainer>
      </EntityStoreProvider>
    </TypesStoreServerContainer>
  );
}

const getData = async (spaceId: string, config: AppConfig) => {
  const spaces = await Subgraph.fetchSpaces({ endpoint: config.subgraph });
  const space = spaces.find(s => s.id === spaceId) ?? null;
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
  const serverAvatarUrl = space?.attributes[SYSTEM_IDS.IMAGE_ATTRIBUTE] ?? null;
  const serverCoverUrl = Entity.cover(entity?.triples);

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
    serverAvatarUrl,
    serverCoverUrl,

    // For entity page editor
    blockIdsTriple,
    blockTriples,

    space,
  };
};
