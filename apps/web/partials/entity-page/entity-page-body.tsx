'use client';

import * as React from 'react';

import { TrackedErrorBoundary } from '~/core/telemetry/tracked-error-boundary';
import type { Relation, TabEntity } from '~/core/types';
import { useEntityMediaUrl, useImageUrlFromEntity } from '~/core/utils/use-entity-media';

import { EmptyErrorComponent } from '~/design-system/empty-error-component';
import { Spacer } from '~/design-system/spacer';

import { CommentSection } from '~/partials/comments/comments-section';
import { Editor } from '~/partials/editor/editor';
import { AutomaticModeToggle } from '~/partials/entity-page/automatic-mode-toggle';
import { BacklinksClientContainer } from '~/partials/entity-page/backlinks-client-container';
import { BacklinksServerContainer } from '~/partials/entity-page/backlinks-server-container';
import { EditableHeading } from '~/partials/entity-page/editable-entity-header';
import { EntityPageContentContainer } from '~/partials/entity-page/entity-page-content-container';
import { EntityPageCover } from '~/partials/entity-page/entity-page-cover';
import { EntityPageHeader } from '~/partials/entity-page/entity-page-header';
import { EntityPageInlineDescription } from '~/partials/entity-page/entity-page-inline-description';
import { EntityPageMetadataHeader } from '~/partials/entity-page/entity-page-metadata-header';
import { EntityTabs } from '~/partials/entity-page/entity-tabs';
import { ToggleEntityPage } from '~/partials/entity-page/toggle-entity-page';
import { TypeSchemaInline } from '~/partials/entity-page/type-schema-inline';

const sidePanelHeadingClassName =
  '[&_.line-clamp-1]:!line-clamp-none [&_.line-clamp-2]:!line-clamp-none [&_.line-clamp-3]:!line-clamp-none [&_.line-clamp-4]:!line-clamp-none [&_.line-clamp-5]:!line-clamp-none [&_.line-clamp-6]:!line-clamp-none';

type SharedProps = {
  entityId: string;
  spaceId: string;
  initialTabRelations: Relation[];
  tabEntities: TabEntity[];
  avatarUrl: string | null;
  coverUrl: string | null;
};

export type RouteEntityPageBodyProps = SharedProps & {
  variant: 'route';
  showCover?: boolean;
  showHeading?: boolean;
  showHeader?: boolean;
  serverRelations: Relation[];
  notice?: React.ReactNode;
  coverSlot?: React.ReactNode;
  /** Rendered after the block content and property sheet, before backlinks (e.g. bounty submissions/payouts). */
  belowBodySlot?: React.ReactNode;
  /** Hides the collapsible properties sheet (e.g. bounty pages render their own facts card instead). */
  hideProperties?: boolean;
};

export type SidePanelEntityPageBodyProps = SharedProps & {
  variant: 'sidePanel';
  isRelationPage?: boolean;
  previewImageUrl?: string | null;
  previewName?: string | null;
  previewDescription?: string | null;
  /** Same slots as the route page, so a bounty reads the same in the panel (see entity-side-panel). */
  notice?: React.ReactNode;
  belowBodySlot?: React.ReactNode;
  hideProperties?: boolean;
};

export type EntityPageBodyProps = RouteEntityPageBodyProps | SidePanelEntityPageBodyProps;

function EntityTabsSection({
  entityId,
  spaceId,
  initialTabRelations,
  tabEntities,
}: Pick<SharedProps, 'entityId' | 'spaceId' | 'initialTabRelations' | 'tabEntities'>) {
  return (
    <React.Suspense fallback={null}>
      <EntityTabs
        entityId={entityId}
        spaceId={spaceId}
        initialTabRelations={initialTabRelations}
        tabEntities={tabEntities}
      />
    </React.Suspense>
  );
}

function RouteBacklinks({ entityId }: { entityId: string }) {
  return (
    <TrackedErrorBoundary fallback={<EmptyErrorComponent />}>
      <React.Suspense fallback={<div />}>
        <BacklinksServerContainer entityId={entityId} />
      </React.Suspense>
    </TrackedErrorBoundary>
  );
}

function SidePanelBacklinks({ entityId }: { entityId: string }) {
  return (
    <TrackedErrorBoundary fallback={<EmptyErrorComponent />}>
      <BacklinksClientContainer entityId={entityId} />
    </TrackedErrorBoundary>
  );
}

function EditorFooter({
  entityId,
  spaceId,
  variant,
  belowBodySlot,
  hideProperties = false,
}: {
  entityId: string;
  spaceId: string;
  variant: EntityPageBodyProps['variant'];
  belowBodySlot?: React.ReactNode;
  hideProperties?: boolean;
}) {
  return (
    <>
      <Editor spaceId={spaceId} shouldHandleOwnSpacing />
      {variant === 'route' ? (
        <>
          <Spacer height={24} />
          {hideProperties ? null : <ToggleEntityPage id={entityId} spaceId={spaceId} />}
          <AutomaticModeToggle />
        </>
      ) : hideProperties ? null : (
        <ToggleEntityPage id={entityId} spaceId={spaceId} />
      )}
      {belowBodySlot ? (
        <>
          <Spacer height={40} />
          {belowBodySlot}
        </>
      ) : null}
      <Spacer height={40} />
      {variant === 'route' ? <RouteBacklinks entityId={entityId} /> : <SidePanelBacklinks entityId={entityId} />}
      <CommentSection entityId={entityId} spaceId={spaceId} />
    </>
  );
}

export function EntityPageBody(props: EntityPageBodyProps) {
  const { entityId, spaceId, initialTabRelations, tabEntities } = props;

  const previewImageUrl = props.variant === 'sidePanel' ? props.previewImageUrl : undefined;
  const entityMediaUrl = useEntityMediaUrl(entityId, spaceId);
  const previewImageResolvedUrl = useImageUrlFromEntity(
    previewImageUrl && !previewImageUrl.startsWith('ipfs://') && !previewImageUrl.startsWith('http')
      ? previewImageUrl
      : undefined,
    spaceId
  );
  const previewImageUrlResolved =
    previewImageUrl?.startsWith('ipfs://') || previewImageUrl?.startsWith('http')
      ? previewImageUrl
      : (previewImageResolvedUrl ?? previewImageUrl);

  const tabsSection = (
    <EntityTabsSection
      entityId={entityId}
      spaceId={spaceId}
      initialTabRelations={initialTabRelations}
      tabEntities={tabEntities}
    />
  );

  if (props.variant === 'sidePanel') {
    const { isRelationPage = false, previewName, previewDescription, notice, belowBodySlot, hideProperties } = props;
    const avatarUrl = props.avatarUrl ?? entityMediaUrl ?? previewImageUrlResolved ?? null;

    return (
      <div className="px-4 pt-6 pb-12 sm:px-5">
        <EntityPageCover avatarUrl={avatarUrl} coverUrl={props.coverUrl} fitImage />
        <EntityPageContentContainer>
          <div>
            <div className="space-y-2">
              <div className={sidePanelHeadingClassName}>
                <EditableHeading spaceId={spaceId} entityId={entityId} fallbackName={previewName} />
              </div>
              {!isRelationPage && (
                <EntityPageInlineDescription
                  entityId={entityId}
                  spaceId={spaceId}
                  truncate={false}
                  fallbackDescription={previewDescription}
                />
              )}
              {!isRelationPage && <EntityPageMetadataHeader id={entityId} spaceId={spaceId} isVoteable />}
            </div>
            <Spacer height={40} />
            {tabsSection}
            {notice ? (
              <>
                <Spacer height={24} />
                {notice}
              </>
            ) : null}
            <Spacer height={40} />
            <EditorFooter
              entityId={entityId}
              spaceId={spaceId}
              variant="sidePanel"
              belowBodySlot={belowBodySlot}
              hideProperties={hideProperties}
            />
          </div>
        </EntityPageContentContainer>
      </div>
    );
  }

  const {
    showCover = true,
    showHeading = true,
    showHeader = true,
    serverRelations,
    notice = null,
    coverSlot,
    belowBodySlot,
    hideProperties,
  } = props;
  const showSpacer = showCover || showHeading || showHeader;

  return (
    <>
      {showCover && (coverSlot ?? <EntityPageCover avatarUrl={props.avatarUrl} coverUrl={props.coverUrl} />)}
      <EntityPageContentContainer>
        <EntityPageHeader
          showHeading={showHeading}
          showHeader={showHeader}
          entityId={entityId}
          spaceId={spaceId}
          serverRelations={serverRelations}
        />
        <Spacer height={24} />
        <TypeSchemaInline entityId={entityId} spaceId={spaceId} />
        <Spacer height={16} />
        {tabsSection}
        {notice ? <Spacer height={24} /> : null}
        {notice}
        {(showSpacer || !!notice) && <Spacer height={40} />}
        <EditorFooter
          entityId={entityId}
          spaceId={spaceId}
          variant="route"
          belowBodySlot={belowBodySlot}
          hideProperties={hideProperties}
        />
      </EntityPageContentContainer>
    </>
  );
}
