'use client';

import * as React from 'react';

import {
  CLAIM_PAGE_CONTENT_INSET_CLASS,
  CLAIM_PAGE_CONTENT_MAX_WIDTH,
  ClaimPageView,
} from '~/core/claims/browse/claim-page-view';
import { useSpace } from '~/core/hooks/use-space';
import { useUserIsEditing } from '~/core/hooks/use-user-is-editing';
import { useQueryEntity } from '~/core/sync/use-store';
import { TopicPageView } from '~/core/topics/browse/topic-page-view';
import type { Relation, TabEntity } from '~/core/types';
import { useEntityMediaUrl, useImageUrlFromEntity } from '~/core/utils/use-entity-media';

import { Spacer } from '~/design-system/spacer';

import { CommentSection } from '~/partials/comments/comments-section';
import { Editor } from '~/partials/editor/editor';
import { AutomaticModeToggle } from '~/partials/entity-page/automatic-mode-toggle';
import { type CustomBrowseView, customBrowseView, needsSpaceForView } from '~/partials/entity-page/custom-browse-view';
import { EditableHeading } from '~/partials/entity-page/editable-entity-header';
import { EntityBacklinks } from '~/partials/entity-page/entity-backlinks';
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
import { PersonalSpaceHeadline } from '~/partials/profile/personal-space-profile';

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

/**
 * Which custom read view this entity gets, if any.
 *
 * Claims keep their custom surface while editing, matching personal-space profiles: product-owned
 * tabs stay visible and fixed while authored tabs can be managed. `EntityPageBody` appends the
 * property editor beneath the claim surface, so keeping the custom UI does not hide raw fields.
 * Other custom views still fall through to the generic editor.
 *
 * Unscoped, matching how `EntityVoteButtons` reads the same flag. `types` is
 * derived across every space either way, so this is about consistency with the controls the pages
 * render rather than about reaching a type a scoped read would miss.
 */
function useCustomBrowseView(entityId: string, spaceId: string, isEditing: boolean): CustomBrowseView {
  const { entity, isLoading } = useQueryEntity({ id: entityId });

  /*
   * Asked for only by an entity whose view actually depends on it.
   *
   * `useSpace` sits above the dispatch — hooks cannot be called conditionally —
   * but its *query* can be, and running it unasked put a `getSpace` request
   * behind every claim, topic and ordinary entity page that had no use for the
   * answer. Passing `undefined` leaves the query disabled, which is what
   * `useSpace` already does with a missing id.
   *
   * `needsSpaceForView` reads the same precedence the dispatch does rather than
   * repeating part of it — see the note there.
   */
  const { space, isLoading: isLoadingSpace } = useSpace(needsSpaceForView({ entity, isEditing }) ? spaceId : undefined);

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
  const isEditing = useUserIsEditing(spaceId);
  const customView = useCustomBrowseView(entityId, spaceId, isEditing);

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

  // Mounted independently of edit-only content so a direct `?edit=true` route can turn editing on.
  // Claim and Topic both return before the generic EditorFooter, so keeping initialization there
  // makes both custom routes self-blocking. Side panels own their edit intent and do not use this.
  const routeEditInitializer = props.variant === 'route' ? <AutomaticModeToggle /> : null;

  if (customView === 'claim') {
    const showClaimMedia = props.variant === 'sidePanel' || props.showCover !== false;

    return (
      <>
        {showClaimMedia ? (
          props.variant === 'route' && props.coverSlot ? (
            props.coverSlot
          ) : (
            <EntityPageCover
              // Only an actual Avatar relation belongs in the circular treatment. The generic
              // media and preview fallbacks may be a cover image, which remains a cover here.
              avatarUrl={props.avatarUrl}
              coverUrl={props.coverUrl}
              compact={props.variant === 'sidePanel'}
              contentMaxWidth={CLAIM_PAGE_CONTENT_MAX_WIDTH}
              contentInsetClassName={CLAIM_PAGE_CONTENT_INSET_CLASS}
              // Claims use both media properties as part of their identity. The generic fitted
              // side-panel header suppresses avatars because they are usually just list
              // thumbnails, but doing that here would make a claim's configured avatar vanish.
              withAvatar
            />
          )
        ) : null}
        {routeEditInitializer}
        <ClaimPageView
          entityId={entityId}
          spaceId={spaceId}
          initialTabRelations={initialTabRelations}
          tabEntities={tabEntities}
          isEditing={isEditing}
          footer={isEditing && !props.hideProperties ? <ToggleEntityPage id={entityId} spaceId={spaceId} /> : undefined}
        />
      </>
    );
  }

  if (customView === 'topic') {
    return (
      <>
        {routeEditInitializer}
        <TopicPageView entityId={entityId} spaceId={spaceId} />
      </>
    );
  }

  /*
   * The profile, for the side panel.
   *
   * The space route builds it out of three pieces in three places — layout
   * header, rail, page body — so the panel, which has none of them, showed the
   * generic value sheet for somebody's profile instead. Clicking a debate
   * participant opens on exactly the pair that route uses: the person entity, in
   * their personal space.
   *
   * **Only the panel reaches this**, and an earlier version of this comment said
   * the `(entity)` full-page route did too. It does not:
   * `space/(entity)/[id]/[entityId]/page.tsx` intercepts every Person before
   * `DefaultEntityPage`, and for a personal space's own entity — which is typed
   * Space as well as Person — `ProfileEntityServerContainer` *redirects* to
   * `/space/<id>`, the real profile with its header, tabs and rail. That is a
   * better answer than this one and is left alone.
   *
   * Unlike the claim and topic views this is a *body*, not a whole page, and
   * returning early like they do was a mistake worth recording: it threw away
   * the cover, the avatar, the name and the bio drawn below, so the panel opened
   * on a bare Activity card with nothing above it saying whose record it was.
   * What it replaces is only what follows the header — the entity's authored
   * tabs and the editor/properties footer — because the profile has its own tabs
   * and its own idea of what belongs under each.
   */
  const tabsSection = (
    <EntityTabsSection
      entityId={entityId}
      spaceId={spaceId}
      initialTabRelations={initialTabRelations}
      tabEntities={tabEntities}
    />
  );

  /*
   * Keyed on the entity. `EntitySidePanelBody` is keyed too, so this is belt and
   * braces today — but the reason it is cheap to keep is that the route renders
   * this component *unkeyed* (`default-entity-page`, documented in
   * `relation-chip-section` for the same reason). Anything that later reaches
   * this branch from there would otherwise carry the previous profile's open tab
   * and that tab's space and topic chips into the next person's record.
   *
   * The person's authored tabs go with it: they belong to the page Overview
   * shows, and this is the only tab bar the panel has — the space route carries
   * them in its own header instead, which is why the profile body there does not.
   */
  const isPersonProfile = customView === 'person';
  const personProfile = isPersonProfile ? (
    <PersonProfileView key={entityId} entityId={entityId} spaceId={spaceId} authoredTabs={tabsSection} />
  ) : null;

  // The space read is still out on an entity that might be a profile. Its header
  // is already drawn above; what follows it is the part that depends on the
  // answer, and the generic tabs-and-editor would have to be swapped out for the
  // profile a moment later.
  const isPersonPending = customView === 'person-pending';
  const showGenericMetadataAndActions = !isPersonProfile && !isPersonPending;

  if (props.variant === 'sidePanel') {
    const { isRelationPage = false, previewName, previewDescription, notice, belowBodySlot, hideProperties } = props;
    const avatarUrl = props.avatarUrl ?? entityMediaUrl ?? previewImageUrlResolved ?? null;
    const heading = <EditableHeading spaceId={spaceId} entityId={entityId} fallbackName={previewName} />;
    const actions = (
      <EntityPageActions
        entityId={entityId}
        spaceId={spaceId}
        isVoteable={!isRelationPage}
        votesFirst={isPersonProfile}
      />
    );

    return (
      <div className="px-4 pt-6 pb-12 mobile:px-5">
        {/* A profile brings its avatar: it is the person's face, and the panel
            opened on a cover with nobody in it. Everything else keeps the
            cover-only header — see `EditableCoverAvatarHeader`. */}
        <EntityPageCover
          // A person's compact avatar must follow the same rule as a claim's: a cover-only entity
          // cannot reuse its rectangular cover/preview as a circular portrait.
          avatarUrl={isPersonProfile ? props.avatarUrl : avatarUrl}
          coverUrl={props.coverUrl}
          compact
          withAvatar={isPersonProfile}
        />
        <EntityPageContentContainer>
          <div>
            <div className="space-y-2">
              {isPersonProfile ? (
                // The mobile profile keeps voting, history and the overflow
                // menu beside the name, wrapping only when space runs out.
                <div className="relative flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                  <div className="min-w-0 grow">{heading}</div>
                  {actions}
                </div>
              ) : (
                heading
              )}
              {isPersonProfile && <PersonalSpaceHeadline spaceId={spaceId} personEntityId={entityId} />}
              {!isRelationPage && (
                <EntityPageInlineDescription
                  entityId={entityId}
                  spaceId={spaceId}
                  fallbackDescription={previewDescription}
                />
              )}
              {showGenericMetadataAndActions && (
                <div className="flex items-center gap-4 text-text">
                  {!isRelationPage && <EntityPageMetadataHeader spaceId={spaceId} />}
                  {actions}
                </div>
              )}
            </div>
            {personProfile ? (
              // The full-screen profile uses this margin rather than a fixed
              // spacer, allowing it to collapse with the description's mb-5.
              <div className="mt-6">{personProfile}</div>
            ) : (
              <>
                <Spacer height={40} />
                {isPersonPending ? null : (
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
      {routeEditInitializer}
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
        {personProfile ??
          (isPersonPending ? null : (
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
          ))}
      </EntityPageContentContainer>
    </>
  );
}
