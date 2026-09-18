'use client';

import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import * as React from 'react';

import { ClaimPageView } from '~/core/claims/browse/claim-page-view';
import { CLAIM_TYPE_ID } from '~/core/claims/ontology';
import { TOPIC_TYPE_ID } from '~/core/constants';
import { useSpace } from '~/core/hooks/use-space';
import { useUserIsEditing } from '~/core/hooks/use-user-is-editing';
import { ID } from '~/core/id';
import type { Space } from '~/core/io/dto/spaces';
import { useQueryEntity } from '~/core/sync/use-store';
import { TrackedErrorBoundary } from '~/core/telemetry/tracked-error-boundary';
import { TopicPageView } from '~/core/topics/browse/topic-page-view';
import type { Relation, TabEntity } from '~/core/types';
import { Spaces } from '~/core/utils/space';
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
import { PersonProfileView } from '~/partials/profile/person-profile-view';

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
      <EntityBacklinks entityId={entityId} />
      <CommentSection entityId={entityId} spaceId={spaceId} />
    </>
  );
}

export type CustomBrowseView = 'claim' | 'topic' | 'person' | 'generic' | 'pending';

/**
 * The decision itself, with no hooks in it.
 *
 * Exported and pure because it is a routing rule rather than a rendering
 * detail: which of four read surfaces somebody gets, from four inputs that
 * arrive at different times. The hook below is the only place those inputs are
 * gathered.
 */
export function customBrowseView({
  entityId,
  entity,
  isLoadingEntity,
  space,
  isLoadingSpace,
  isEditing,
}: {
  entityId: string;
  entity: { types: { id: string }[] } | null | undefined;
  isLoadingEntity: boolean;
  space: Pick<Space, 'type' | 'entity'> | null | undefined;
  isLoadingSpace: boolean;
  isEditing: boolean;
}): CustomBrowseView {
  if (isEditing) return 'generic';
  // The types decide which page this is, so until they are known there is no page to draw. Falling
  // through to the generic one meanwhile rendered the value sheet for a claim or a topic and then
  // replaced it a moment later, which read as the page loading twice.
  if (!entity) return isLoadingEntity ? 'pending' : 'generic';
  if (entity.types.some(type => ID.equals(type.id, CLAIM_TYPE_ID))) return 'claim';
  // After Claim, so an entity typed as both reads as the narrower of the two — a claim is a thing
  // to take a side on, which is more specific than a subject heading.
  if (entity.types.some(type => ID.equals(type.id, TOPIC_TYPE_ID))) return 'topic';

  /*
   * A profile is the *space's* view of a person, not the type's.
   *
   * `isPersonProfileSpace` wants a PERSONAL space whose own entity is a Person,
   * and this wants, on top of that, the entity being read to *be* that entity.
   * Both halves matter and the first has burned this codebase before: a Person
   * written into a DAO space satisfies the type check alone, and was once handed
   * profile tabs whose routes answered 404. A personal space also holds entities
   * besides its owner, and those are not profiles either.
   *
   * Only an entity already typed Person waits for the space read, so the cheap
   * half of the question gates the expensive one and nothing else is held up by
   * it.
   */
  if (entity.types.some(type => ID.equals(type.id, SystemIds.PERSON_TYPE))) {
    if (!space) return isLoadingSpace ? 'pending' : 'generic';
    if (Spaces.isPersonProfileSpace(space) && space.entity && ID.equals(space.entity.id, entityId)) return 'person';
  }

  return 'generic';
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
function useCustomBrowseView(entityId: string, spaceId: string): CustomBrowseView {
  const isEditing = useUserIsEditing(spaceId);
  const { entity, isLoading } = useQueryEntity({ id: entityId });
  const { space, isLoading: isLoadingSpace } = useSpace(spaceId);

  return customBrowseView({
    entityId,
    entity,
    isLoadingEntity: isLoading,
    space,
    isLoadingSpace,
    isEditing,
  });
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

  /*
   * The profile, on the two surfaces that are not the person's space home.
   *
   * That route builds it out of three pieces in three places — layout header,
   * rail, page body — so the side panel and the `(entity)` full-page route, which
   * share neither the layout nor the rail, showed the generic value sheet for
   * somebody's profile. Handling it here is what lets one component serve both,
   * the same way a claim and a topic are served.
   *
   * Unlike those two it is a *body*, not a whole page, and returning early like
   * they do was a mistake worth recording: it threw away the cover, the avatar,
   * the name and the bio that both variants draw below, so the panel opened on a
   * bare Activity card with nothing above it saying whose record it was. What it
   * replaces is only what follows the header — the entity's authored tabs and
   * the editor/properties footer — because the profile has its own tabs and its
   * own idea of what belongs under each.
   */
  const personProfile = customView === 'person' ? <PersonProfileView entityId={entityId} spaceId={spaceId} /> : null;

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
              <EditableHeading spaceId={spaceId} entityId={entityId} fallbackName={previewName} />
              {!isRelationPage && (
                <EntityPageInlineDescription
                  entityId={entityId}
                  spaceId={spaceId}
                  fallbackDescription={previewDescription}
                />
              )}
              <div className="flex items-center gap-4 text-text">
                {!isRelationPage && <EntityPageMetadataHeader spaceId={spaceId} />}
                <EntityPageActions entityId={entityId} spaceId={spaceId} isVoteable={!isRelationPage} />
              </div>
            </div>
            <Spacer height={40} />
            {personProfile ?? (
              <>
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
              </>
            )}
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
        {personProfile ?? (
          <>
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
          </>
        )}
      </EntityPageContentContainer>
    </>
  );
}
