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
  resolvePostAuthor,
} from '../ontology';
import { sourcesIngestionLink } from './source-ingestion-links';
import { useHydratedSourceCards, usePostAuthorMetadata } from './use-hydrated-source-cards';
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
  const authorMeta = usePostAuthorMetadata(entity ? entityId : undefined);

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
    const externalUrl = readEntityTextValue(entity, TEMPLATE_ONTOLOGY.WEB_URL_PROPERTY_ID) ?? undefined;
    // The same order as the source-card rail (see resolvePostAuthor). Never the post's own name: a
    // tweet's name is its text, so an author-less tweet would be titled "<its own text> on X".
    const { name: knownAuthor, handle } = resolvePostAuthor({
      relationName: authors[0]?.toEntity.name,
      webUrl: externalUrl,
      lookup: authorMeta,
    });
    const authorName = knownAuthor ?? 'Unknown author';
    const authorHandle = handle && handle !== authorName ? handle : undefined;
    const when = formatOntologyDate(readEntityTextValue(entity, TEMPLATE_ONTOLOGY.PUBLISH_DATE_PROPERTY_ID));
    const topics = readEntityRelations(entity, TEMPLATE_ONTOLOGY.TOPICS_PROPERTY_ID);
    const communityNotes = readEntityRelations(entity, TEMPLATE_ONTOLOGY.COMMUNITY_NOTES_PROPERTY_ID);
    const quotedPosts = readEntityRelations(entity, TEMPLATE_ONTOLOGY.QUOTED_POSTS_PROPERTY_ID);

    const rawTitle = entity.name?.trim();
    // A tweet's name is its own text, which the author card shows, so the page is titled by its
    // author instead of repeating the text. A Post's name is a headline (an article or statement).
    const hasDistinctHeadline = Boolean(rawTitle) && rawTitle !== knownAuthor && !isTweet;
    const displayTitle = hasDistinctHeadline
      ? rawTitle
      : !knownAuthor
        ? `Post on ${platform}`
        : knownAuthor.toLowerCase() === platform.toLowerCase()
          ? knownAuthor
          : `${knownAuthor} on ${platform}`;

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
        ingestionLink: sourcesIngestionLink(entity.id, entity.name, spaceId),
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

    // The card shows what the author wrote. A tweet's own text is stored as its name (the graph has
    // no separate text property; `description` is a generated summary of it). A Post with a headline
    // has no stored text of its own, so its card falls back to the description.
    const bodyText = isTweet
      ? (rawTitle ?? entity.description ?? '')
      : hasDistinctHeadline
        ? (entity.description ?? '')
        : (rawTitle ?? entity.description ?? '');

    return {
      id: entity.id,
      title: displayTitle,
      authorName,
      authorHandle,
      authorAvatarUrl: authorMeta?.avatarUrl ?? null,
      platform,
      when,
      body: bodyText,
      externalUrl,
      mediaUrl: Entities.cover(entity.relations) ?? serverCoverUrl ?? null,
      // The image's alt is its author when known; never the "Unknown author" placeholder.
      mediaAlt: knownAuthor ?? '',
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
    authorMeta,
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
