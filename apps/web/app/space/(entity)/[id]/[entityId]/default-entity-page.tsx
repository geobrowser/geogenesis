import * as React from 'react';

import { EditorProvider } from '~/core/state/editor/editor-provider';
import { EntityStoreProvider } from '~/core/state/entity-page-store/entity-store-provider';
import { TrackedErrorBoundary } from '~/core/telemetry/tracked-error-boundary';

import { EmptyErrorComponent } from '~/design-system/empty-error-component';
import { Spacer } from '~/design-system/spacer';

import { CommentSection } from '~/partials/comments/comments-section';
import { Editor } from '~/partials/editor/editor';
import { AutomaticModeToggle } from '~/partials/entity-page/automatic-mode-toggle';
import { BacklinksServerContainer } from '~/partials/entity-page/backlinks-server-container';
import { EntityPageContentContainer } from '~/partials/entity-page/entity-page-content-container';
import { EntityPageCover } from '~/partials/entity-page/entity-page-cover';
import { EntityTabs } from '~/partials/entity-page/entity-tabs';
import { ToggleEntityPage } from '~/partials/entity-page/toggle-entity-page';
import { TypeSchemaInline } from '~/partials/entity-page/type-schema-inline';

import { EntityPageHeader } from './entity-page-header';
import { fetchEntityPageData } from './fetch-entity-page-data';
import { SpaceRedirect } from './space-redirect';

interface Props {
  params: { id: string; entityId: string };
  searchParams?: { [key: string]: string | string[] | undefined };
  showCover?: boolean;
  showHeading?: boolean;
  showHeader?: boolean;
  notice?: React.ReactNode;
}

export default async function DefaultEntityPage({
  params,
  searchParams = {},
  showCover = true,
  showHeading = true,
  showHeader = true,
  notice = null,
}: Props) {
  const showSpacer = showCover || showHeading || showHeader;

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
        <EditorProvider
          id={props.id}
          spaceId={props.spaceId}
          initialBlocks={props.blocks}
          initialBlockRelations={props.blockRelations}
          initialTabs={props.tabs}
          initialCollectionItems={props.initialCollectionItems}
        >
          {showCover && <EntityPageCover avatarUrl={props.serverAvatarUrl} coverUrl={props.serverCoverUrl} />}
          <EntityPageContentContainer>
            <EntityPageHeader
              showHeading={showHeading}
              showHeader={showHeader}
              entityId={props.id}
              spaceId={props.spaceId}
              serverRelations={props.relationEntityRelations}
            />
            <div className="mt-6 flex flex-col gap-4 empty:hidden">
              <TypeSchemaInline entityId={props.id} spaceId={props.spaceId} />
              <React.Suspense fallback={null}>
                <EntityTabs
                  entityId={props.id}
                  spaceId={props.spaceId}
                  initialTabRelations={props.tabRelations ?? []}
                  tabEntities={props.tabEntities}
                />
              </React.Suspense>
              {notice}
            </div>
            {(showSpacer || !!notice) && <Spacer height={24} />}

            <Editor spaceId={props.spaceId} shouldHandleOwnSpacing />
            <Spacer height={24} />
            <ToggleEntityPage id={props.id} spaceId={props.spaceId} />
            <AutomaticModeToggle />
            <Spacer height={40} />
            {/*
               Some SEO parsers fail to parse meta tags if there's no fallback in a suspense
               boundary. We don't want to show any referenced by loading states but do want to
               stream it in
            */}
            <TrackedErrorBoundary fallback={<EmptyErrorComponent />}>
              <React.Suspense fallback={<div />}>
                <BacklinksServerContainer entityId={params.entityId} />
              </React.Suspense>
            </TrackedErrorBoundary>
            <CommentSection entityId={params.entityId} spaceId={props.spaceId} />
          </EntityPageContentContainer>
        </EditorProvider>
      </EntityStoreProvider>
    </SpaceRedirect>
  );
}
