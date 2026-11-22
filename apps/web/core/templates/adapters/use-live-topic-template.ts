'use client';

import * as React from 'react';

import { CLAIM_TYPE_ID } from '~/core/claims/ontology';
import { CURATED_TOPIC_TAG_ID, NEWS_STORY_TYPE_ID, TAG_PROPERTY_ID, TOPIC_TYPE_ID } from '~/core/constants';
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
import { TEMPLATE_ONTOLOGY, formatOntologyDate, readEntityTextValue } from '../ontology';

const LIVE_CLAIMS_LIMIT = 8;
const LIVE_COVERAGE_LIMIT = 12;

function classifyCoverageKind(
  typeIds: readonly string[],
  typeName: string | null
): { kind: EntityLinkKind; label: string } {
  if (typeIds.some(id => ID.equals(id, NEWS_STORY_TYPE_ID))) {
    return { kind: 'news-story', label: typeName ?? 'News' };
  }
  return { kind: 'source', label: typeName ?? 'Source' };
}

/**
 * Live Geo Tier-1 adapter for `TopicTemplate`.
 *
 * Maps existing Geo graph queries (topic entity, ancestors, connection counts, linked claims,
 * and coverage) onto `TopicTemplateModel`. Unbacked Tier-2/3 modules (communities, community cases,
 * timeline highlights) stay undefined so the template omits them cleanly.
 */
export function useLiveTopicTemplate({
  entityId,
  spaceId,
}: {
  entityId: string;
  spaceId: string;
}): TemplateDataSource<TopicTemplateModel> {
  const { entity, isLoading: isEntityLoading } = useQueryEntity({ id: entityId, spaceId });
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

  const claimBatchTargets = React.useMemo(
    () => linkedClaims.map(claim => ({ entityId: claim.id, responseKind: 'stance' as const })),
    [linkedClaims]
  );

  const responseBatch = useClaimResponseSummaryBatch({
    spaceId,
    targets: claimBatchTargets,
    enabled: claimBatchTargets.length > 0,
  });

  const { entities: linkedEvents } = useTopicLinkedEntities({
    topicId: entityId,
    typeIds: [TEMPLATE_ONTOLOGY.NEWS_EVENT_TYPE_ID],
    first: 6,
    spaceIds,
  });

  const coverage = useTopicCoverage({
    topicId: entityId,
    spaceIds,
    first: LIVE_COVERAGE_LIMIT,
  });

  const model = React.useMemo<TopicTemplateModel | null>(() => {
    if (!entity) return null;

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

    const contestedClaims: ClaimSummaryModel[] = linkedClaims
      .filter(claim => Boolean(claim.name))
      .map(claim => {
        const claimSpaceId = resolveEntitySpaceId(claim, spaceId);
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

        return {
          id: claim.id,
          title: claim.name ?? claim.id,
          overallPercent: percent,
          userVote: viewerVote,
          meta: total > 0 ? [`${total.toLocaleString('en-US')} ${total === 1 ? 'vote' : 'votes'}`] : undefined,
          split: {
            rows:
              total > 0 && percent !== undefined
                ? [
                    {
                      id: 'all',
                      label: 'Everyone',
                      color: '#202020',
                      percent,
                      voterCount: total,
                      isEveryone: true,
                      userLabel: viewerVote ? `You: ${viewerVote === 'agree' ? 'Agree' : 'Disagree'}` : undefined,
                    },
                  ]
                : [],
            isSplit: true,
            totalVotes: total > 0 ? total : undefined,
          },
          href: NavUtils.toEntity(claimSpaceId, claim.id),
        };
      });

    const coverageItems: EntityLinkRowModel[] = coverage.page.rows.map(row => {
      const typeIds = row.types.map(type => type.id);
      const firstTypeName = row.types.find(type => type.name)?.name ?? null;
      const { kind, label } = classifyCoverageKind(typeIds, firstTypeName);
      return {
        id: row.entityId,
        kind,
        kindLabel: label,
        title: row.title || row.entityId,
        meta: row.description ?? undefined,
        href: NavUtils.toEntity(row.spaceId || spaceId, row.entityId),
      };
    });

    const sections: EntityListSectionModel[] = [];
    if (coverageItems.length > 0) {
      sections.push({
        id: 'coverage',
        title: 'Sources & evidence',
        items: coverageItems,
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

    return {
      id: entity.id,
      title: entity.name ?? entity.id,
      coverUrl: Entities.cover(entity.relations),
      lede: entity.description ?? undefined,
      breadcrumbs: breadcrumbs.length > 0 ? breadcrumbs : undefined,
      tags: [...extraTypeLabels, ...(isCurated ? ['Curated'] : [])],
      stats: stats.length > 0 ? stats : undefined,
      contestedClaims: contestedClaims.length > 0 ? contestedClaims : undefined,
      timelineHighlights: timelineHighlights.length > 0 ? timelineHighlights : undefined,
      sections: sections.length > 0 ? sections : undefined,
    };
  }, [
    ancestors,
    countsByTopicId,
    coverage.page.rows,
    entity,
    entityId,
    linkedClaims,
    linkedEvents,
    responseBatch.data,
    spaceId,
  ]);

  return {
    data: model,
    isLoading: isEntityLoading && !entity,
    source: 'live',
  };
}
