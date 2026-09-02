'use client';

import * as React from 'react';

import { ClaimPageView } from '~/core/claims/browse/claim-page-view';
import { CLAIM_TYPE_ID } from '~/core/claims/ontology';
import { TOPIC_TYPE_ID } from '~/core/constants';
import { useUserIsEditing } from '~/core/hooks/use-user-is-editing';
import { ID } from '~/core/id';
import { useQueryEntity } from '~/core/sync/use-store';
import { TrackedErrorBoundary } from '~/core/telemetry/tracked-error-boundary';
import { TopicPageView } from '~/core/topics/browse/topic-page-view';
import type { Relation, TabEntity } from '~/core/types';
import { useEntityMediaUrl, useImageUrlFromEntity } from '~/core/utils/use-entity-media';

import { EmptyErrorComponent } from '~/design-system/empty-error-component';
import { Spacer } from '~/design-system/spacer';

import { CommentSection } from '~/partials/comments/comments-section';
import { Editor } from '~/partials/editor/editor';
import { AutomaticModeToggle } from '~/partials/entity-page/automatic-mode-toggle';
import { BacklinksClientContainer } from '~/partials/entity-page/backlinks-client-container';
import { EditableHeading } from '~/partials/entity-page/editable-entity-header';
import { EntityPageActions } from '~/partials/entity-page/entity-page-actions';
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
};

export type SidePanelEntityPageBodyProps = SharedProps & {
  variant: 'sidePanel';
  isRelationPage?: boolean;
  previewImageUrl?: string | null;
  previewName?: string | null;
  previewDescription?: string | null;
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

/**
 * Both variants fetch through `BacklinksClientContainer`, which is the only one of the two
 * containers that can run here.
 *
 * `BacklinksServerContainer` is an async component. This file is a client component, so React
 * doesn't treat it as a Server Component — it re-invokes the function on every render, which fires
 * its two requests again, suspends, resolves, renders, and invokes it again. The `Suspense` that
 * used to wrap it hid that entirely: the backlinks looked fine while a single entity page load sent
 * `EntityBacklinksPage` 82 times and `Spaces` 64 times, with identical variables (GEO-2666).
 *
 * The server container is still right for the three routes that render it from an actual server
 * component; it just can't be reached from here.
 */
function EntityBacklinks({ entityId }: { entityId: string }) {
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
}: {
  entityId: string;
  spaceId: string;
  variant: EntityPageBodyProps['variant'];
}) {
  return (
    <>
      <Editor spaceId={spaceId} shouldHandleOwnSpacing />
      {variant === 'route' ? (
        <>
          <Spacer height={24} />
          <ToggleEntityPage id={entityId} spaceId={spaceId} />
          <AutomaticModeToggle />
        </>
      ) : (
        <ToggleEntityPage id={entityId} spaceId={spaceId} />
      )}
      <Spacer height={40} />
      <EntityBacklinks entityId={entityId} />
      <CommentSection entityId={entityId} spaceId={spaceId} />
    </>
  );
}

/**
 * Which custom read view this entity gets, if any.
 *
 * Editing always falls through to the generic page: these are read surfaces with no property editor
 * behind them, so an editor who lost the value sheet would have no way to change the entity.
 *
 * Unscoped, matching how `EntityVoteButtons` reads the same flag. `types` is
 * derived across every space either way, so this is about consistency with the controls the pages
 * render rather than about reaching a type a scoped read would miss.
 */
function useCustomBrowseView(entityId: string, spaceId: string): 'claim' | 'topic' | 'generic' | 'pending' {
  const isEditing = useUserIsEditing(spaceId);
  const { entity, isLoading } = useQueryEntity({ id: entityId });

  if (isEditing) return 'generic';
  // The types decide which page this is, so until they are known there is no page to draw. Falling
  // through to the generic one meanwhile rendered the value sheet for a claim or a topic and then
  // replaced it a moment later, which read as the page loading twice.
  if (!entity) return isLoading ? 'pending' : 'generic';
  if (entity.types.some(type => ID.equals(type.id, CLAIM_TYPE_ID))) return 'claim';
  // After Claim, so an entity typed as both reads as the narrower of the two — a claim is a thing
  // to take a side on, which is more specific than a subject heading.
  if (entity.types.some(type => ID.equals(type.id, TOPIC_TYPE_ID))) return 'topic';
  return 'generic';
}

export function EntityPageBody(props: EntityPageBodyProps) {
  const { entityId, spaceId, initialTabRelations, tabEntities } = props;
  const customView = useCustomBrowseView(entityId, spaceId);

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

  // After every hook above, so the branch can't change the hook order between renders — the flag
  // flips when edit mode is toggled, which happens without remounting.
  //
  // Placed here rather than in the entity route's template strategy so the side panel is covered
  // too: both surfaces render through this component, and the strategy only sees the route.
  // Nothing rather than the wrong page. A blank moment is shorter and quieter than drawing the
  // generic value sheet and swapping it out from under the reader.
  if (customView === 'pending') return null;

  if (customView === 'claim') {
    return <ClaimPageView entityId={entityId} spaceId={spaceId} />;
  }

  if (customView === 'topic') {
    return <TopicPageView entityId={entityId} spaceId={spaceId} />;
  }

  const tabsSection = (
    <EntityTabsSection
      entityId={entityId}
      spaceId={spaceId}
      initialTabRelations={initialTabRelations}
      tabEntities={tabEntities}
    />
  );

  if (props.variant === 'sidePanel') {
    const { isRelationPage = false, previewName, previewDescription } = props;
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
                  fallbackDescription={previewDescription}
                />
              )}
              <div className="flex items-center gap-4 text-text">
                {!isRelationPage && <EntityPageMetadataHeader id={entityId} spaceId={spaceId} />}
                <EntityPageActions entityId={entityId} spaceId={spaceId} isVoteable={!isRelationPage} />
              </div>
            </div>
            <Spacer height={40} />
            {tabsSection}
            <Spacer height={40} />
            <EditorFooter entityId={entityId} spaceId={spaceId} variant="sidePanel" />
          </div>
        </EntityPageContentContainer>
      </div>
    );
  }

  const { showCover = true, showHeading = true, showHeader = true, serverRelations, notice = null, coverSlot } = props;
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
        {notice}
        {(showSpacer || !!notice) && <Spacer height={40} />}
        <EditorFooter entityId={entityId} spaceId={spaceId} variant="route" />
      </EntityPageContentContainer>
    </>
  );
}
