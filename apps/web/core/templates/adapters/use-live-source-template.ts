'use client';

import * as React from 'react';

import { useSpace } from '~/core/hooks/use-space';
import { ID } from '~/core/id';
import { claimResponseTargetKey } from '~/core/responses/claim-response-summaries';
import { useClaimResponseSummaryBatch } from '~/core/responses/use-claim-response-summaries';
import { useQueryEntities, useQueryEntity } from '~/core/sync/use-store';
import { Entities } from '~/core/utils/entity';
import { resolveEntitySpaceId } from '~/core/utils/space/entity-home-space';
import { NavUtils } from '~/core/utils/utils';

import type {
  BreadcrumbItem,
  ClaimSummaryModel,
  EntityListSectionModel,
  SourceQuoteModel,
  SourceTemplateModel,
  TemplateDataSource,
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

/**
 * Live Geo adapter for `SourceTemplate` (Articles, Official documents, Datasets, Papers).
 *
 * Hydrates outgoing metadata (publisher, authors, publish date, summary, URL, DOI, archive URL),
 * incoming Claims citing this source (`Sources`), incoming verbatim Quotes extracted from this
 * source (`Quote --[Sources]--> Source`), incoming News stories citing it, live claim vote splits,
 * Context graph relations, Flags, and live `useMutate` actions.
 */
export function useLiveSourceTemplate({
  entityId,
  spaceId,
  serverCoverUrl,
}: {
  entityId: string;
  spaceId: string;
  serverCoverUrl?: string | null;
}): TemplateDataSource<SourceTemplateModel> {
  const { entity, isLoading } = useQueryEntity({ id: entityId, spaceId });
  const { space } = useSpace(spaceId);

  const citingClaimsWhere = React.useMemo(
    () => ({
      types: [{ id: { equals: TEMPLATE_ONTOLOGY.CLAIM_TYPE_ID } }],
      relations: [
        { typeOf: { id: { equals: TEMPLATE_ONTOLOGY.SOURCES_PROPERTY_ID } }, toEntity: { id: { equals: entityId } } },
      ],
    }),
    [entityId]
  );

  const quotesWhere = React.useMemo(
    () => ({
      types: [{ id: { equals: TEMPLATE_ONTOLOGY.QUOTE_TYPE_ID } }],
      relations: [
        { typeOf: { id: { equals: TEMPLATE_ONTOLOGY.SOURCES_PROPERTY_ID } }, toEntity: { id: { equals: entityId } } },
      ],
    }),
    [entityId]
  );

  const citingStoriesWhere = React.useMemo(
    () => ({
      types: [{ id: { equals: TEMPLATE_ONTOLOGY.NEWS_STORY_TYPE_ID } }],
      relations: [
        { typeOf: { id: { equals: TEMPLATE_ONTOLOGY.SOURCES_PROPERTY_ID } }, toEntity: { id: { equals: entityId } } },
      ],
    }),
    [entityId]
  );

  const { entities: citingClaims } = useQueryEntities({ where: citingClaimsWhere, first: 16 });
  const { entities: sourceQuotes } = useQueryEntities({ where: quotesWhere, first: 12 });
  const { entities: citingStories } = useQueryEntities({ where: citingStoriesWhere, first: 8 });

  const claimBatchTargets = React.useMemo(
    () => citingClaims.map(claim => ({ entityId: claim.id, responseKind: 'stance' as const })),
    [citingClaims]
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
    ownerKind: 'source',
  });

  const model = React.useMemo<SourceTemplateModel | null>(() => {
    if (!entity) return null;

    const title = entity.name ?? entity.id;
    const spaceLabel = space?.entity?.name?.trim() || 'Everyone';
    const publishers = readEntityRelations(entity, TEMPLATE_ONTOLOGY.PUBLISHER_PROPERTY_ID);
    const authors = readEntityRelations(entity, TEMPLATE_ONTOLOGY.AUTHORS_PROPERTY_ID)
      .map(rel => rel.toEntity.name)
      .filter((name): name is string => Boolean(name));
    const publisher = publishers[0]?.toEntity.name ?? (authors.length > 0 ? authors.join(', ') : undefined);
    const date = formatOntologyDate(readEntityTextValue(entity, TEMPLATE_ONTOLOGY.PUBLISH_DATE_PROPERTY_ID));
    const externalUrl =
      readEntityTextValue(entity, TEMPLATE_ONTOLOGY.WEB_URL_PROPERTY_ID) ??
      readEntityTextValue(entity, TEMPLATE_ONTOLOGY.WEBSITE_PROPERTY_ID) ??
      undefined;
    const doi = readEntityTextValue(entity, TEMPLATE_ONTOLOGY.DOI_PROPERTY_ID) ?? undefined;
    const sourceType = entity.types.find(type => Boolean(type.name))?.name ?? 'Document';
    const summary =
      readEntityTextValue(entity, TEMPLATE_ONTOLOGY.SUMMARY_PROPERTY_ID) ?? entity.description ?? undefined;

    const topics = readEntityRelations(entity, TEMPLATE_ONTOLOGY.TOPICS_PROPERTY_ID);
    const firstTopic = topics[0];
    const breadcrumbs: BreadcrumbItem[] | undefined = firstTopic
      ? [
          {
            id: firstTopic.toEntity.id,
            label: firstTopic.toEntity.name ?? firstTopic.toEntity.id,
            href: NavUtils.toEntity(firstTopic.toSpaceId ?? spaceId, firstTopic.toEntity.id),
          },
          { id: entity.id, label: title },
        ]
      : undefined;

    const metadata: { label: string; value: string }[] = [
      ...(publisher ? [{ label: 'Publisher', value: publisher }] : []),
      ...(date ? [{ label: 'Date', value: date }] : []),
      ...(doi ? [{ label: 'DOI', value: doi }] : []),
      { label: 'Type', value: sourceType },
    ];

    const quotes: SourceQuoteModel[] = sourceQuotes
      .filter(q => Boolean(q.name))
      .map(q => {
        const qAuthors = readEntityRelations(q, TEMPLATE_ONTOLOGY.AUTHORS_PROPERTY_ID)
          .map(rel => rel.toEntity.name)
          .filter((name): name is string => Boolean(name));
        return {
          id: q.id,
          text: q.name ?? q.id,
          speaker: qAuthors.length > 0 ? qAuthors.join(', ') : undefined,
          location: q.description ?? undefined,
        };
      });

    const supportedClaims: ClaimSummaryModel[] = citingClaims
      .filter(claim => Boolean(claim.name))
      .map(claim => {
        const batch = responseBatch.data?.get(claimResponseTargetKey({ entityId: claim.id, responseKind: 'stance' }));
        const pos = batch?.counts.positive ?? 0;
        const neg = batch?.counts.negative ?? 0;
        const total = pos + neg;
        const pct = total > 0 ? Math.round((pos / total) * 100) : undefined;
        const isAccepted = total >= 2 && pct !== undefined && (pct >= 75 || pct <= 25);
        return {
          id: claim.id,
          title: claim.name ?? claim.id,
          kind: readClaimKind(claim.values),
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
          href: NavUtils.toEntity(resolveEntitySpaceId(claim, spaceId), claim.id),
        };
      });

    const sections: EntityListSectionModel[] = [];

    if (citingStories.length > 0) {
      sections.push({
        id: 'cited-by',
        title: 'Cited by',
        items: citingStories
          .filter(story => Boolean(story.name))
          .map(story => ({
            id: story.id,
            kind: 'news-story',
            kindLabel: 'News story',
            title: story.name ?? story.id,
            meta: story.description ?? undefined,
            href: NavUtils.toEntity(resolveEntitySpaceId(story, spaceId), story.id),
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
      TEMPLATE_ONTOLOGY.TOPICS_PROPERTY_ID,
      TEMPLATE_ONTOLOGY.PUBLISHER_PROPERTY_ID,
      TEMPLATE_ONTOLOGY.AUTHORS_PROPERTY_ID,
    ]);
    const flags = extractEntityFlags(entity, spaceId);

    const extraTags = entity.types
      .filter(t => Boolean(t.name) && t.name !== sourceType && !ID.equals(t.id, TEMPLATE_ONTOLOGY.ARTICLE_TYPE_ID))
      .map(t => t.name as string);

    return {
      id: entity.id,
      title,
      publisher,
      date,
      sourceType,
      summary,
      quotes: quotes.length > 0 ? quotes : undefined,
      coverUrl: Entities.cover(entity.relations) ?? serverCoverUrl ?? null,
      externalUrl,
      breadcrumbs,
      tags: extraTags.length > 0 ? extraTags : undefined,
      metadata,
      graphConnections: graphConnections.length > 0 ? graphConnections : undefined,
      contextByEntityId: buildEntityContextMap(entity.id, flags),
      supportedClaims,
      sections,
    };
  }, [
    citingClaims,
    citingStories,
    entity,
    responseBatch.data,
    serverCoverUrl,
    sourceQuotes,
    space?.entity?.name,
    spaceId,
  ]);

  return {
    data: model,
    isLoading: isLoading && !entity,
    source: 'live',
    actionCallbacks,
  };
}
