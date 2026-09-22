'use client';

import * as React from 'react';

import { usePathname } from 'next/navigation';

import { CURATED_TOPIC_TAG_ID, SUBTOPIC_RELATION_TYPE_ID, TAG_PROPERTY_ID } from '~/core/constants';
import { ID } from '~/core/id';
import { useActiveTabIdForEditor } from '~/core/state/editor/editor-provider';
import { useEntitySidePanelActiveTab } from '~/core/state/entity-side-panel-active-tab';
import { useQueryEntity } from '~/core/sync/use-store';
import type { Relation, TabEntity } from '~/core/types';
import { resolveEntitySpaceId } from '~/core/utils/space/entity-home-space';
import { NavUtils } from '~/core/utils/utils';

import { ClampedText } from '~/design-system/clamped-text';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';
import { Skeleton } from '~/design-system/skeleton';
import { Text } from '~/design-system/text';

import { CommentSection } from '~/partials/comments/comments-section';
import { Editor } from '~/partials/editor/editor';
import { EditableHeading } from '~/partials/entity-page/editable-entity-header';
import {
  ENTITY_DESCRIPTION_MAX_LINES,
  EntityPageInlineDescription,
} from '~/partials/entity-page/entity-page-inline-description';
import { EntityTabs } from '~/partials/entity-page/entity-tabs';
import { META_CHIP_CLASS } from '~/partials/entity-page/relation-chip-section';
import { SPACE_TABS_ANCHOR } from '~/partials/space-page/space-tabs-anchor';

import { UNNAMED_SUBTOPIC_PROPERTY_ID } from '../ontology';
import { TopicFeed } from './topic-feed';
import { useTopicAncestors } from './use-topic-ancestors';

/** Shared with the cover/avatar header so its left edge stays aligned with the topic column. */
export const TOPIC_PAGE_CONTENT_MAX_WIDTH = 720;
export const TOPIC_PAGE_CONTENT_INSET_CLASS = 'px-4 @[560px]:px-5';

type TopicTab = 'overview' | 'custom';

export function resolveTopicTab({
  authoredTabId,
  panel,
}: {
  pathname: string;
  authoredTabId: string | null;
  panel: { activeTabId: string | null; activeSystemTab: string | null } | null;
}): TopicTab {
  if (panel) {
    if (panel.activeTabId) return 'custom';
    return 'overview';
  }

  if (authoredTabId) return 'custom';
  return 'overview';
}

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
 * One column at every width, laid out against a container query rather than the viewport, so the
 * route, the entity side panel and a phone are three widths of one page. Same as the claim page.
 *
 * Overview is a topic-scoped Explore feed. It mixes Claims, Debates and coverage entities into one
 * ranked rabbit hole while keeping authored tabs available through the same editor as Claim pages.
 */
export function TopicPageView({
  entityId,
  spaceId,
  initialTabRelations = [],
  tabEntities = [],
  footer,
  isEditing = false,
}: {
  entityId: string;
  spaceId: string;
  initialTabRelations?: Relation[];
  tabEntities?: TabEntity[];
  footer?: React.ReactNode;
  isEditing?: boolean;
}) {
  const { entity, isLoading } = useQueryEntity({ id: entityId, spaceId });
  const pathname = usePathname();
  const activeAuthoredTabId = useActiveTabIdForEditor();
  const sidePanelTab = useEntitySidePanelActiveTab();

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
  const activeTab = resolveTopicTab({ pathname, authoredTabId: activeAuthoredTabId, panel: sidePanelTab });
  const overviewHref = NavUtils.toEntity(spaceId, entityId);
  const systemTabs = [{ label: 'Overview', href: overviewHref, sidePanelKey: 'overview' }];

  if (isLoading && !entity) {
    return (
      <div className="flex flex-col gap-4 px-4 py-6 @[560px]:px-5">
        <Skeleton className="h-8 w-2/3 rounded" />
        <Skeleton className="h-[120px] w-full rounded-lg" />
      </div>
    );
  }

  if (!entity) return null;

  return (
    <div className="@container">
      <div
        className={`mx-auto flex w-full flex-col gap-6 py-6 @[560px]:gap-8 @[560px]:py-8 ${TOPIC_PAGE_CONTENT_INSET_CLASS}`}
        style={{ maxWidth: TOPIC_PAGE_CONTENT_MAX_WIDTH }}
      >
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
          {isEditing ? (
            <EditableHeading entityId={entityId} spaceId={spaceId} fallbackName={entity.name ?? entity.id} />
          ) : (
            <Text as="h1" variant="entityTitle" color="text" className="block text-pretty wrap-break-word">
              {entity.name ?? entity.id}
            </Text>
          )}

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
          {isEditing ? (
            <EntityPageInlineDescription
              entityId={entityId}
              spaceId={spaceId}
              fallbackDescription={entity.description}
            />
          ) : (
            entity.description && (
              <ClampedText
                text={entity.description}
                maxLines={ENTITY_DESCRIPTION_MAX_LINES}
                variant="body"
                textClassName="wrap-break-word text-grey-04"
              />
            )
          )}

          <div className="flex flex-wrap items-center gap-1.5">
            <span className={`${META_CHIP_CLASS} text-grey-04`}>Topic</span>
            {isCurated && <span className={`${META_CHIP_CLASS} text-grey-04`}>Curated</span>}
          </div>
        </header>

        <div id={sidePanelTab ? undefined : SPACE_TABS_ANCHOR}>
          <EntityTabs
            entityId={entityId}
            spaceId={spaceId}
            initialTabRelations={initialTabRelations}
            tabEntities={tabEntities}
            systemTabsBefore={systemTabs}
            reservedSystemLabels={systemTabs.map(tab => tab.label)}
            divideBeforeAuthored
          />
        </div>

        <TopicTabPanel activeTab={activeTab} entityId={entityId} spaceId={spaceId} subtopics={subtopics} />
        {footer}
      </div>
    </div>
  );
}

function TopicTabPanel({
  activeTab,
  entityId,
  spaceId,
  subtopics,
}: {
  activeTab: TopicTab;
  entityId: string;
  spaceId: string;
  subtopics: Relation[];
}) {
  if (activeTab === 'custom') return <Editor spaceId={spaceId} shouldHandleOwnSpacing />;

  return (
    <>
      <TopicFeed topicId={entityId} spaceId={spaceId} topicOptions={subtopics} />
      <CommentSection entityId={entityId} spaceId={spaceId} />
    </>
  );
}
