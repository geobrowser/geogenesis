'use client';

import * as React from 'react';

import { CURATED_TOPIC_TAG_ID, SUBTOPIC_RELATION_TYPE_ID, TAG_PROPERTY_ID } from '~/core/constants';
import { useComments } from '~/core/hooks/use-comments';
import { ID } from '~/core/id';
import { useQueryEntity } from '~/core/sync/use-store';
import type { Relation, TabEntity } from '~/core/types';
import { resolveEntitySpaceId } from '~/core/utils/space/entity-home-space';
import { NavUtils } from '~/core/utils/utils';

import { ClampedText } from '~/design-system/clamped-text';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';
import { Skeleton } from '~/design-system/skeleton';
import { Text } from '~/design-system/text';

import { CommentSection } from '~/partials/comments/comments-section';
import { EntityCommentsButton } from '~/partials/comments/entity-comments-button';
import { Editor } from '~/partials/editor/editor';
import { EntityPageActions } from '~/partials/entity-page/entity-page-actions';
import { ENTITY_DESCRIPTION_MAX_LINES } from '~/partials/entity-page/entity-page-inline-description';
import { useEntityTabEntities } from '~/partials/entity-page/entity-tabs';
import { META_CHIP_CLASS, RelationChipSection } from '~/partials/entity-page/relation-chip-section';

import { UNNAMED_SUBTOPIC_PROPERTY_ID } from '../ontology';
import { useTopicSpaceScope } from '../use-topic-space-scope';
import { TopicClaims } from './topic-claims';
import { TopicCoverage } from './topic-coverage';
import { TopicDebates } from './topic-debates';
import { type TopicBuiltInTab, TopicTabs, TopicViewAll, useTopicActiveTab } from './topic-tabs';
import { useTopicAncestors } from './use-topic-ancestors';
import { useTopicTabCounts } from './use-topic-tab-counts';

/**
 * The browse-mode read view for a Topic.
 *
 * A topic is the graph's aggregation point: claims, episodes, news, tweets and documents all name
 * one, and the generic entity page shows that as undifferentiated backlinks. This orders it.
 *
 * Scoped differently from the claim page rather than not at all. A claim's responses belong to one
 * space and mixing two would report a population that belongs to neither, so that page pins itself
 * to the route's space. A topic's value is the opposite — it gathers — so pinning it the same way
 * would empty most of the page. What it draws from instead is the curated graph *plus* the route's
 * space (`useTopicSpaceScope`), which keeps the gathering while keeping out spaces nobody curated.
 * Each row is still linked into the space it actually lives in, which is routinely not the route's.
 *
 * ## Tabs, since GEO-2910
 *
 * This was one column of every section at once, four claims at a time behind a pager — 118 pages of
 * Previous and Next on a topic like `Iran War`. It is now a header and a tab bar: Overview keeps a
 * few of each as the curated read, and Claims, Debates and Coverage are where volume lives. The
 * editorial tabs the entity itself carries sit in the same bar behind a divider, because 163 topics
 * carry tabs and no space page to draw them on, and one of them carries fifteen.
 *
 * The header holds what stays true whichever tab is open: the cover (drawn above this by
 * `EntityPageBody`, which is where the early return that used to swallow it lived), the title and
 * description, the votes, the comment count, and the subtopics. Subtopics sit *above* the bar
 * rather than inside Overview because they answer the question the tabs answer — where can I go
 * from here — and a subtopic is no less relevant while you are reading Claims.
 *
 * One column at every width, laid out against a container query rather than the viewport, so the
 * route, the entity side panel and a phone are three widths of one page. Same as the claim page.
 */
export function TopicPageView({
  entityId,
  spaceId,
  initialTabRelations = [],
  tabEntities = [],
}: {
  entityId: string;
  spaceId: string;
  /** The entity's own `Tabs` relations, threaded from `EntityPageBody`. Empty is a topic with none. */
  initialTabRelations?: Relation[];
  tabEntities?: TabEntity[];
}) {
  const { entity, isLoading } = useQueryEntity({ id: entityId, spaceId });
  const spaceIds = useTopicSpaceScope(spaceId);
  const { counts, isReady: countsReady } = useTopicTabCounts(entityId, spaceIds);
  const { totalCount: commentCount } = useComments({ entityId, spaceId });

  // The panel's half of the tab state. The route keeps both halves in `?tabId=`; the panel cannot,
  // because the context that owns its entity tab rejects anything that is not an entity id — see
  // `useTopicActiveTab`.
  const [panelBuiltInTab, setPanelBuiltInTab] = React.useState<TopicBuiltInTab>('overview');
  const activeTab = useTopicActiveTab(panelBuiltInTab);
  const { entities: entityTabs } = useEntityTabEntities({ entityId, spaceId, initialTabRelations, tabEntities });

  const subtopics = React.useMemo(() => {
    // Both hierarchy properties, merged and deduplicated. The named `Subtopics` and the unnamed
    // `4b5bbddf…` carry near-identical sets, and which one a topic was written with varies — reading
    // only one silently drops children.
    const seen = new Map<string, Relation>();
    for (const relation of entity?.relations ?? []) {
      if (relation.isDeleted === true) continue;
      const isSubtopic =
        ID.equals(relation.type.id, SUBTOPIC_RELATION_TYPE_ID) ||
        ID.equals(relation.type.id, UNNAMED_SUBTOPIC_PROPERTY_ID);
      if (isSubtopic && !seen.has(ID.uuidToHex(relation.toEntity.id))) {
        seen.set(ID.uuidToHex(relation.toEntity.id), relation);
      }
    }
    return [...seen.values()];
  }, [entity?.relations]);

  const isCurated = React.useMemo(
    () =>
      (entity?.relations ?? []).some(
        relation =>
          relation.isDeleted !== true &&
          ID.equals(relation.type.id, TAG_PROPERTY_ID) &&
          ID.equals(relation.toEntity.id, CURATED_TOPIC_TAG_ID)
      ),
    [entity?.relations]
  );

  // The whole path down to this topic, not just the rung above it — a topic can sit several levels
  // deep, and showing one parent reads as though the hierarchy is flat.
  const ancestors = useTopicAncestors(entityId, spaceId);

  if (isLoading && !entity) {
    return (
      <div className="flex flex-col gap-4 px-4 py-6 @[560px]:px-5">
        <Skeleton className="h-8 w-2/3 rounded" />
        <Skeleton className="h-[120px] w-full rounded-lg" />
      </div>
    );
  }

  if (!entity) return null;

  const { builtIn, entityTabId } = activeTab;

  const viewAllFor = (tab: Exclude<TopicBuiltInTab, 'overview'>, count: number) => (
    <TopicViewAll
      entityId={entityId}
      spaceId={spaceId}
      tab={tab}
      count={countsReady ? count : undefined}
      onSelect={setPanelBuiltInTab}
    />
  );

  return (
    <div className="@container">
      <div className="mx-auto flex w-full max-w-[720px] flex-col gap-6 px-4 py-6 @[560px]:gap-8 @[560px]:px-5 @[560px]:py-8">
        <header className="flex flex-col gap-3">
          {ancestors.length > 0 && (
            <nav aria-label="Topic path" className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
              {ancestors.map((ancestor, index) => (
                <React.Fragment key={ancestor.id}>
                  {index > 0 && (
                    <span aria-hidden className="text-metadata text-grey-03">
                      ›
                    </span>
                  )}
                  <Link
                    // Where the ancestor actually lives, not `spaces[0]` — that list is
                    // rank-sorted and counts citing spaces, so the crumb could link into a space
                    // holding nothing but a link back to this topic.
                    href={NavUtils.toEntity(resolveEntitySpaceId(ancestor, spaceId), ancestor.id)}
                    className="text-metadata text-grey-04 transition-colors hover:text-text"
                  >
                    {ancestor.name ?? ancestor.id}
                  </Link>
                </React.Fragment>
              ))}
            </nav>
          )}

          {/* The `entityTitle` token — size, line height, weight and letter spacing all come from
              it rather than being restated here. Same token the entity and space headers use, so a
              topic title matches a regular entity title at every width (44/36/26 per GEO-2460).

              Deliberately not container-scaled: the regular entity header isn't either, so scaling
              this one down in the side panel would reintroduce a mismatch. `text-pretty` stays — it
              governs where the line breaks, not how big it is. */}
          <Text as="h1" variant="entityTitle" color="text" className="block wrap-break-word text-pretty">
            {entity.name ?? entity.id}
          </Text>

          {/* Clamped, like entity pages, the side panel and the claim page (GEO-2776). What is
              shared is the line budget, not the cut: wrapping decides where the break lands and
              wrapping follows width, so the route view, the side panel and a phone stop at
              different words. They give up the same three lines of the page, which a character
              count could not do — the same count spends a different number of lines at each width,
              and lines are what the reader is actually paying.

              `ClampedText` measures an unclamped clone, so the toggle appears only when something
              is genuinely hidden. The naive-overflow bug GEO-2756 fixed lived in the debates
              feed's own title, which clamps a heading inside a link and so has its own
              implementation. */}
          {entity.description && (
            <ClampedText
              text={entity.description}
              maxLines={ENTITY_DESCRIPTION_MAX_LINES}
              variant="body"
              textClassName="wrap-break-word text-grey-04"
            />
          )}

          {/* What the topic *is* on the left, what people have made of it on the right. The votes
              and the comment count are judgements about the topic, so they sit beside the type and
              curation chips and above the navigation — which is where the generic page and the
              space header already put them (GEO-2910). Real votes have been landing here the whole
              time with nothing to show them: `Iran War` is +7/−1. */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={`${META_CHIP_CLASS} text-grey-04`}>Topic</span>
            {isCurated && <span className={`${META_CHIP_CLASS} text-grey-04`}>Curated</span>}
            <div className="ml-auto flex items-center gap-4">
              {/* Comments stay inline at the bottom of Overview, which is the topic's own page. On
                  every other tab the reader is looking at other people's entities, so this count
                  opens the global panel instead — the rule `EntityCommentsButton` already states,
                  and the reason it is not a tab of its own (one commenter across 2,000 topics). */}
              <EntityCommentsButton entityId={entityId} spaceId={spaceId} count={commentCount} />
              <EntityPageActions entityId={entityId} spaceId={spaceId} isVoteable />
            </div>
          </div>
        </header>

        <RelationChipSection label="Subtopics" relations={subtopics} spaceId={spaceId} />

        <TopicTabs
          entityId={entityId}
          spaceId={spaceId}
          activeTab={activeTab}
          onSelectBuiltIn={setPanelBuiltInTab}
          onSelectEntityTab={() => setPanelBuiltInTab('overview')}
          counts={counts}
          countsReady={countsReady}
          entityTabs={entityTabs}
        />

        {/* An editorial tab's content is that tab entity's own blocks, which is what `Editor`
            renders — the same call the generic page's footer makes. Both surfaces already sit
            inside an editor provider (`RouteEditorProvider` on the route, `SidePanelEditorProvider`
            in the panel), so the tab it resolves is the one selected above without anything being
            threaded through this component. */}
        {entityTabId ? (
          <Editor spaceId={spaceId} shouldHandleOwnSpacing />
        ) : builtIn === 'overview' ? (
          <>
            <TopicDebates
              topicId={entityId}
              spaceId={spaceId}
              mode="preview"
              viewAllSlot={viewAllFor('debates', counts.debates)}
            />
            <TopicClaims
              topicId={entityId}
              spaceId={spaceId}
              mode="preview"
              viewAllSlot={viewAllFor('claims', counts.claims)}
            />
            <TopicCoverage
              topicId={entityId}
              spaceId={spaceId}
              mode="preview"
              viewAllSlot={viewAllFor('coverage', counts.coverage)}
            />
            {/* Comments stay here rather than becoming a tab: one commenter across 2,000 topics.
                Overview is the topic's own page, which is the surface `EntityCommentsButton`'s own
                rule says renders them inline. */}
            <CommentSection entityId={entityId} spaceId={spaceId} />
          </>
        ) : builtIn === 'claims' ? (
          <TopicClaims topicId={entityId} spaceId={spaceId} mode="full" />
        ) : builtIn === 'debates' ? (
          <TopicDebates topicId={entityId} spaceId={spaceId} mode="full" />
        ) : (
          <TopicCoverage topicId={entityId} spaceId={spaceId} mode="full" />
        )}
      </div>
    </div>
  );
}
