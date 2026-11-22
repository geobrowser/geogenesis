'use client';

import * as React from 'react';

import { useSpace } from '~/core/hooks/use-space';
import { ID } from '~/core/id';
import { claimResponseTargetKey } from '~/core/responses/claim-response-summaries';
import { useClaimResponseSummaryBatch } from '~/core/responses/use-claim-response-summaries';
import { useQueryEntity } from '~/core/sync/use-store';
import { Entities } from '~/core/utils/entity';
import { NavUtils } from '~/core/utils/utils';

import type {
  BreadcrumbItem,
  ClaimSummaryModel,
  EntityListSectionModel,
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
  readEntityRelations,
  readEntityTextValue,
} from '../ontology';
import { useLiveEntityActions } from './use-live-entity-actions';

/**
 * Live Geo adapter for `NewsStoryTemplate` (`ContentIds.NEWS_STORY_TYPE`).
 *
 * Hydrates `Cover`, `Summary`, `Publisher`, `Authors`, `Publish datetime`, `Web URL`,
 * `Web archive URL`, `Notable claims` + `Related claims` (with live vote splits), `Sources`,
 * `Related stories`, `Topics`, Context graph relations, Flags (`Disclaimer` + `Community notes`),
 * and live `useMutate` actions.
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

  const claimRelations = React.useMemo(
    () =>
      readEntityRelations(entity, [
        TEMPLATE_ONTOLOGY.NOTABLE_CLAIMS_PROPERTY_ID,
        TEMPLATE_ONTOLOGY.RELATED_CLAIMS_PROPERTY_ID,
      ]),
    [entity]
  );

  const claimBatchTargets = React.useMemo(
    () => claimRelations.map(rel => ({ entityId: rel.toEntity.id, responseKind: 'stance' as const })),
    [claimRelations]
  );

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
    const outlet = publishers[0]?.toEntity.name ?? space?.entity?.name?.trim() ?? 'Geo News';
    const date = formatOntologyDate(readEntityTextValue(entity, TEMPLATE_ONTOLOGY.PUBLISH_DATE_PROPERTY_ID));
    const externalUrl = readEntityTextValue(entity, TEMPLATE_ONTOLOGY.WEB_URL_PROPERTY_ID) ?? undefined;
    const archiveUrl = readEntityTextValue(entity, TEMPLATE_ONTOLOGY.WEB_ARCHIVE_URL_PROPERTY_ID) ?? undefined;
    const summary =
      readEntityTextValue(entity, TEMPLATE_ONTOLOGY.SUMMARY_PROPERTY_ID) ?? entity.description ?? undefined;

    const topics = readEntityRelations(entity, TEMPLATE_ONTOLOGY.TOPICS_PROPERTY_ID);
    const sources = readEntityRelations(entity, TEMPLATE_ONTOLOGY.SOURCES_PROPERTY_ID);
    const relatedStories = readEntityRelations(entity, TEMPLATE_ONTOLOGY.RELATED_STORIES_PROPERTY_ID);

    const firstTopic = topics[0];
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

    const reportedClaims: ClaimSummaryModel[] = claimRelations
      .filter(rel => Boolean(rel.toEntity.name))
      .map(rel => {
        const batch = responseBatch.data?.get(
          claimResponseTargetKey({ entityId: rel.toEntity.id, responseKind: 'stance' })
        );
        const pos = batch?.counts.positive ?? 0;
        const neg = batch?.counts.negative ?? 0;
        const total = pos + neg;
        const pct = total > 0 ? Math.round((pos / total) * 100) : undefined;
        const isAccepted = total >= 2 && pct !== undefined && (pct >= 75 || pct <= 25);
        return {
          id: rel.toEntity.id,
          title: rel.toEntity.name ?? rel.toEntity.id,
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
          href: NavUtils.toEntity(rel.toSpaceId ?? spaceId, rel.toEntity.id),
        };
      });

    const sections: EntityListSectionModel[] = [];

    if (sources.length > 0) {
      sections.push({
        id: 'sources',
        title: 'Sources',
        items: sources.map(rel => ({
          id: rel.toEntity.id,
          kind: 'source',
          kindLabel: 'Source',
          title: rel.toEntity.name ?? rel.toEntity.id,
          href: NavUtils.toEntity(rel.toSpaceId ?? spaceId, rel.toEntity.id),
        })),
      });
    }

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

    if (topics.length > 0) {
      sections.push({
        id: 'topics',
        title: 'Topics',
        items: topics.map(rel => ({
          id: rel.toEntity.id,
          kind: 'topic',
          kindLabel: 'Topic',
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
      TEMPLATE_ONTOLOGY.PUBLISHER_PROPERTY_ID,
      TEMPLATE_ONTOLOGY.AUTHORS_PROPERTY_ID,
    ]);
    const flags = extractEntityFlags(entity, spaceId);

    return {
      id: entity.id,
      headline,
      outlet,
      outletInitials: outletInitialsFrom(outlet),
      outletColor: outletColorFrom(outlet),
      authors: authors.length > 0 ? authors : undefined,
      date,
      summary,
      coverUrl: Entities.cover(entity.relations) ?? serverCoverUrl ?? null,
      externalUrl,
      archiveUrl,
      breadcrumbs,
      graphConnections: graphConnections.length > 0 ? graphConnections : undefined,
      contextByEntityId: buildEntityContextMap(entity.id, flags),
      reportedClaims,
      sections,
    };
  }, [claimRelations, entity, responseBatch.data, serverCoverUrl, space?.entity?.name, spaceId]);

  return {
    data: model,
    isLoading: isLoading && !entity,
    source: 'live',
    actionCallbacks,
  };
}
