import { IdUtils, SystemIds } from '@geoprotocol/geo-sdk/lite';

import * as React from 'react';

import { notFound } from 'next/navigation';

import { fetchShownPropertyEntitiesForBlocks } from '~/core/blocks/data/fetch-block-shown-properties';
import { fetchCollectionItemsForBlocks } from '~/core/blocks/data/fetch-collection-items';
import { ProfileDebateButton } from '~/core/debates/profile-debate-button';
import { fetchProfileFacts } from '~/core/io/subgraph/fetch-profile-facts';
import { EntityId } from '~/core/io/substream-schema';
import { profileRailFacts } from '~/core/profile/profile-rail-facts';
import { SpaceVerifyButton } from '~/core/space/space-verify-button';
import { RouteEditorProvider, Tabs } from '~/core/state/editor/editor-provider';
import { EntityStoreProvider } from '~/core/state/entity-page-store/entity-store-provider';
import { Entities } from '~/core/utils/entity';
import { Spaces } from '~/core/utils/space';
import { sortRelations } from '~/core/utils/utils';

import { Skeleton } from '~/design-system/skeleton';
import { Spacer } from '~/design-system/spacer';

import { EditableSpaceHeading } from '~/partials/entity-page/editable-space-header';
import { EntityPageCover } from '~/partials/entity-page/entity-page-cover';
import { EntityPageInlineDescription } from '~/partials/entity-page/entity-page-inline-description';
import { ENTITY_PAGE_WITH_SIDEBAR_MAX_WIDTH } from '~/partials/entity-page/entity-page-layout';
import { PersonalProfileBioStarterMerge } from '~/partials/entity-page/personal-profile-bio-starter-merge';
import { PersonalProfileSuggestedCard } from '~/partials/entity-page/personal-profile-suggested-card';
import { PersonalProfileSuggestedTaskSync } from '~/partials/entity-page/personal-profile-suggested-task-sync';
import { TypeSchemaInline } from '~/partials/entity-page/type-schema-inline';
import { PersonalSpaceHeadline } from '~/partials/profile/personal-space-profile';
import { ProfileActions } from '~/partials/profile/profile-actions';
import { ProfileRail } from '~/partials/profile/profile-rail';
import { AddDataPanel } from '~/partials/space-page/add-data-panel';
import { SpaceEditors } from '~/partials/space-page/space-editors';
import { SpaceMembers } from '~/partials/space-page/space-members';
import { SpacePageMetadataHeader } from '~/partials/space-page/space-metadata-header';
import { SPACE_TABS_ANCHOR, SpaceTabs } from '~/partials/space-page/space-tabs';
import type { PersonRecordCounts } from '~/partials/space-page/space-tabs';

import { cachedFetchEntitiesBatch, cachedFetchEntityPage } from '../../(entity)/[id]/[entityId]/cached-fetch-entity';
import { cachedFetchSpace } from '../cached-fetch-space';
import { ProfileRailGate, SpaceChromeGate, SpaceHeaderContentGate } from './space-chrome-gate';
import { resolveSpaceSidebar } from './space-sidebar';

type LayoutProps = {
  params: Promise<{ id: string }>;
  children: React.ReactNode;
};

export default async function Layout(props0: LayoutProps) {
  const params = await props0.params;

  const { children } = props0;

  const spaceId = params.id;

  if (!IdUtils.isValid(spaceId)) {
    notFound();
  }

  const [props, { hasSidebar, isExternalTopic }] = await Promise.all([
    getSpaceFrontPage(spaceId),
    resolveSpaceSidebar(spaceId),
  ]);

  const typeIds = props.space?.entity?.types?.map(t => t.id) ?? [];

  /**
   * A personal space with a profile of its own (GEO-2859).
   *
   * Both halves matter. `PERSONAL` alone includes the personal spaces with no
   * person entity behind them, which have nothing to render a profile from; a
   * person entity alone would include a Person written into a DAO space.
   *
   * Shared with `page.tsx` rather than spelled out twice: this decides the
   * header and the chrome, that one decides the body, and a page with one and
   * not the other is worse than neither.
   */
  const isProfile = Spaces.isPersonProfileSpace(props.space);

  /**
   * How much this person's record holds, so the tabs holding nothing are not
   * drawn (GEO-2859).
   *
   * Read here rather than in `SpaceTabs` because the tab bar is server-rendered
   * with the header: fetched in the client, the tabs would appear and then one
   * of them would vanish, which is worse than the empty tab it removes.
   *
   * `undefined` on failure, and `buildSpaceTabs` reads that as "show
   * everything". A count that could not be read must not be mistaken for a
   * record that is empty — hiding a tab holding hundreds of rows is the one
   * outcome worse than showing one holding none. The same query the rail makes,
   * so this is a cache hit rather than a second request.
   */
  const personRecordCounts = isProfile ? await personRecordCountsFor(spaceId, props.id) : undefined;

  /**
   * The rail lives here rather than on the Overview page (GEO-2859).
   *
   * It is part of the profile, not of one tab: rendered per-page it appeared on
   * Overview and vanished on Debates, Positions and Proposals, and the main
   * column jumped a rail's width on every tab change. Here it is rendered once,
   * above `children`, and every tab lands in the column beside it.
   *
   * `space.entity` is the topic — the person — and `SpaceEntityDto` has already
   * scoped its values and relations to this space, which is the filtering the
   * Overview page used to do by hand.
   */
  const profileRail = isProfile ? (
    <ProfileRail spaceId={spaceId} personEntityId={props.id} {...profileRailFacts(props.space, spaceId)} />
  ) : null;

  return (
    <EntityStoreProvider id={props.id} spaceId={spaceId}>
      <RouteEditorProvider
        id={props.id}
        spaceId={spaceId}
        initialBlockRelations={props.blockRelations}
        initialBlocks={props.blocks}
        initialTabs={props.tabs}
        initialCollectionItems={props.initialCollectionItems}
      >
        <SpaceChromeGate keepChrome={isProfile}>
          {/*
           * A profile's text column is the wider with-sidebar variant — the rail
           * is part of the page — so the avatar lines up against that rather
           * than against the ordinary page width.
           */}
          <EntityPageCover
            avatarUrl={props.avatarUrl}
            coverUrl={props.coverUrl}
            contentMaxWidth={isProfile ? ENTITY_PAGE_WITH_SIDEBAR_MAX_WIDTH : undefined}
          />
          <SpaceHeaderContentGate
            serverHasSidebar={hasSidebar}
            isExternalTopic={isExternalTopic}
            alwaysHasSidebar={isProfile}
          >
            {/*
             * Pulled up on a profile. The shared header leaves 40px under an
             * avatar that already overhangs the cover by 40 — right for a space,
             * where the name is the first thing under it, and too much here
             * where a name, three roles and a bio all follow.
             */}
            <div className={isProfile ? '-mt-4 space-y-2' : 'space-y-2'}>
              <EditableSpaceHeading
                spaceId={spaceId}
                entityId={props.id}
                keepSpaceActions={isProfile}
                nameAccessoryComponent={
                  // Beside the name on every personal space, profile or not. It
                  // is a statement about who this is rather than an action on
                  // them, and it reads as one where it sits.
                  props.space?.type === 'PERSONAL' ? <SpaceVerifyButton spaceId={spaceId} /> : null
                }
                actionsComponent={
                  isProfile ? (
                    <ProfileActions spaceId={spaceId} personEntityId={props.id} />
                  ) : typeIds.includes(SystemIds.PERSON_TYPE) ? (
                    <ProfileDebateButton spaceId={spaceId} />
                  ) : null
                }
              />
              {isProfile && <PersonalSpaceHeadline spaceId={spaceId} personEntityId={props.id} />}
              <EntityPageInlineDescription entityId={props.id} spaceId={spaceId} />
              {/*
               * A profile renders none of this row. Types move to the rail's
               * About section, the vote pair into the action row beside Edit
               * profile, and Import and the member avatars say nothing about a
               * person — a personal space's only member is its owner. The
               * editor still gets the row, because that is where types are
               * added and the rail's pills are a read-only view — which is
               * decided inside the component, since edit mode is client state.
               */}
              <SpacePageMetadataHeader
                spaceId={spaceId}
                profileChrome={isProfile}
                membersComponent={
                  <div className="flex items-center gap-2">
                    <React.Suspense fallback={<MembersSkeleton />}>
                      <SpaceEditors spaceId={spaceId} />
                    </React.Suspense>
                    <React.Suspense fallback={null}>
                      <SpaceMembers spaceId={spaceId} />
                    </React.Suspense>
                  </div>
                }
              />
            </div>

            <div className="mt-6 flex flex-col gap-6">
              <AddDataPanel spaceId={spaceId} />

              {typeIds.includes(SystemIds.PERSON_TYPE) ? (
                <>
                  <PersonalProfileBioStarterMerge entityId={props.id} spaceId={spaceId} />
                  <PersonalProfileSuggestedTaskSync entityId={props.id} spaceId={spaceId} />
                  {/*
                   * The Get started card is off on a profile: its three prompts
                   * — bio, skills, post — are all things the profile itself now
                   * offers in place, on the section they belong to, and a
                   * banner above the fold repeating them is the loudest thing
                   * on a page about a person.
                   */}
                  {!isProfile && (
                    <PersonalProfileSuggestedCard spaceId={spaceId} entityId={props.id} withBottomSpacing={false} />
                  )}
                </>
              ) : null}
              <TypeSchemaInline entityId={props.id} spaceId={spaceId} />
              {/*
               * The tab bar is a link target, so a link can send the reader to the tabs rather than
               * to the top of the page — see `withSpaceTabsAnchor`. `scroll-mt-14` clears the sticky
               * navbar above it, which would otherwise cover the row the link exists to show.
               */}
              <div id={SPACE_TABS_ANCHOR} className="scroll-mt-14">
                <React.Suspense fallback={null}>
                  <SpaceTabs
                    spaceId={spaceId}
                    entityId={props.id}
                    initialTabRelations={props.tabRelations ?? []}
                    tabEntities={props.tabEntities}
                    typeIds={typeIds}
                    isProfile={isProfile}
                    personRecordCounts={personRecordCounts}
                  />
                </React.Suspense>
              </div>
            </div>
          </SpaceHeaderContentGate>
          <Spacer height={20} />
        </SpaceChromeGate>
        {/*
         * Inside the gate's own file, so this rule and the header's cannot
         * drift — see `ProfileRailGate`. A nested debate route is full-screen
         * and takes neither.
         */}
        <ProfileRailGate isProfile={isProfile} sidebar={profileRail}>
          {children}
        </ProfileRailGate>
      </RouteEditorProvider>
    </EntityStoreProvider>
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

const getSpaceFrontPage = async (spaceId: string) => {
  const space = await cachedFetchSpace(spaceId);
  const entity = space?.entity;

  if (!entity) {
    return {
      id: IdUtils.generate(),
      spaces: [spaceId],
      tabEntities: [],
      tabs: {},
      blockRelations: [],
      blocks: [],
      initialCollectionItems: {},
      space: null,
      avatarUrl: null,
      coverUrl: null,
    };
  }

  // Local-dev fallback: when the indexer has the space but its home entity has no id
  // (the e2e bootstrap registers personal spaces without going through
  // personalSpaces.create, so spaceEntityId is never assigned), reuse the spaceId as
  // a deterministic home-entity id. We *also* fetch the entity at id=spaceId so any
  // values we published under this synthetic id surface on the page. Without the
  // second fetch, edits land in the indexer but the layout reads space.entity which
  // still has empty values.
  //
  // Gated to the e2e/test environment: on testnet/mainnet a fresh space can also
  // have an empty entity.id during the indexer-lag window, and handing out the
  // synthetic id there attaches edits to an entity that permanently diverges from
  // the real home entity once it indexes. Outside test env we render the empty
  // entity and let the next request pick up the indexed one.
  if (!entity.id && process.env.NEXT_PUBLIC_IS_TEST_ENV === 'true') {
    const syntheticPage = await cachedFetchEntityPage(spaceId, spaceId);
    const syntheticEntity = syntheticPage?.entity ?? null;

    // eslint-disable-next-line no-console
    console.log('[local-dev synthetic-home] spaceId=%s synthetic=%o', spaceId, {
      gotPage: !!syntheticPage,
      entityId: syntheticEntity?.id,
      entityName: syntheticEntity?.name,
      valuesCount: syntheticEntity?.values?.length ?? 0,
      sampleValues: syntheticEntity?.values?.slice(0, 3).map(v => ({
        propertyId: v.property?.id,
        propertyName: v.property?.name,
        spaceId: v.spaceId,
        value: v.value,
      })),
    });

    const spaceWithSyntheticEntity = syntheticEntity
      ? { ...space, entity: { ...space.entity, ...syntheticEntity, id: spaceId, spaceId } }
      : space;

    return {
      id: spaceId,
      tabEntities: [],
      tabRelations: [],
      tabs: {},
      blockRelations: syntheticEntity?.relations ?? [],
      blocks: [],
      initialCollectionItems: {},
      space: spaceWithSyntheticEntity,
      avatarUrl: syntheticEntity ? (Entities.avatar(syntheticEntity.relations) ?? null) : null,
      coverUrl: syntheticEntity ? (Entities.cover(syntheticEntity.relations) ?? null) : null,
    };
  }

  const tabRelations = entity?.relations.filter(r => r.type.id === SystemIds.TABS_PROPERTY) ?? [];
  const tabIds = sortRelations(tabRelations).map(r => r.toEntity.id);

  const fetchedTabEntities = tabIds ? await cachedFetchEntitiesBatch(tabIds, spaceId) : [];

  // Re-order entities to match the sorted tabIds order (batch fetch doesn't preserve order)
  const tabEntityMap = new Map(fetchedTabEntities.map(e => [e.id, e]));
  const tabEntities = tabIds.map(id => tabEntityMap.get(id)).filter((e): e is NonNullable<typeof e> => e != null);

  const tabBlocks = await Promise.all(
    tabEntities.map(async entity => {
      const tabBlockRelations = entity?.relations.filter(r => r.type.id === SystemIds.BLOCKS) ?? [];
      const tabBlockEntityIds = tabBlockRelations.map(r => r.toEntity.id);
      const tabBlockRelationEntityIds = tabBlockRelations.map(r => r.entityId).filter(Boolean);
      const allTabBlockIds = [...new Set([...tabBlockEntityIds, ...tabBlockRelationEntityIds])];

      const blocks = allTabBlockIds.length > 0 ? await cachedFetchEntitiesBatch(allTabBlockIds) : [];
      return blocks;
    })
  );

  const tabs: Tabs = {};

  tabEntities.forEach((entity, index) => {
    tabs[entity.id as EntityId] = {
      entity,
      blocks: tabBlocks[index],
    };
  });

  const blockRelations = entity?.relations.filter(r => r.type.id === SystemIds.BLOCKS) ?? [];
  const blockEntityIds = blockRelations.map(r => r.toEntity.id);
  const blockRelationEntityIds = blockRelations.map(r => r.entityId).filter(Boolean);
  const allBlockIds = [...new Set([...blockEntityIds, ...blockRelationEntityIds])];

  const blocks = allBlockIds.length > 0 ? await cachedFetchEntitiesBatch(allBlockIds) : [];

  const allBlocks = [...blocks, ...tabBlocks.flat()];
  const allBlockRelations = [
    ...blockRelations,
    ...tabEntities.flatMap(tabEntity => tabEntity.relations.filter(r => r.type.id === SystemIds.BLOCKS)),
  ];
  const [initialCollectionItems, shownPropertyEntities] = await Promise.all([
    fetchCollectionItemsForBlocks(allBlocks, cachedFetchEntitiesBatch, spaceId, allBlockRelations),
    fetchShownPropertyEntitiesForBlocks(allBlocks, cachedFetchEntitiesBatch),
  ]);

  return {
    id: entity.id,
    tabEntities,
    tabRelations,
    tabs,
    blockRelations: entity.relations,
    // Shown-column properties ride along with the blocks so the editor hydrates them in the same
    // pass — a gallery needs the dimensions on them to size its cards on the first paint.
    blocks: [...blocks, ...shownPropertyEntities],
    initialCollectionItems,
    space,
    avatarUrl: Entities.avatar(entity.relations) ?? null,
    coverUrl: Entities.cover(entity.relations) ?? null,
  };
};

/**
 * The three record counts behind the profile's tabs.
 *
 * Swallows the failure deliberately: `fetchProfileFacts` throws so the *rail*
 * can say its numbers are unavailable rather than print a confident zero, but
 * here there is no such distinction to draw — a tab is either offered or not.
 * Returning undefined offers all three, which is the outcome to prefer when
 * nothing is known.
 */
async function personRecordCountsFor(spaceId: string, personEntityId: string): Promise<PersonRecordCounts | undefined> {
  try {
    const facts = await fetchProfileFacts(spaceId, personEntityId);
    return { debates: facts.debates, positions: facts.positions, proposals: facts.proposals };
  } catch {
    return undefined;
  }
}
