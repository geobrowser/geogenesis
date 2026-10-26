import * as React from 'react';

import { TrackedErrorBoundary } from '~/core/telemetry/tracked-error-boundary';
import { SpaceTopicFeed } from '~/core/topics/browse/topic-feed';
import { spacePageEntityId } from '~/core/utils/space/space-page';

import { EmptyErrorComponent } from '~/design-system/empty-error-component';
import { Spacer } from '~/design-system/spacer';

import { Editor } from '~/partials/editor/lazy-editor';
import { BacklinksServerContainer } from '~/partials/entity-page/backlinks-server-container';
import { EntityPageSidebarLayout } from '~/partials/entity-page/entity-page-sidebar-layout';
import { ToggleEntityPage } from '~/partials/entity-page/toggle-entity-page';
import { RootExploreSidePanelContainer } from '~/partials/explore/root-explore-side-panel-container';
import { SpaceDebateActivitySection } from '~/partials/space-page/space-debate-activity-section';
import { SpaceOverviewSidePanelContainer } from '~/partials/space-page/space-overview-side-panel-container';

import { cachedFetchEntityPage } from '../../(entity)/[id]/[entityId]/cached-fetch-entity';
import { cachedFetchSpace } from '../cached-fetch-space';
import { resolveSpaceSidebar } from './space-sidebar';

type CachedSpace = Awaited<ReturnType<typeof cachedFetchSpace>>;

/**
 * The space's own page — its authored blocks, properties and backlinks — with the rail beside it
 * on Overview.
 *
 * Lifted out of `page.tsx` so a topic space, whose bare URL is its Explore feed, can render the
 * same Overview at `/overview` rather than a second copy of it.
 */
export async function SpaceOverviewBody({
  space,
  spaceId,
  tabId,
}: {
  space: CachedSpace;
  spaceId: string;
  /** An authored tab, when one is open. It gets no rail and no activity card. */
  tabId: string | undefined;
}) {
  const [props, { isRootSpace, communityCalls }] = await Promise.all([
    getSpaceFrontPage(space),
    resolveSpaceSidebar(spaceId),
  ]);

  // Overview only, which is what `!tabId` means here — a tab gets no rail, and so no subspaces
  // (GEO-2875).
  const sidebar = tabId ? null : (
    <SpaceOverviewSidebar spaceId={spaceId} isRootSpace={isRootSpace} communityCalls={communityCalls} />
  );

  return (
    <EntityPageSidebarLayout sidebar={sidebar}>
      {/*
       * Debate activity first, on Overview only (GEO "space activity section").
       *
       * The same card a person's profile leads with, and it leads here for the same reason: the
       * space's authored page is what the space is *for*, but it is also the part that changes
       * least, while the debates argued here and the claims queued up for debating are what
       * somebody arriving wants to know is happening. It renders nothing at all unless the space is
       * set up for debates and actually holds some, so every other space is unchanged — including
       * the vertical rhythm, since an absent section contributes no height.
       *
       * Not rendered on a tab: `tabId` means an authored page of the space's own, and an activity
       * card above it would read as a section of that page rather than of the space.
       */}
      {!tabId && <SpaceDebateActivitySection spaceId={spaceId} />}
      <React.Suspense fallback={null}>
        <Editor spaceId={spaceId} shouldHandleOwnSpacing />
      </React.Suspense>
      <Spacer height={24} />
      <ToggleEntityPage id={props.id} spaceId={spaceId} />
      <Spacer height={40} />
      {/*
        Some SEO parsers fail to parse meta tags if there's no fallback in a suspense
        boundary. We don't want to show any referenced by loading states but do want to
        stream it in
      */}
      {/*
        Skipped entirely when the space has no page entity yet — `props.id` is then `''` or the
        id the page will be created at, and nothing can link to either. It stops a boundary, a
        Suspense and a render existing to produce nothing.
      */}
      {props.hasPage && props.id !== '' && (
        <TrackedErrorBoundary fallback={<EmptyErrorComponent />}>
          <React.Suspense fallback={<div />}>
            <BacklinksServerContainer entityId={props.id} />
          </React.Suspense>
        </TrackedErrorBoundary>
      )}
    </EntityPageSidebarLayout>
  );
}

/**
 * The Explore landing of a space whose home entity is a Topic.
 *
 * Keeps the Overview's rail, so landing on the space reads the same beside the feed as it did
 * beside the authored page — the header's width is seeded from this URL either way.
 */
export async function SpaceTopicExploreBody({ spaceId, spaceTopicId }: { spaceId: string; spaceTopicId: string }) {
  const { isRootSpace, communityCalls } = await resolveSpaceSidebar(spaceId);

  return (
    <EntityPageSidebarLayout
      sidebar={<SpaceOverviewSidebar spaceId={spaceId} isRootSpace={isRootSpace} communityCalls={communityCalls} />}
    >
      <SpaceTopicFeed spaceId={spaceId} spaceTopicId={spaceTopicId} />
    </EntityPageSidebarLayout>
  );
}

/**
 * Both branches are containers under Suspense so the rail's query never delays the page's own
 * JSX; the gallery this replaces streamed the same way.
 */
function SpaceOverviewSidebar({
  spaceId,
  isRootSpace,
  communityCalls,
}: {
  spaceId: string;
  isRootSpace: boolean;
  communityCalls: Awaited<ReturnType<typeof resolveSpaceSidebar>>['communityCalls'];
}) {
  return (
    <React.Suspense fallback={null}>
      {isRootSpace ? (
        <RootExploreSidePanelContainer spaceId={spaceId} includeSubspaces />
      ) : (
        <SpaceOverviewSidePanelContainer spaceId={spaceId} communityCalls={communityCalls} />
      )}
    </React.Suspense>
  );
}

const getSpaceFrontPage = async (space: CachedSpace) => {
  const entity = space?.entity;

  if (!entity) {
    // A space with no home entity. `id` stays `''` rather than a generated one because
    // consumers here render it, and inventing an id makes them render a page for an
    // entity that does not exist — the layout's variant generates one only because it
    // needs a stable key. Anything that treats this as a real id is the caller's bug to
    // avoid; see the `props.id` guard where backlinks are rendered.
    return {
      id: '',
      hasPage: false,
      name: null,
      values: [],
      relations: [],
      spaceTypes: [],
    };
  }

  // See layout.tsx getSpaceFrontPage for the rationale (incl. why this is gated
  // to the test env). When the indexer's space record has no home entity id,
  // treat spaceId as the synthetic home-entity id AND fetch the entity at that
  // id so published values surface here (not just space.entity which is empty
  // in that case).
  if (!entity.id && space?.id && process.env.NEXT_PUBLIC_IS_TEST_ENV === 'true') {
    const synthetic = await cachedFetchEntityPage(space.id, space.id);
    const syntheticEntity = synthetic?.entity ?? null;
    return {
      id: space.id,
      hasPage: true,
      name: syntheticEntity?.name ?? null,
      values: syntheticEntity?.values ?? [],
      spaceTypes: syntheticEntity?.types ?? [],
      relationsOut: syntheticEntity?.relations ?? [],
    };
  }

  return {
    name: entity?.name ?? null,
    values: entity?.values ?? [],
    // The id the page will be created at when the space has none, so the properties panel below
    // does not write to `''` (GEO-2966). `hasPage` still says whether anything exists there yet.
    id: space ? spacePageEntityId(space) : entity.id,
    hasPage: entity.id !== '',
    spaceTypes: space?.entity?.types ?? [],
    relationsOut: entity?.relations ?? [],
  };
};
