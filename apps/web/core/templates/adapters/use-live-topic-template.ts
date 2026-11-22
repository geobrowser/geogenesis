'use client';

import * as React from 'react';

import { CLAIM_TYPE_ID } from '~/core/claims/ontology';
import { CURATED_TOPIC_TAG_ID, NEWS_STORY_TYPE_ID, TAG_PROPERTY_ID, TOPIC_TYPE_ID } from '~/core/constants';
import { useSpace } from '~/core/hooks/use-space';
import { ID } from '~/core/id';
import { claimResponseTargetKey } from '~/core/responses/claim-response-summaries';
import { useClaimResponseSummaryBatch } from '~/core/responses/use-claim-response-summaries';
import { useQueryEntity } from '~/core/sync/use-store';
import { useTopicAncestors } from '~/core/topics/browse/use-topic-ancestors';
import { useTopicConnectionCounts } from '~/core/topics/browse/use-topic-connection-counts';
import { useTopicCoverage } from '~/core/topics/browse/use-topic-coverage';
import { useTopicLinkedEntities } from '~/core/topics/browse/use-topic-linked-entities';
import { useTopicSpaceScope } from '~/core/topics/use-topic-space-scope';
import { Entities } from '~/core/utils/entity';
import { resolveEntitySpaceId } from '~/core/utils/space/entity-home-space';
import { NavUtils } from '~/core/utils/utils';

import type {
  BreadcrumbItem,
  ClaimSummaryModel,
  EntityLinkKind,
  EntityLinkRowModel,
  EntityListSectionModel,
  TemplateDataSource,
  TopicStatModel,
  TopicTemplateModel,
  TopicTimelineHighlightModel,
} from '../models';
import {
  TEMPLATE_ONTOLOGY,
  buildEntityContextMap,
  extractEntityFlags,
  extractGraphConnections,
  formatOntologyDate,
  readClaimKind,
  readEntityRelations,
  readEntityTextValue,
} from '../ontology';
import { useLiveEntityActions } from './use-live-entity-actions';

const LIVE_CLAIMS_LIMIT = 20;
const LIVE_COVERAGE_LIMIT = 12;

function classifyCoverageKind(
  typeIds: readonly string[],
  typeName: string | null
): { kind: EntityLinkKind; label: string } {
  if (typeIds.some(id => ID.equals(id, NEWS_STORY_TYPE_ID))) {
    return { kind: 'news-story', label: typeName ?? 'News' };
  }
  if (
    typeIds.some(id => ID.equals(id, TEMPLATE_ONTOLOGY.TWEET_TYPE_ID) || ID.equals(id, TEMPLATE_ONTOLOGY.POST_TYPE_ID))
  ) {
    return { kind: 'post', label: typeName ?? 'Post' };
  }
  return { kind: 'source', label: typeName ?? 'Source' };
}

/**
 * Live Geo adapter for `TopicTemplate`.
 *
 * Maps live graph queries (topic entity, space metadata, ancestors, subtopics, connection counts,
 * linked claims + real vote splits, linked events, coverage + direct stories, Context relations,
 * and Community note / Disclaimer flags) onto `TopicTemplateModel`.
 */
export function useLiveTopicTemplate({
  entityId,
  spaceId,
  serverCoverUrl,
}: {
  entityId: string;
  spaceId: string;
  serverCoverUrl?: string | null;
}): TemplateDataSource<TopicTemplateModel> {
  const { entity, isLoading: isEntityLoading } = useQueryEntity({ id: entityId, spaceId });
  const { space } = useSpace(spaceId);
  const spaceIds = useTopicSpaceScope(spaceId);
  const ancestors = useTopicAncestors(entityId, spaceId);
  const { countsByTopicId } = useTopicConnectionCounts([entityId]);

  const { entities: linkedClaims } = useTopicLinkedEntities({
    topicId: entityId,
    typeIds: [CLAIM_TYPE_ID],
    first: LIVE_CLAIMS_LIMIT,
    rankInSpaceId: spaceId,
    spaceIds,
  });

  const directClaimRels = React.useMemo(
    () => readEntityRelations(entity, TEMPLATE_ONTOLOGY.TOPIC_CLAIMS_PROPERTY_ID),
    [entity]
  );

  const claimBatchTargets = React.useMemo(() => {
    const ids = new Set<string>();
    const targets: { entityId: string; responseKind: 'stance' }[] = [];
    for (const claim of linkedClaims) {
      ids.add(ID.uuidToHex(claim.id));
      targets.push({ entityId: claim.id, responseKind: 'stance' });
    }
    for (const rel of directClaimRels) {
      const hex = ID.uuidToHex(rel.toEntity.id);
      if (ids.has(hex)) continue;
      ids.add(hex);
      targets.push({ entityId: rel.toEntity.id, responseKind: 'stance' });
    }
    return targets;
  }, [directClaimRels, linkedClaims]);

  const responseBatch = useClaimResponseSummaryBatch({
    spaceId,
    targets: claimBatchTargets,
    enabled: claimBatchTargets.length > 0,
  });

  const { entities: linkedEvents } = useTopicLinkedEntities({
    topicId: entityId,
    typeIds: [TEMPLATE_ONTOLOGY.NEWS_EVENT_TYPE_ID],
    first: 8,
    spaceIds,
  });

  const coverage = useTopicCoverage({
    topicId: entityId,
    spaceIds,
    first: LIVE_COVERAGE_LIMIT,
  });

  const actionCallbacks = useLiveEntityActions({
    entityId,
    entityName: entity?.name ?? entityId,
    spaceId,
    entity,
    ownerKind: 'topic',
  });

  const model = React.useMemo<TopicTemplateModel | null>(() => {
    if (!entity) return null;

    const spaceLabel = space?.entity?.name?.trim() || 'Everyone';
    const isCurated = entity.relations.some(
      relation =>
        relation.isDeleted !== true &&
        ID.equals(relation.type.id, TAG_PROPERTY_ID) &&
        ID.equals(relation.toEntity.id, CURATED_TOPIC_TAG_ID)
    );

    const breadcrumbs: BreadcrumbItem[] = [
      ...ancestors.map(ancestor => ({
        id: ancestor.id,
        label: ancestor.name ?? ancestor.id,
        href: NavUtils.toEntity(resolveEntitySpaceId(ancestor, spaceId), ancestor.id),
      })),
      ...(ancestors.length > 0 ? [{ id: entity.id, label: entity.name ?? entity.id }] : []),
    ];

    const counts = countsByTopicId?.[entityId];
    const stats: TopicStatModel[] = counts
      ? [
          ...(counts.claims > 0 ? [{ label: 'Claims', value: counts.claims.toLocaleString('en-US') }] : []),
          ...(counts.debates > 0 ? [{ label: 'Debates', value: counts.debates.toLocaleString('en-US') }] : []),
          ...(counts.news > 0 ? [{ label: 'News stories', value: counts.news.toLocaleString('en-US') }] : []),
        ]
      : [];

    const contestedClaims: ClaimSummaryModel[] = [];
    const agreedClaims: ClaimSummaryModel[] = [];
    const seenClaimIds = new Set<string>();

    const pushClaimSummary = (claim: {
      id: string;
      name: string;
      kind?: ClaimSummaryModel['kind'];
      claimSpaceId: string;
    }) => {
      const hex = ID.uuidToHex(claim.id);
      if (seenClaimIds.has(hex)) return;
      seenClaimIds.add(hex);

      const batchSummary = responseBatch.data?.get(
        claimResponseTargetKey({ entityId: claim.id, responseKind: 'stance' })
      );
      const positive = batchSummary?.counts.positive ?? 0;
      const negative = batchSummary?.counts.negative ?? 0;
      const total = positive + negative;
      const percent = total > 0 ? Math.round((positive / total) * 100) : undefined;
      const viewerVote =
        batchSummary?.viewerResponse === 'positive'
          ? 'agree'
          : batchSummary?.viewerResponse === 'negative'
            ? 'disagree'
            : null;
      const isAccepted = total >= 2 && percent !== undefined && (percent >= 75 || percent <= 25);

      const summary: ClaimSummaryModel = {
        id: claim.id,
        title: claim.name,
        kind: claim.kind,
        overallPercent: percent,
        userVote: viewerVote,
        meta: total > 0 ? [`${total.toLocaleString('en-US')} ${total === 1 ? 'vote' : 'votes'}`] : undefined,
        split: {
          rows:
            total > 0 && percent !== undefined
              ? [
                  {
                    id: spaceId,
                    label: spaceLabel,
                    color: '#202020',
                    percent,
                    voterCount: total,
                    isEveryone: true,
                    userLabel: viewerVote ? `You: ${viewerVote === 'agree' ? 'Agree' : 'Disagree'}` : undefined,
                  },
                ]
              : [],
          isSplit: !isAccepted,
          totalVotes: total > 0 ? total : undefined,
        },
        href: NavUtils.toEntity(claim.claimSpaceId, claim.id),
      };

      if (isAccepted) {
        agreedClaims.push(summary);
      } else {
        contestedClaims.push(summary);
      }
    };

    for (const claim of linkedClaims) {
      if (!claim.name) continue;
      pushClaimSummary({
        id: claim.id,
        name: claim.name,
        kind: readClaimKind(claim.values),
        claimSpaceId: resolveEntitySpaceId(claim, spaceId),
      });
    }

    for (const rel of directClaimRels) {
      if (!rel.toEntity.name) continue;
      pushClaimSummary({
        id: rel.toEntity.id,
        name: rel.toEntity.name,
        claimSpaceId: rel.toSpaceId ?? spaceId,
      });
    }

    const directStories = readEntityRelations(entity, TEMPLATE_ONTOLOGY.STORIES_PROPERTY_ID);
    const seenCoverageIds = new Set<string>();
    const coverageItems: EntityLinkRowModel[] = [];

    for (const row of coverage.page.rows) {
      const hex = ID.uuidToHex(row.entityId);
      if (seenCoverageIds.has(hex)) continue;
      seenCoverageIds.add(hex);
      const typeIds = row.types.map(type => type.id);
      const firstTypeName = row.types.find(type => type.name)?.name ?? null;
      const { kind, label } = classifyCoverageKind(typeIds, firstTypeName);
      coverageItems.push({
        id: row.entityId,
        kind,
        kindLabel: label,
        title: row.title || row.entityId,
        meta: row.description ?? undefined,
        href: NavUtils.toEntity(row.spaceId || spaceId, row.entityId),
      });
    }

    for (const rel of directStories) {
      const hex = ID.uuidToHex(rel.toEntity.id);
      if (seenCoverageIds.has(hex) || !rel.toEntity.name) continue;
      seenCoverageIds.add(hex);
      coverageItems.push({
        id: rel.toEntity.id,
        kind: 'news-story',
        kindLabel: 'News story',
        title: rel.toEntity.name,
        href: NavUtils.toEntity(rel.toSpaceId ?? spaceId, rel.toEntity.id),
      });
    }

    const sections: EntityListSectionModel[] = [];
    if (coverageItems.length > 0) {
      sections.push({
        id: 'coverage',
        title: 'Sources & evidence',
        items: coverageItems,
      });
    }

    const subtopicRels = readEntityRelations(entity, [
      TEMPLATE_ONTOLOGY.SUBTOPICS_PROPERTY_ID,
      TEMPLATE_ONTOLOGY.UNNAMED_SUBTOPIC_PROPERTY_ID,
    ]);
    const seenSubtopicNames = new Set<string>();
    const uniqueSubtopics = subtopicRels.filter(rel => {
      const name = rel.toEntity.name?.trim();
      if (!name) return false;
      const key = name.toLowerCase();
      if (seenSubtopicNames.has(key)) return false;
      seenSubtopicNames.add(key);
      return true;
    });
    if (uniqueSubtopics.length > 0) {
      sections.push({
        id: 'subtopics',
        title: 'Subtopics',
        items: uniqueSubtopics.map(rel => ({
          id: rel.toEntity.id,
          kind: 'topic',
          kindLabel: 'Topic',
          title: rel.toEntity.name ?? rel.toEntity.id,
          href: NavUtils.toEntity(rel.toSpaceId ?? spaceId, rel.toEntity.id),
        })),
      });
    }

    const timelineHighlights: TopicTimelineHighlightModel[] = linkedEvents
      .filter(eventEntity => Boolean(eventEntity.name))
      .map(eventEntity => {
        const eventSpaceId = resolveEntitySpaceId(eventEntity, spaceId);
        return {
          id: eventEntity.id,
          when:
            formatOntologyDate(readEntityTextValue(eventEntity, TEMPLATE_ONTOLOGY.EVENT_DATE_PROPERTY_ID)) ?? 'Event',
          title: eventEntity.name ?? eventEntity.id,
          summary: eventEntity.description ?? undefined,
          href: NavUtils.toEntity(eventSpaceId, eventEntity.id),
        };
      });

    const extraTypeLabels = entity.types
      .filter(type => !ID.equals(type.id, TOPIC_TYPE_ID) && Boolean(type.name))
      .map(type => type.name as string);

    const graphConnections = extractGraphConnections(entity, spaceId, [
      TEMPLATE_ONTOLOGY.SUBTOPICS_PROPERTY_ID,
      TEMPLATE_ONTOLOGY.UNNAMED_SUBTOPIC_PROPERTY_ID,
      TEMPLATE_ONTOLOGY.TOPIC_CLAIMS_PROPERTY_ID,
      TEMPLATE_ONTOLOGY.STORIES_PROPERTY_ID,
      TAG_PROPERTY_ID,
    ]);
    const flags = extractEntityFlags(entity, spaceId);

    return {
      id: entity.id,
      title: entity.name ?? entity.id,
      coverUrl: Entities.cover(entity.relations) ?? serverCoverUrl ?? null,
      lede: entity.description ?? undefined,
      breadcrumbs: breadcrumbs.length > 0 ? breadcrumbs : undefined,
      tags: [...extraTypeLabels, ...(isCurated ? ['Curated'] : [])],
      stats: stats.length > 0 ? stats : undefined,
      contestedClaims: contestedClaims.length > 0 ? contestedClaims : undefined,
      agreedClaims: agreedClaims.length > 0 ? agreedClaims : undefined,
      timelineHighlights: timelineHighlights.length > 0 ? timelineHighlights : undefined,
      graphConnections: graphConnections.length > 0 ? graphConnections : undefined,
      contextByEntityId: buildEntityContextMap(entity.id, flags),
      sections: sections.length > 0 ? sections : undefined,
    };
  }, [
    ancestors,
    countsByTopicId,
    coverage.page.rows,
    directClaimRels,
    entity,
    entityId,
    linkedClaims,
    linkedEvents,
    responseBatch.data,
    serverCoverUrl,
    space?.entity?.name,
    spaceId,
  ]);

  return {
    data: model,
    isLoading: isEntityLoading && !entity,
    source: 'live',
    actionCallbacks,
  };
}
