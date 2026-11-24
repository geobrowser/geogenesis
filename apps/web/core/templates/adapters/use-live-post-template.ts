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
  EntityListSectionModel,
  PostContextNoteModel,
  PostTemplateModel,
  TemplateDataSource,
} from '../models';
import {
  TEMPLATE_ONTOLOGY,
  buildEntityContextMap,
  extractEntityFlags,
  extractGraphConnections,
  formatOntologyDate,
  readEntityRelations,
  readEntityTextValue,
} from '../ontology';
import { sourcesIngestionLink } from './source-ingestion-links';
import { useHydratedSourceCards } from './use-hydrated-source-cards';
import { useLiveEntityActions } from './use-live-entity-actions';
import { useEntityWithViewerSources } from './use-viewer-sources';

/**
 * Live Geo adapter for `PostTemplate` (`TWEET_TYPE_ID` / `POST_TYPE_ID`).
 *
 * Hydrates `Platform`, `Authors`, `Publish datetime`, `Web URL`, `Cover`, `Related claims`
 * (with live vote splits), `Community notes` (rendered both in Context notes & Flags),
 * `Quoted posts`, `Reply to`, `Sources`, `Topics`, Context relations, and live `useMutate` actions.
 */
export function useLivePostTemplate({
  entityId,
  spaceId,
  serverCoverUrl,
}: {
  entityId: string;
  spaceId: string;
  serverCoverUrl?: string | null;
}): TemplateDataSource<PostTemplateModel> {
  const { entity, isLoading } = useQueryEntity({ id: entityId, spaceId });
  const { space } = useSpace(spaceId);
  const [localNotes, setLocalNotes] = React.useState<PostContextNoteModel[]>([]);

  const claimRelations = React.useMemo(
    () => readEntityRelations(entity, TEMPLATE_ONTOLOGY.RELATED_CLAIMS_PROPERTY_ID),
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
    ownerKind: 'post',
  });

  // Page-space Sources plus the viewer's own personal-space ones, so a non-member who added a source
  // sees it (GEO-3819).
  const sourcesEntity = useEntityWithViewerSources({ entity, entityId, spaceId });
  const sourceSeeds = React.useMemo(
    () =>
      readEntityRelations(sourcesEntity, TEMPLATE_ONTOLOGY.SOURCES_PROPERTY_ID).map(rel => ({
        id: rel.toEntity.id,
        name: rel.toEntity.name,
        spaceId: rel.toSpaceId,
      })),
    [sourcesEntity]
  );
  const { items: hydratedSourceCards } = useHydratedSourceCards({
    sources: sourceSeeds,
    spaceId,
  });

  const model = React.useMemo<PostTemplateModel | null>(() => {
    if (!entity) return null;

    const spaceLabel = space?.entity?.name?.trim() || 'Everyone';
    const isTweet = entity.types.some(type => ID.equals(type.id, TEMPLATE_ONTOLOGY.TWEET_TYPE_ID));
    const platforms = readEntityRelations(entity, TEMPLATE_ONTOLOGY.PLATFORM_PROPERTY_ID);
    const platform = platforms[0]?.toEntity.name ?? (isTweet ? 'X' : 'Geo');
    const authors = readEntityRelations(entity, TEMPLATE_ONTOLOGY.AUTHORS_PROPERTY_ID);
    const authorName = authors[0]?.toEntity.name ?? entity.name ?? 'Post';
    const when = formatOntologyDate(readEntityTextValue(entity, TEMPLATE_ONTOLOGY.PUBLISH_DATE_PROPERTY_ID));
    const externalUrl = readEntityTextValue(entity, TEMPLATE_ONTOLOGY.WEB_URL_PROPERTY_ID) ?? undefined;
    const topics = readEntityRelations(entity, TEMPLATE_ONTOLOGY.TOPICS_PROPERTY_ID);
    const communityNotes = readEntityRelations(entity, TEMPLATE_ONTOLOGY.COMMUNITY_NOTES_PROPERTY_ID);
    const quotedPosts = readEntityRelations(entity, TEMPLATE_ONTOLOGY.QUOTED_POSTS_PROPERTY_ID);

    const rawTitle = entity.name?.trim();
    const hasDistinctHeadline =
      Boolean(rawTitle) && rawTitle !== authorName && (!isTweet || (rawTitle?.length ?? 0) <= 100);
    const displayTitle = hasDistinctHeadline
      ? rawTitle
      : authorName.toLowerCase() === platform.toLowerCase()
        ? authorName
        : `${authorName} on ${platform}`;

    const firstTopic = topics[0];
    const breadcrumbs: BreadcrumbItem[] | undefined = firstTopic
      ? [
          {
            id: firstTopic.toEntity.id,
            label: firstTopic.toEntity.name ?? firstTopic.toEntity.id,
            href: NavUtils.toEntity(firstTopic.toSpaceId ?? spaceId, firstTopic.toEntity.id),
          },
          { id: entity.id, label: displayTitle ?? entity.id },
        ]
      : undefined;

    const claims = claimRelations
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
          stanceLabel: 'Claim',
          claim: {
            id: rel.toEntity.id,
            title: rel.toEntity.name ?? rel.toEntity.id,
            overallPercent: pct,
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
          },
        };
      });

    const graphNotes: PostContextNoteModel[] = communityNotes
      .filter(rel => Boolean(rel.toEntity.name))
      .map(rel => ({
        id: rel.toEntity.id,
        tag: 'Community note',
        status: 'shown',
        statusLabel: 'Shown',
        text: rel.toEntity.name ?? rel.toEntity.id,
        sources: [],
      }));

    const sections: EntityListSectionModel[] = [];

    if (quotedPosts.length > 0) {
      sections.push({
        id: 'quoted-posts',
        title: 'Quoted posts',
        items: quotedPosts.map(rel => ({
          id: rel.toEntity.id,
          kind: 'post',
          kindLabel: 'Post',
          title: rel.toEntity.name ?? rel.toEntity.id,
          href: NavUtils.toEntity(rel.toSpaceId ?? spaceId, rel.toEntity.id),
        })),
      });
    }

    if (hydratedSourceCards.length > 0) {
      sections.push({
        id: 'sources',
        title: 'Sources',
        layout: 'cards',
        items: hydratedSourceCards,
        ingestionLink: sourcesIngestionLink(entity.id, entity.name),
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
      TEMPLATE_ONTOLOGY.RELATED_CLAIMS_PROPERTY_ID,
      TEMPLATE_ONTOLOGY.COMMUNITY_NOTES_PROPERTY_ID,
      TEMPLATE_ONTOLOGY.QUOTED_POSTS_PROPERTY_ID,
      TEMPLATE_ONTOLOGY.SOURCES_PROPERTY_ID,
      TEMPLATE_ONTOLOGY.TOPICS_PROPERTY_ID,
      TEMPLATE_ONTOLOGY.AUTHORS_PROPERTY_ID,
      TEMPLATE_ONTOLOGY.PLATFORM_PROPERTY_ID,
    ]);
    const flags = extractEntityFlags(entity, spaceId);

    const bodyText =
      hasDistinctHeadline && entity.description
        ? entity.description
        : entity.description && entity.name && entity.description !== entity.name
          ? `${entity.name}\n\n${entity.description}`
          : (entity.description ?? entity.name ?? '');

    return {
      id: entity.id,
      title: displayTitle,
      authorName,
      platform,
      when,
      body: bodyText,
      externalUrl,
      mediaUrl: Entities.cover(entity.relations) ?? serverCoverUrl ?? null,
      breadcrumbs,
      claims,
      notes: [...localNotes, ...graphNotes],
      onAddNote: draft => {
        actionCallbacks.onAddFlag?.(entity.id, {
          reason: draft.tag,
          body: draft.text,
          sourceUrl: draft.sourceUrl || undefined,
        });
        setLocalNotes(prev => [
          {
            id: `local-note-${Date.now()}`,
            tag: draft.tag,
            status: 'mine',
            statusLabel: 'Added',
            text: draft.text,
            sources: draft.sourceUrl
              ? [{ id: `src-${Date.now()}`, index: 1, title: draft.sourceUrl, href: draft.sourceUrl }]
              : [],
          },
          ...prev,
        ]);
      },
      graphConnections: graphConnections.length > 0 ? graphConnections : undefined,
      contextByEntityId: buildEntityContextMap(entity.id, flags),
      sections,
    };
  }, [
    actionCallbacks,
    claimRelations,
    entity,
    hydratedSourceCards,
    localNotes,
    responseBatch.data,
    serverCoverUrl,
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
