'use client';

import * as React from 'react';

import { useSpace } from '~/core/hooks/use-space';
import { ID } from '~/core/id';
import { claimResponseTargetKey } from '~/core/responses/claim-response-summaries';
import { useClaimResponseSummaryBatch } from '~/core/responses/use-claim-response-summaries';
import { useQueryEntities, useQueryEntity } from '~/core/sync/use-store';
import type { Entity, Relation } from '~/core/types';
import { Entities } from '~/core/utils/entity';
import { resolveEntitySpaceId } from '~/core/utils/space/entity-home-space';
import { NavUtils } from '~/core/utils/utils';

import type {
  BreadcrumbItem,
  ClaimSummaryModel,
  ClaimTopicPillModel,
  EntityListSectionModel,
  NewsStoryClaimGroupModel,
  NewsStorySourceModel,
  NewsStoryTemplateModel,
  TemplateDataSource,
} from '../models';
import {
  TEMPLATE_ONTOLOGY,
  buildEntityContextMap,
  extractEntityFlags,
  extractGraphConnections,
  formatOntologyDate,
  outletColorFrom,
  outletInitialsFrom,
  publicationFromUrl,
  readEntityRelations,
  readEntityTextValue,
} from '../ontology';
import { useInitialHydrationGate } from './use-initial-hydration-gate';
import { useLiveEntityActions } from './use-live-entity-actions';
import { useTopicMediaBatch } from './use-topic-media-batch';

/**
 * Deduplicate ordered story section relations (`Blocks` / `Perspectives`) by `toEntity.id`,
 * preferring a row that carries a non-null `position` string (multi-space stories can emit both a
 * positioned row and a null-position duplicate), then sort by lexorank `position`.
 */
function dedupeAndOrderSectionRelations(relations: readonly Relation[]): Relation[] {
  const byTarget = new Map<string, Relation>();
  for (const rel of relations) {
    if (rel.isDeleted) continue;
    const key = ID.uuidToHex(rel.toEntity.id);
    const existing = byTarget.get(key);
    if (!existing) {
      byTarget.set(key, rel);
    } else if (!existing.position && rel.position) {
      byTarget.set(key, rel);
    }
  }
  return Array.from(byTarget.values()).sort((a, b) => (a.position ?? '\uffff').localeCompare(b.position ?? '\uffff'));
}

/**
 * Live Geo adapter for `NewsStoryTemplate` (`ContentIds.NEWS_STORY_TYPE`).
 *
 * Mirrors Geo News's live story structure:
 * - Ordered narrative `Blocks` (`Collection item` -> Claim) and `Perspectives` (relation entity or
 *   target `Notable claims` -> Claim) hydrated into scannable bulleted `claimGroups`.
 * - Top-level `Notable claims` + `Related claims` when no blocks/perspectives exist.
 * - Hydrated `Sources` with `Publisher` (or URL domain fallback), `Publish datetime`, and `Web URL`.
 * - `Associated timelines`, `Related stories`, `Topics`, `Summary`, `Cover`, `Context`, `Flags`,
 *   live batch vote summaries on claims, and live `useMutate` actions.
 */
export function useLiveNewsStoryTemplate({
  entityId,
  spaceId,
  serverCoverUrl,
}: {
  entityId: string;
  spaceId: string;
  serverCoverUrl?: string | null;
}): TemplateDataSource<NewsStoryTemplateModel> {
  const { entity, isLoading } = useQueryEntity({ id: entityId, spaceId });
  const { space } = useSpace(spaceId);

  // Ordered narrative Blocks + Perspectives relations from this NewsStory
  const sectionRelations = React.useMemo(() => {
    if (!entity) return [];
    const matching = entity.relations.filter(
      rel =>
        rel.isDeleted !== true &&
        (ID.equals(rel.type.id, TEMPLATE_ONTOLOGY.BLOCKS_PROPERTY_ID) ||
          ID.equals(rel.type.id, TEMPLATE_ONTOLOGY.PERSPECTIVES_PROPERTY_ID))
    );
    return dedupeAndOrderSectionRelations(matching);
  }, [entity]);

  // Source relations to batch-hydrate for Publisher, Publish datetime, Cover, Summary, and Web URL
  const sourceRelations = React.useMemo(
    () => readEntityRelations(entity, TEMPLATE_ONTOLOGY.SOURCES_PROPERTY_ID),
    [entity]
  );

  const dedupeRelations = React.useCallback((raw: readonly Relation[]): Relation[] => {
    const seen = new Set<string>();
    const out: Relation[] = [];
    for (const rel of raw) {
      const hex = ID.uuidToHex(rel.toEntity.id);
      if (seen.has(hex)) continue;
      seen.add(hex);
      out.push(rel);
    }
    return out;
  }, []);

  // Deduplicated side-rail relations (Topics, People involved, Related projects, Related entities, Timelines)
  const topicRelations = React.useMemo(
    () => dedupeRelations(readEntityRelations(entity, TEMPLATE_ONTOLOGY.TOPICS_PROPERTY_ID)),
    [dedupeRelations, entity]
  );
  const peopleRelations = React.useMemo(
    () => dedupeRelations(readEntityRelations(entity, TEMPLATE_ONTOLOGY.RELATED_PEOPLE_PROPERTY_ID)),
    [dedupeRelations, entity]
  );
  const projectRelations = React.useMemo(
    () => dedupeRelations(readEntityRelations(entity, TEMPLATE_ONTOLOGY.RELATED_PROJECTS_PROPERTY_ID)),
    [dedupeRelations, entity]
  );
  const relatedEntityRelations = React.useMemo(
    () =>
      dedupeRelations(
        readEntityRelations(entity, [
          TEMPLATE_ONTOLOGY.RELATED_ENTITIES_PROPERTY_ID,
          TEMPLATE_ONTOLOGY.HIGHLIGHTED_RELATED_ENTITIES_PROPERTY_ID,
        ])
      ),
    [dedupeRelations, entity]
  );
  const timelineRelations = React.useMemo(
    () => dedupeRelations(readEntityRelations(entity, TEMPLATE_ONTOLOGY.ASSOCIATED_TIMELINES_PROPERTY_ID)),
    [dedupeRelations, entity]
  );

  // Batch-hydrate circular Avatar/Cover thumbnails for ALL side-rail pills & timeline cards in one query
  const railMediaIds = React.useMemo(
    () => [
      ...peopleRelations.map(rel => rel.toEntity.id),
      ...projectRelations.map(rel => rel.toEntity.id),
      ...relatedEntityRelations.map(rel => rel.toEntity.id),
      ...timelineRelations.map(rel => rel.toEntity.id),
      ...topicRelations.map(rel => rel.toEntity.id),
    ],
    [peopleRelations, projectRelations, relatedEntityRelations, timelineRelations, topicRelations]
  );
  const topicMediaQuery = useTopicMediaBatch(railMediaIds);

  // Collect all sub-entity IDs we need to hydrate in ONE batched query:
  // - Block toEntity IDs (for Collection items)
  // - Perspective relation entityId + toEntity IDs (for Notable claims)
  // - Source toEntity IDs (for Publisher, Publish datetime, Web URL)
  const hydrationIds = React.useMemo(() => {
    const seen = new Set<string>();
    const ids: string[] = [];
    const push = (id: string | null | undefined) => {
      if (!id) return;
      const hex = ID.uuidToHex(id);
      if (seen.has(hex)) return;
      seen.add(hex);
      ids.push(id);
    };

    for (const rel of sectionRelations) {
      push(rel.toEntity.id);
      if (ID.equals(rel.type.id, TEMPLATE_ONTOLOGY.PERSPECTIVES_PROPERTY_ID)) {
        push(rel.entityId);
      }
    }
    for (const rel of sourceRelations) {
      push(rel.toEntity.id);
    }
    return ids;
  }, [sectionRelations, sourceRelations]);

  const hydrationWhere = React.useMemo(() => ({ id: { in: hydrationIds } }), [hydrationIds]);
  const { entities: hydratedEntities, isLoading: isHydratingEntities } = useQueryEntities({
    where: hydrationWhere,
    first: Math.max(hydrationIds.length, 1),
    enabled: hydrationIds.length > 0,
  });

  const hydratedById = React.useMemo(() => {
    const map = new Map<string, Entity>();
    for (const item of hydratedEntities) {
      map.set(ID.uuidToHex(item.id), item);
    }
    return map;
  }, [hydratedEntities]);

  const flatClaimRelations = React.useMemo(
    () =>
      readEntityRelations(entity, [
        TEMPLATE_ONTOLOGY.NOTABLE_CLAIMS_PROPERTY_ID,
        TEMPLATE_ONTOLOGY.RELATED_CLAIMS_PROPERTY_ID,
      ]),
    [entity]
  );

  // Resolve claim groups from hydrated Blocks (Collection item) and Perspectives (Notable claims)
  const rawClaimGroups = React.useMemo(() => {
    const groups: {
      id: string;
      title: string;
      description?: string;
      claims: { id: string; title: string; spaceId: string }[];
    }[] = [];

    for (const rel of sectionRelations) {
      const isBlock = ID.equals(rel.type.id, TEMPLATE_ONTOLOGY.BLOCKS_PROPERTY_ID);
      const targetEntity = hydratedById.get(ID.uuidToHex(rel.toEntity.id));

      if (isBlock) {
        const items = readEntityRelations(targetEntity, TEMPLATE_ONTOLOGY.COLLECTION_ITEM_PROPERTY_ID).filter(r =>
          Boolean(r.toEntity.name?.trim())
        );
        if (items.length === 0) continue;
        groups.push({
          id: rel.toEntity.id,
          title: targetEntity?.name?.trim() || rel.toEntity.name?.trim() || 'Claims',
          description: targetEntity?.description ?? undefined,
          claims: items.map(item => ({
            id: item.toEntity.id,
            title: item.toEntity.name!.trim(),
            spaceId: item.toSpaceId ?? spaceId,
          })),
        });
      } else {
        // Perspective: check relation entity first, then legacy standalone Perspective entity
        const relEntity = rel.entityId ? hydratedById.get(ID.uuidToHex(rel.entityId)) : undefined;
        let perspClaims = readEntityRelations(relEntity, TEMPLATE_ONTOLOGY.NOTABLE_CLAIMS_PROPERTY_ID).filter(r =>
          Boolean(r.toEntity.name?.trim())
        );
        if (perspClaims.length === 0) {
          perspClaims = readEntityRelations(targetEntity, TEMPLATE_ONTOLOGY.NOTABLE_CLAIMS_PROPERTY_ID).filter(r =>
            Boolean(r.toEntity.name?.trim())
          );
        }
        if (perspClaims.length === 0) continue;
        groups.push({
          id: rel.entityId ?? rel.toEntity.id,
          title: rel.toEntity.name?.trim() || targetEntity?.name?.trim() || 'Perspective',
          claims: perspClaims.map(item => ({
            id: item.toEntity.id,
            title: item.toEntity.name!.trim(),
            spaceId: item.toSpaceId ?? spaceId,
          })),
        });
      }
    }

    return groups;
  }, [hydratedById, sectionRelations, spaceId]);

  // Batch-fetch live vote counts for ALL claims displayed in this story (grouped + flat)
  const claimBatchTargets = React.useMemo(() => {
    const seen = new Set<string>();
    const targets: { entityId: string; responseKind: 'stance' }[] = [];
    const add = (id: string) => {
      const hex = ID.uuidToHex(id);
      if (seen.has(hex)) return;
      seen.add(hex);
      targets.push({ entityId: id, responseKind: 'stance' });
    };
    for (const group of rawClaimGroups) {
      for (const claim of group.claims) add(claim.id);
    }
    for (const rel of flatClaimRelations) add(rel.toEntity.id);
    return targets;
  }, [flatClaimRelations, rawClaimGroups]);

  const responseBatch = useClaimResponseSummaryBatch({
    spaceId,
    targets: claimBatchTargets,
    enabled: claimBatchTargets.length > 0,
  });

  const actionCallbacks = useLiveEntityActions({
    entityId,
    entityName: entity?.name ?? entityId,
    spaceId,
    entity,
    ownerKind: 'news-story',
  });

  const model = React.useMemo<NewsStoryTemplateModel | null>(() => {
    if (!entity) return null;

    const headline = entity.name ?? entity.id;
    const spaceLabel = space?.entity?.name?.trim() || 'Everyone';
    const publishers = readEntityRelations(entity, TEMPLATE_ONTOLOGY.PUBLISHER_PROPERTY_ID);
    const authors = readEntityRelations(entity, TEMPLATE_ONTOLOGY.AUTHORS_PROPERTY_ID)
      .map(rel => rel.toEntity.name)
      .filter((name): name is string => Boolean(name));
    const explicitOutlet = publishers[0]?.toEntity.name?.trim() || undefined;
    const date = formatOntologyDate(readEntityTextValue(entity, TEMPLATE_ONTOLOGY.PUBLISH_DATE_PROPERTY_ID));
    const externalUrl = readEntityTextValue(entity, TEMPLATE_ONTOLOGY.WEB_URL_PROPERTY_ID) ?? undefined;
    const archiveUrl = readEntityTextValue(entity, TEMPLATE_ONTOLOGY.WEB_ARCHIVE_URL_PROPERTY_ID) ?? undefined;
    const summary =
      readEntityTextValue(entity, TEMPLATE_ONTOLOGY.SUMMARY_PROPERTY_ID) ?? entity.description ?? undefined;

    const relatedStories = readEntityRelations(entity, TEMPLATE_ONTOLOGY.RELATED_STORIES_PROPERTY_ID);

    const firstTopic = topicRelations[0];
    const breadcrumbs: BreadcrumbItem[] | undefined = firstTopic
      ? [
          {
            id: firstTopic.toEntity.id,
            label: firstTopic.toEntity.name ?? firstTopic.toEntity.id,
            href: NavUtils.toEntity(firstTopic.toSpaceId ?? spaceId, firstTopic.toEntity.id),
          },
          { id: entity.id, label: headline },
        ]
      : undefined;

    const buildClaimSummary = (claim: { id: string; title: string; spaceId: string }): ClaimSummaryModel => {
      const batch = responseBatch.data?.get(claimResponseTargetKey({ entityId: claim.id, responseKind: 'stance' }));
      const pos = batch?.counts.positive ?? 0;
      const neg = batch?.counts.negative ?? 0;
      const total = pos + neg;
      const pct = total > 0 ? Math.round((pos / total) * 100) : undefined;
      const isAccepted = total >= 2 && pct !== undefined && (pct >= 75 || pct <= 25);

      return {
        id: claim.id,
        title: claim.title,
        overallPercent: pct,
        meta: total > 0 ? [`${total.toLocaleString('en-US')} ${total === 1 ? 'vote' : 'votes'}`] : undefined,
        split: {
          rows:
            total > 0 && pct !== undefined
              ? [
                  {
                    id: spaceId,
                    label: spaceLabel,
                    color: '#202020',
                    percent: pct,
                    voterCount: total,
                    isEveryone: true,
                  },
                ]
              : [],
          isSplit: !isAccepted,
          totalVotes: total > 0 ? total : undefined,
        },
        href: NavUtils.toEntity(claim.spaceId, claim.id),
      };
    };

    const claimGroups: NewsStoryClaimGroupModel[] = rawClaimGroups.map(group => ({
      id: group.id,
      title: group.title,
      description: group.description,
      claims: group.claims.map(buildClaimSummary),
    }));

    const reportedClaims: ClaimSummaryModel[] = flatClaimRelations
      .filter(rel => Boolean(rel.toEntity.name))
      .map(rel =>
        buildClaimSummary({
          id: rel.toEntity.id,
          title: rel.toEntity.name!,
          spaceId: rel.toSpaceId ?? spaceId,
        })
      );

    // Rich aggregated Sources hydrated with Publisher (or URL domain), Publish datetime, Cover, Excerpt, and Web URL
    const sources: NewsStorySourceModel[] = sourceRelations.map(rel => {
      const hydrated = hydratedById.get(ID.uuidToHex(rel.toEntity.id));
      const url = readEntityTextValue(hydrated, TEMPLATE_ONTOLOGY.WEB_URL_PROPERTY_ID) ?? undefined;
      const srcPublisher =
        readEntityRelations(hydrated, TEMPLATE_ONTOLOGY.PUBLISHER_PROPERTY_ID)[0]?.toEntity.name?.trim() ??
        publicationFromUrl(url);
      const srcDate = formatOntologyDate(readEntityTextValue(hydrated, TEMPLATE_ONTOLOGY.PUBLISH_DATE_PROPERTY_ID));
      const srcExcerpt =
        readEntityTextValue(hydrated, TEMPLATE_ONTOLOGY.SUMMARY_PROPERTY_ID) ?? hydrated?.description ?? undefined;
      const srcThumb = hydrated ? (Entities.cover(hydrated.relations) ?? Entities.avatar(hydrated.relations)) : null;
      const targetSpace = hydrated
        ? resolveEntitySpaceId(hydrated, rel.toSpaceId ?? spaceId)
        : (rel.toSpaceId ?? spaceId);

      return {
        id: rel.toEntity.id,
        title: hydrated?.name?.trim() || rel.toEntity.name?.trim() || rel.toEntity.id,
        publication: srcPublisher,
        date: srcDate,
        url,
        excerpt: srcExcerpt,
        thumbnailUrl: srcThumb,
        href: NavUtils.toEntity(targetSpace, rel.toEntity.id),
      };
    });

    // Side-rail avatar pills (Topics, People involved, Related projects, Related entities)
    const mediaByHex = topicMediaQuery.data;
    const toAvatarPills = (rels: readonly Relation[]): ClaimTopicPillModel[] =>
      rels
        .filter(rel => Boolean(rel.toEntity.name?.trim()))
        .map(rel => {
          const hex = ID.uuidToHex(rel.toEntity.id);
          return {
            id: rel.toEntity.id,
            label: rel.toEntity.name!.trim(),
            imageUrl: mediaByHex?.get(hex) ?? null,
            href: NavUtils.toEntity(rel.toSpaceId ?? spaceId, rel.toEntity.id),
          };
        });

    const topics = toAvatarPills(topicRelations);
    const relatedPeople = toAvatarPills(peopleRelations);
    const relatedProjects = toAvatarPills(projectRelations);
    const relatedEntities = toAvatarPills(relatedEntityRelations);

    const associatedTimelines = timelineRelations
      .filter(rel => Boolean(rel.toEntity.name?.trim()))
      .map(rel => ({
        id: rel.toEntity.id,
        title: rel.toEntity.name!.trim(),
        coverUrl: mediaByHex?.get(ID.uuidToHex(rel.toEntity.id)) ?? null,
        href: NavUtils.toEntity(rel.toSpaceId ?? spaceId, rel.toEntity.id),
      }));

    const sections: EntityListSectionModel[] = [];

    if (relatedStories.length > 0) {
      sections.push({
        id: 'related-stories',
        title: 'Related stories',
        items: relatedStories
          .filter(rel => !ID.equals(rel.toEntity.id, entity.id))
          .map(rel => ({
            id: rel.toEntity.id,
            kind: 'news-story',
            kindLabel: 'News story',
            title: rel.toEntity.name ?? rel.toEntity.id,
            href: NavUtils.toEntity(rel.toSpaceId ?? spaceId, rel.toEntity.id),
          })),
      });
    }

    const graphConnections = extractGraphConnections(entity, spaceId, [
      TEMPLATE_ONTOLOGY.NOTABLE_CLAIMS_PROPERTY_ID,
      TEMPLATE_ONTOLOGY.RELATED_CLAIMS_PROPERTY_ID,
      TEMPLATE_ONTOLOGY.SOURCES_PROPERTY_ID,
      TEMPLATE_ONTOLOGY.RELATED_STORIES_PROPERTY_ID,
      TEMPLATE_ONTOLOGY.TOPICS_PROPERTY_ID,
      TEMPLATE_ONTOLOGY.RELATED_PEOPLE_PROPERTY_ID,
      TEMPLATE_ONTOLOGY.RELATED_PROJECTS_PROPERTY_ID,
      TEMPLATE_ONTOLOGY.RELATED_ENTITIES_PROPERTY_ID,
      TEMPLATE_ONTOLOGY.HIGHLIGHTED_RELATED_ENTITIES_PROPERTY_ID,
      TEMPLATE_ONTOLOGY.PUBLISHER_PROPERTY_ID,
      TEMPLATE_ONTOLOGY.AUTHORS_PROPERTY_ID,
      TEMPLATE_ONTOLOGY.PERSPECTIVES_PROPERTY_ID,
      TEMPLATE_ONTOLOGY.ASSOCIATED_TIMELINES_PROPERTY_ID,
    ]);
    const flags = extractEntityFlags(entity, spaceId);

    return {
      id: entity.id,
      headline,
      outlet: explicitOutlet,
      outletInitials: explicitOutlet ? outletInitialsFrom(explicitOutlet) : undefined,
      outletColor: explicitOutlet ? outletColorFrom(explicitOutlet) : undefined,
      authors: authors.length > 0 ? authors : undefined,
      date,
      summary,
      coverUrl: Entities.cover(entity.relations) ?? serverCoverUrl ?? null,
      externalUrl,
      archiveUrl,
      breadcrumbs,
      associatedTimelines: associatedTimelines.length > 0 ? associatedTimelines : undefined,
      topics: topics.length > 0 ? topics : undefined,
      relatedPeople: relatedPeople.length > 0 ? relatedPeople : undefined,
      relatedProjects: relatedProjects.length > 0 ? relatedProjects : undefined,
      relatedEntities: relatedEntities.length > 0 ? relatedEntities : undefined,
      claimGroups: claimGroups.length > 0 ? claimGroups : undefined,
      sources: sources.length > 0 ? sources : undefined,
      graphConnections: graphConnections.length > 0 ? graphConnections : undefined,
      contextByEntityId: buildEntityContextMap(entity.id, flags),
      reportedClaims,
      sections,
    };
  }, [
    entity,
    flatClaimRelations,
    hydratedById,
    peopleRelations,
    projectRelations,
    rawClaimGroups,
    relatedEntityRelations,
    responseBatch.data,
    serverCoverUrl,
    sourceRelations,
    space?.entity?.name,
    spaceId,
    timelineRelations,
    topicMediaQuery.data,
    topicRelations,
  ]);

  const isSectionsLoading = useInitialHydrationGate(
    hydrationIds.length > 0 && isHydratingEntities,
    `${ID.uuidToHex(entityId)}:${ID.uuidToHex(spaceId)}`
  );

  return {
    data: model,
    isLoading: isLoading && !entity,
    isSectionsLoading,
    source: 'live',
    actionCallbacks,
  };
}
