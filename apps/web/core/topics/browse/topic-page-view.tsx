'use client';

import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import * as React from 'react';

import { usePathname } from 'next/navigation';

import { CURATED_TOPIC_TAG_ID, TAG_PROPERTY_ID, TOPIC_TYPE_ID } from '~/core/constants';
import { readTypes } from '~/core/database/entities';
import { useEntityCommentCount } from '~/core/hooks/use-entity-comment-count';
import { useCanUserEdit } from '~/core/hooks/use-user-is-editing';
import { ID } from '~/core/id';
import { useActiveTabIdForEditor, useEditorInstance } from '~/core/state/editor/editor-provider';
import { useBlocks } from '~/core/state/editor/use-blocks';
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
import { RelationsGroup as EditableRelationsGroup } from '~/partials/entity-page/editable-entity-page';
import { EntityPageActions } from '~/partials/entity-page/entity-page-actions';
import {
  ENTITY_DESCRIPTION_MAX_LINES,
  EntityPageInlineDescription,
} from '~/partials/entity-page/entity-page-inline-description';
import { ENTITY_PAGE_CONTENT_MAX_WIDTH } from '~/partials/entity-page/entity-page-layout';
import { EntityTabs } from '~/partials/entity-page/entity-tabs';
import { META_CHIP_CLASS } from '~/partials/entity-page/relation-chip-section';
import { SPACE_TABS_ANCHOR } from '~/partials/space-page/space-tabs-anchor';

import { useTopicSpaceScope } from '../use-topic-space-scope';
import { TopicComposition } from './topic-composition';
import { TopicFeed } from './topic-feed';
import { limitTopicFeedSpaceIds } from './topic-feed-params';
import { useTopicAncestors } from './use-topic-ancestors';

/**
 * Shared with the cover/avatar header so its left edge stays aligned with the topic column.
 *
 * The *same* width an ordinary entity page gets, taken from its constant rather than restated, so
 * a topic cannot drift narrower than the page it replaces again. It was 720 against the entity
 * page's 900, which on a desktop read as a column squeezed for no reason a reader could see.
 *
 * The inset is the one difference and it stays: this view is also the side panel's and a phone's,
 * where content cannot run to the edge. It costs the text column 32–40px against a route-only
 * entity page, which is what keeps the avatar lined up with the name at every width — the header
 * applies the same pair.
 */
export const TOPIC_PAGE_CONTENT_MAX_WIDTH = ENTITY_PAGE_CONTENT_MAX_WIDTH;
export const TOPIC_PAGE_CONTENT_INSET_CLASS = 'px-4 @[560px]:px-5';

/** Every chip in the header row — types and the curated tag — reads the same. */
const TOPIC_META_CHIP_CLASS = `${META_CHIP_CLASS} text-grey-04`;

/**
 * `explore` is the landing tab — the topic feed — and is what an unqualified topic URL means.
 *
 * `blocks` is the entity's own block content, which a generic entity labels Overview and reaches
 * at its bare URL. A topic's bare URL is already spoken for, so the blocks are addressed the way
 * every other tab in the app is addressed: `?tabId=`, pointing at the entity itself.
 *
 * That is not a trick. `EditorBlocksProvider` already reads a tab id equal to the entity id as
 * "this entity's own blocks" — `isTab` requires `tabId !== entityId` — so the editor resolves
 * this URL to the root blocks, with the route's server snapshot, through the path it already had.
 *
 * It is also the only form that survives the entity ceasing to be a topic. A path segment needs a
 * route, the route needs a type guard, and the guard answers 404 the moment somebody drops the
 * Topic type while standing on it. A query parameter on the entity's own URL stays valid: the
 * generic entity page reads it, renders the same blocks, and the reader keeps their place.
 */
type TopicTab = 'explore' | 'blocks' | 'comments' | 'custom';

export function resolveTopicTab({
  entityId,
  pathname,
  authoredTabId,
  panel,
}: {
  /** The topic itself — as a tab id, it names the topic's own block content. */
  entityId: string;
  pathname: string;
  authoredTabId: string | null;
  panel: { activeTabId: string | null; activeSystemTab: string | null } | null;
}): TopicTab {
  if (panel) {
    if (panel.activeTabId) return ID.equals(panel.activeTabId, entityId) ? 'blocks' : 'custom';
    if (panel.activeSystemTab === 'comments') return 'comments';
    return 'explore';
  }

  if (authoredTabId) return ID.equals(authoredTabId, entityId) ? 'blocks' : 'custom';
  if (pathname.endsWith('/comments')) return 'comments';
  return 'explore';
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
 * Explore is a topic-scoped feed. It mixes Claims, Debates and coverage entities into one
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
  const { count: commentCount, isLoading: commentCountLoading } = useEntityCommentCount(entityId);
  const fullTopicSpaceIds = useTopicSpaceScope(spaceId);
  const topicSpaceIds = React.useMemo(
    () => limitTopicFeedSpaceIds(fullTopicSpaceIds, spaceId),
    [fullTopicSpaceIds, spaceId]
  );

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

  /*
   * Topic is drawn from the literal rather than from this list, so the word the page is named for
   * is there even before the type entity's name resolves. Everything else the entity is typed as
   * follows it — a topic that is also, say, a Project used to read as a plain Topic, and edit mode
   * showed types browse mode had no room for.
   *
   * Read off `relations`, not `entity.types`. `getEntity` derives `types` from every space's
   * relations and only afterwards narrows `relations` to the space being read, so `types` would
   * advertise a type some other space contributed — one the edit control, scoped like every other
   * types control in the app, can neither show nor take off. Same array and the same deleted guard
   * as `isCurated` above, through the same `readTypes` the store itself uses, so a chip means what
   * a chip means everywhere else.
   */
  const additionalTypes = React.useMemo(
    () =>
      readTypes((entity?.relations ?? []).filter(relation => relation.isDeleted !== true)).filter(
        type => !ID.equals(type.id, TOPIC_TYPE_ID)
      ),
    [entity?.relations]
  );

  // The whole path down to this topic, not just the rung above it — a topic can sit several levels
  // deep, and showing one parent reads as though the hierarchy is flat.
  const ancestors = useTopicAncestors(entityId, spaceId);
  const activeTab = resolveTopicTab({
    entityId,
    pathname,
    authoredTabId: activeAuthoredTabId,
    panel: sidePanelTab,
  });
  const overviewHref = NavUtils.toEntity(spaceId, entityId);

  /*
   * Whether the topic has block content of its own — the thing a generic entity shows on its
   * Overview tab, and which a topic page had no tab for at all, so anything written into a topic's
   * body was unreachable (and unwritable) from the topic view.
   *
   * Same selector *and* the same server snapshot the editor itself runs on, so the tab appears
   * exactly when the editor would have something to draw rather than on a second, drifting
   * definition of "empty". The snapshot is the half that is easy to miss: `useBlocks` without it
   * reads only the reactive store, which on a client-side navigation holds the entity's name long
   * before it holds its relations — so a topic that plainly has a body lost its tab until
   * `useHydrateEntity` settled, and kept losing it if that read failed. `EntityTabs`, just below,
   * merges its own `initialTabRelations` for the same reason.
   *
   * Guarded on the id because the provider belongs to whatever entity the route or panel opened
   * on. That is this topic on every path that renders this view, and a snapshot read for a
   * different one would advertise somebody else's body as this topic's.
   */
  const editor = useEditorInstance();
  const serverBlockRelations = ID.equals(editor.id, entityId) ? editor.initialBlockRelations : undefined;
  const hasBlocks = useBlocks(entityId, spaceId, serverBlockRelations).length > 0;

  /*
   * An editor gets the tab whether or not it has content yet — it is the only way to start a body —
   * and a reader only when there is a body to read.
   *
   * `isEditing` is edit *intent*, held through the access check to avoid hydration flicker, so it
   * is paired with `canEdit` here: until access resolves `EntityTabs` draws the *browse* bar, and
   * intent alone would put an Overview tab for an empty topic into it.
   *
   * And the tab stays for whoever is already on it. Both conditions above can go false underneath
   * a reader — an editor opens an empty Overview and leaves edit mode, or a link selects this
   * tab on a topic that never had a body — and hiding it there left `TopicTabPanel` still drawing
   * the editor under a row with nothing selected. Redirecting them to Explore instead would be
   * worse: `hasBlocks` reads false for a frame before the entity hydrates, so it would fire on a
   * legitimate visit and bounce the reader off the URL they asked for.
   */
  const canEdit = useCanUserEdit(spaceId);
  const showBlocksTab = hasBlocks || (isEditing && canEdit) || activeTab === 'blocks';

  const systemTabs = [
    { label: 'Explore', href: overviewHref, sidePanelKey: 'overview' },
    {
      label: 'Comments',
      href: `${overviewHref}/comments`,
      sidePanelKey: 'comments',
      badge: commentCountLoading ? undefined : String(commentCount),
    },
    // Sits on the authored side of the rule, at the head of the tabs this topic wrote for itself —
    // it is one of them, not one of the product's record tabs, and it is addressed like one. No
    // `sidePanelKey`: the panel selects it by tab id, which is what `StaticTab` falls back to, so
    // the route and the panel agree on one identifier instead of keeping a second name for it.
    ...(showBlocksTab
      ? [
          {
            label: 'Overview',
            href: `${overviewHref}?tabId=${entityId}`,
            dividerBefore: true,
          },
        ]
      : []),
  ];

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

          {/* The row an ordinary entity page draws under its description: what it is on the left,
              what you can do to it on the right. The topic view replaces that page, and had
              neither half — the left was a literal `Topic` span and the right was missing
              entirely, so a topic had no votes, no history and no overflow menu.

              Browse keeps the one word that says what this page is, now followed by whatever else
              the entity is typed as. Edit swaps it for the entity's real Types relations, with the
              same chips, the same X and the same `Find or create type...` picker every other
              entity gets — the only place a topic's types can be edited at all, since the
              edit-mode property sheet drops `Types` as a system property "editable elsewhere" and
              elsewhere is the generic metadata header this view replaces. Dropping Topic is
              allowed: the page re-routes to the generic editor on the next render, which is what
              an entity that is no longer a topic should look like. */}
          <div className="flex items-center gap-4 text-text">
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              {isEditing ? (
                <EditableRelationsGroup id={entityId} spaceId={spaceId} propertyId={SystemIds.TYPES_PROPERTY} />
              ) : (
                <>
                  <span className={TOPIC_META_CHIP_CLASS}>Topic</span>
                  {additionalTypes.map(type => (
                    <span key={type.id} className={TOPIC_META_CHIP_CLASS}>
                      {type.name ?? type.id}
                    </span>
                  ))}
                </>
              )}
              {isCurated && <span className={TOPIC_META_CHIP_CLASS}>Curated</span>}
            </div>
            <EntityPageActions entityId={entityId} spaceId={spaceId} isVoteable />
          </div>

          <TopicComposition topicId={entityId} spaceId={spaceId} spaceIds={topicSpaceIds} />
        </header>

        <div id={sidePanelTab ? undefined : SPACE_TABS_ANCHOR}>
          <EntityTabs
            entityId={entityId}
            spaceId={spaceId}
            initialTabRelations={initialTabRelations}
            tabEntities={tabEntities}
            systemTabsBefore={systemTabs}
            reservedSystemLabels={systemTabs.map(tab => tab.label)}
            // Overview already carries the rule when it is there. Two dividers, or one in front of
            // a tab that is on the same side of it, would say the row splits somewhere it does not.
            divideBeforeAuthored={!showBlocksTab}
          />
        </div>

        <TopicTabPanel activeTab={activeTab} entityId={entityId} spaceId={spaceId} topicSpaceIds={topicSpaceIds} />
        {footer}
      </div>
    </div>
  );
}

function TopicTabPanel({
  activeTab,
  entityId,
  spaceId,
  topicSpaceIds,
}: {
  activeTab: TopicTab;
  entityId: string;
  spaceId: string;
  topicSpaceIds: string[] | undefined;
}) {
  // An authored tab and the topic's own Overview are the same editor. Which entity's blocks it
  // draws is the editor provider's call, from the active tab id: `EditorBlocksProvider` treats a
  // tab id equal to its own entity id as *not a tab* — `isTab` requires `tabId !== entityId` — so
  // the Overview URL lands on the root blocks and an authored tab id lands on that tab's.
  if (activeTab === 'custom' || activeTab === 'blocks') return <Editor spaceId={spaceId} shouldHandleOwnSpacing />;
  if (activeTab === 'comments') {
    return <CommentSection entityId={entityId} spaceId={spaceId} targetEntityType="topic" variant="tab" />;
  }

  return <TopicFeed topicId={entityId} spaceId={spaceId} spaceIds={topicSpaceIds} />;
}
