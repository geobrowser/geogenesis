import * as React from 'react';

import { RouteEditorProvider } from '~/core/state/editor/editor-provider';
import { EntityStoreProvider } from '~/core/state/entity-page-store/entity-store-provider';

import { EntityPageBody } from '~/partials/entity-page/entity-page-body';

import { fetchEntityPageData } from './fetch-entity-page-data';
import { SpaceRedirect } from './space-redirect';

interface Props {
  params: { id: string; entityId: string };
  searchParams?: { [key: string]: string | string[] | undefined };
  showCover?: boolean;
  showHeading?: boolean;
  showHeader?: boolean;
  notice?: React.ReactNode;
  /** Replaces the cover/avatar slot above the Name (e.g. a community-call recording player). */
  coverSlot?: React.ReactNode;
}

export default async function DefaultEntityPage({
  params,
  searchParams = {},
  showCover = true,
  showHeading = true,
  showHeader = true,
  notice = null,
  coverSlot,
}: Props) {
  const isEditing = searchParams?.edit === 'true';
  const props = await fetchEntityPageData(params.id, params.entityId);

  return (
    <SpaceRedirect
      entityId={props.id}
      spaceId={props.spaceId}
      serverSpaces={props.serverSpaces}
      deterministicSpaceId={props.deterministicSpaceId}
      preventRedirect={isEditing}
    >
      <EntityStoreProvider id={props.id} spaceId={props.spaceId}>
        <RouteEditorProvider
          id={props.id}
          spaceId={props.spaceId}
          initialBlocks={props.blocks}
          initialBlockRelations={props.blockRelations}
          initialTabs={props.tabs}
          initialCollectionItems={props.initialCollectionItems}
        >
          <EntityPageBody
            variant="route"
            entityId={props.id}
            spaceId={props.spaceId}
            initialTabRelations={props.tabRelations ?? []}
            tabEntities={props.tabEntities}
            avatarUrl={props.serverAvatarUrl}
            coverUrl={props.serverCoverUrl}
            showCover={showCover}
            showHeading={showHeading}
            showHeader={showHeader}
            serverRelations={props.relationEntityRelations}
            coverSlot={coverSlot}
            notice={notice}
          />
        </RouteEditorProvider>
      </EntityStoreProvider>
    </SpaceRedirect>
  );
}
