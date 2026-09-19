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
import { TopicPageView } from '~/core/topics/browse/topic-page-view';
import type { Relation, TabEntity } from '~/core/types';
import { Spaces } from '~/core/utils/space';
import { useEntityMediaUrl, useImageUrlFromEntity } from '~/core/utils/use-entity-media';

import { Spacer } from '~/design-system/spacer';

import { CommentSection } from '~/partials/comments/comments-section';
import { Editor } from '~/partials/editor/editor';
import { AutomaticModeToggle } from '~/partials/entity-page/automatic-mode-toggle';
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

export type CustomBrowseView = 'claim' | 'topic' | 'person' | 'person-pending' | 'generic' | 'pending';

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
    // `person-pending`, not `pending`: the caller holds back the *body* on this
    // one and draws the header regardless. A profile and an ordinary Person
    // entity have the same cover, avatar, name and bio, so there is nothing to
    // get wrong by drawing them — where blanking the page would make every
    // Person in a DAO space wait out a space read for a view it was never going
    // to get.
    if (!space) return isLoadingSpace ? 'person-pending' : 'generic';
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
  const tabsSection = (
    <EntityTabsSection
      entityId={entityId}
      spaceId={spaceId}
      initialTabRelations={initialTabRelations}
      tabEntities={tabEntities}
    />
  );

  /*
   * Keyed on the entity, because the route does not remount these views on
   * navigation — `default-entity-page` renders this component unkeyed, which
   * `relation-chip-section` documents for the same reason. Following one person
   * to the next would otherwise keep the previous profile's open tab and that
   * tab's space and topic chips, and render B's record filtered by A's
   * selection. The side panel escapes it only because `EntitySidePanelBody` is
   * keyed; the route is not.
   *
   * The person's authored tabs go with it: they belong to the page Overview
   * shows, and this is the only tab bar either of these surfaces has — the space
   * route carries them in its own header instead, which is why the profile body
   * there does not.
   */
  const personProfile =
    customView === 'person' ? (
      <PersonProfileView key={entityId} entityId={entityId} spaceId={spaceId} authoredTabs={tabsSection} />
    ) : null;

  // The space read is still out on an entity that might be a profile. Its header
  // is already drawn above; what follows it is the part that depends on the
  // answer, and the generic tabs-and-editor would have to be swapped out for the
  // profile a moment later.
  const isPersonPending = customView === 'person-pending';

  if (props.variant === 'sidePanel') {
    const { isRelationPage = false, previewName, previewDescription, notice, belowBodySlot, hideProperties } = props;
    const avatarUrl = props.avatarUrl ?? entityMediaUrl ?? previewImageUrlResolved ?? null;

    return (
      <div className="px-4 pt-6 pb-12 sm:px-5">
        {/* A profile brings its avatar: it is the person's face, and the panel
            opened on a cover with nobody in it. Everything else keeps the
            cover-only header — see `EditableCoverAvatarHeader`. */}
        <EntityPageCover
          avatarUrl={avatarUrl}
          coverUrl={props.coverUrl}
          fitImage
          withAvatar={customView === 'person'}
        />
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
            {personProfile ??
              (isPersonPending ? null : (
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
              ))}
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
