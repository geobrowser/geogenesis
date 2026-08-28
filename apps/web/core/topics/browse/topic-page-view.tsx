'use client';

import * as React from 'react';

import { TOPICS_PROPERTY_ID } from '~/core/claims/ontology';
import { CURATED_TOPIC_TAG_ID, SUBTOPIC_RELATION_TYPE_ID, TAG_PROPERTY_ID } from '~/core/constants';
import { ID } from '~/core/id';
import { useQueryEntity } from '~/core/sync/use-store';
import type { Relation } from '~/core/types';
import { NavUtils } from '~/core/utils/utils';

import { PrefetchLink as Link } from '~/design-system/prefetch-link';
import { Skeleton } from '~/design-system/skeleton';
import { Text } from '~/design-system/text';

import { CommentSection } from '~/partials/comments/comments-section';

import { UNNAMED_SUBTOPIC_PROPERTY_ID } from '../ontology';
import { TopicClaims } from './topic-claims';
import { TopicComposition } from './topic-composition';
import { TopicCoverage } from './topic-coverage';
import { TopicDebates } from './topic-debates';
import { useTopicAncestors } from './use-topic-ancestors';

/** Subtopic chips shown before the rest collapse into a count. */
const SUBTOPIC_CHIP_CAP = 8;

const META_CHIP_CLASS = 'flex h-6 max-w-full items-center rounded border border-grey-02 bg-white px-1.5 text-metadata';

/**
 * The browse-mode read view for a Topic.
 *
 * A topic is the graph's aggregation point: claims, episodes, news, tweets and documents all name
 * one, and the generic entity page shows that as undifferentiated backlinks. This orders it.
 *
 * Deliberately *not* space-scoped, unlike the claim page. A claim's responses belong to a space and
 * mixing two would report a population that belongs to neither; a topic's value is the opposite —
 * it gathers across spaces, and scoping it to the space in the route would empty most of the page.
 * Each row is linked into the space it actually lives in.
 *
 * One column at every width, laid out against a container query rather than the viewport, so the
 * route, the entity side panel and a phone are three widths of one page. Same as the claim page.
 *
 * Sections render only when they have something to show, and the order is fixed — the composition
 * strip carries the variation between topics instead, so every topic is structurally the same page.
 */
export function TopicPageView({ entityId, spaceId }: { entityId: string; spaceId: string }) {
  const { entity, isLoading } = useQueryEntity({ id: entityId, spaceId });

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
                    href={NavUtils.toEntity(ancestor.spaces[0] ?? spaceId, ancestor.id)}
                    className="text-metadata text-grey-04 transition-colors hover:text-text"
                  >
                    {ancestor.name ?? ancestor.id}
                  </Link>
                </React.Fragment>
              ))}
            </nav>
          )}

          <h1 className="text-[1.5rem] leading-[1.3] font-semibold tracking-[-0.4px] text-pretty text-text @[560px]:text-[1.75rem]">
            {entity.name ?? entity.id}
          </h1>

          {entity.description && (
            <Text as="p" variant="body" color="grey-04">
              {entity.description}
            </Text>
          )}

          <div className="flex flex-wrap items-center gap-1.5">
            <span className={`${META_CHIP_CLASS} text-grey-04`}>Topic</span>
            {isCurated && <span className={`${META_CHIP_CLASS} text-grey-04`}>Curated</span>}
          </div>
        </header>

        <TopicComposition topicId={entityId} spaceId={spaceId} />

        <TopicSubtopics subtopics={subtopics} spaceId={spaceId} />

        <TopicDebates topicId={entityId} spaceId={spaceId} />

        <TopicClaims topicId={entityId} spaceId={spaceId} />

        <TopicCoverage topicId={entityId} spaceId={spaceId} />

        <CommentSection entityId={entityId} spaceId={spaceId} />
      </div>
    </div>
  );
}

/**
 * Where to go next, high on the page.
 *
 * Chips rather than cards: a topic with fourteen subtopics should cost a line or two, not a screen.
 * Placed directly under the header because on a broad topic the most useful thing a reader can do is
 * narrow — and on a thin one, this is the section that still has something to offer.
 */
function TopicSubtopics({ subtopics, spaceId }: { subtopics: Relation[]; spaceId: string }) {
  const [expanded, setExpanded] = React.useState(false);

  if (subtopics.length === 0) return null;

  const visible = expanded ? subtopics : subtopics.slice(0, SUBTOPIC_CHIP_CAP);
  const hidden = subtopics.length - visible.length;

  return (
    <section aria-label="Subtopics">
      <Text as="h2" variant="mediumTitle" color="text" className="mb-3 block">
        Subtopics
      </Text>
      <div className="flex flex-wrap gap-1.5">
        {visible.map(relation => (
          <Link
            key={relation.id}
            href={NavUtils.toEntity(spaceId, relation.toEntity.id)}
            className={`${META_CHIP_CLASS} text-text transition-colors hover:border-text`}
          >
            <span className="truncate">{relation.toEntity.name ?? relation.toEntity.id}</span>
          </Link>
        ))}
        {hidden > 0 && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className={`${META_CHIP_CLASS} text-grey-04 tabular-nums transition-colors hover:border-text hover:text-text`}
          >
            +{hidden}
          </button>
        )}
      </div>
    </section>
  );
}
