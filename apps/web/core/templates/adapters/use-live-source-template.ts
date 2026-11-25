'use client';

import * as React from 'react';

import { useSpace } from '~/core/hooks/use-space';
import { ID } from '~/core/id';
import { useQueryEntities, useQueryEntity } from '~/core/sync/use-store';
import type { Entity, Relation } from '~/core/types';
import { Entities } from '~/core/utils/entity';
import { normId } from '~/core/utils/norm-id';
import { resolveEntitySpaceId } from '~/core/utils/space/entity-home-space';
import { NavUtils } from '~/core/utils/utils';

import type {
  BreadcrumbItem,
  ClaimKind,
  ClaimSummaryModel,
  ClaimTopicPillModel,
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
import { useInitialHydrationGate } from './use-initial-hydration-gate';
import { useLiveEntityActions } from './use-live-entity-actions';
import { useTemplateClaimVoteCounts } from './use-template-claim-vote-counts';
import { useTopicMediaBatch } from './use-topic-media-batch';
import { useViewerSpaceId } from './use-viewer-sources';

/**
 * Live Geo adapter for `SourceTemplate` (Articles, Official documents, Datasets, Papers).
 *
 * Hydrates outgoing metadata (publisher, authors, publish date, summary, URL, DOI, archive URL),
 * BOTH incoming Claims citing this source (`Claim --[Sources]--> Source`) AND outgoing linked
 * claims (`Source --[Related claims / Notable claims / Claims]--> Claim`), incoming verbatim Quotes
 * extracted from this source (`Quote --[Sources]--> Source`), incoming News stories citing it,
 * Topic pills with circular avatars, live claim vote splits, Context graph relations, Disputes,
 * and live `useMutate` actions.
 */
const NO_ENTITIES: Entity[] = [];

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
  const [isMounted, setIsMounted] = React.useState(false);

  React.useEffect(() => {
    setIsMounted(true);
  }, []);

  // Citing claims, quotes and stories: only those in the viewed space.
  const citingClaimsWhere = React.useMemo(
    () => ({
      types: [{ id: { equals: TEMPLATE_ONTOLOGY.CLAIM_TYPE_ID } }],
      spaces: [{ equals: normId(spaceId) }],
      relations: [
        { typeOf: { id: { equals: TEMPLATE_ONTOLOGY.SOURCES_PROPERTY_ID } }, toEntity: { id: { equals: entityId } } },
      ],
    }),
    [entityId, spaceId]
  );

  const quotesWhere = React.useMemo(
    () => ({
      types: [{ id: { equals: TEMPLATE_ONTOLOGY.QUOTE_TYPE_ID } }],
      spaces: [{ equals: normId(spaceId) }],
      relations: [
        { typeOf: { id: { equals: TEMPLATE_ONTOLOGY.SOURCES_PROPERTY_ID } }, toEntity: { id: { equals: entityId } } },
      ],
    }),
    [entityId, spaceId]
  );

  const citingStoriesWhere = React.useMemo(
    () => ({
      types: [{ id: { equals: TEMPLATE_ONTOLOGY.NEWS_STORY_TYPE_ID } }],
      spaces: [{ equals: normId(spaceId) }],
      relations: [
        { typeOf: { id: { equals: TEMPLATE_ONTOLOGY.SOURCES_PROPERTY_ID } }, toEntity: { id: { equals: entityId } } },
      ],
    }),
    [entityId, spaceId]
  );

  const { entities: citingClaims, isLoading: isCitingClaimsLoading } = useQueryEntities({
    where: citingClaimsWhere,
    first: 24,
    enabled: isMounted,
  });
  // The viewer's own personal-space claims and quotes citing this source, so a non-editor who added
  // one from this page sees it (GEO-3836). Disabled signed out or when the page is in their own space.
  const viewerSpaceId = useViewerSpaceId(spaceId);
  const viewerCitingClaimsWhere = React.useMemo(
    () => ({ ...citingClaimsWhere, spaces: [{ equals: normId(viewerSpaceId ?? '') }] }),
    [citingClaimsWhere, viewerSpaceId]
  );
  const { entities: viewerCitingClaims } = useQueryEntities({
    where: viewerCitingClaimsWhere,
    first: 24,
    enabled: isMounted && viewerSpaceId !== null,
  });
  const { entities: sourceQuotes, isLoading: isQuotesLoading } = useQueryEntities({
    where: quotesWhere,
    first: 12,
    enabled: isMounted,
  });
  const viewerQuotesWhere = React.useMemo(
    () => ({ ...quotesWhere, spaces: [{ equals: normId(viewerSpaceId ?? '') }] }),
    [quotesWhere, viewerSpaceId]
  );
  const { entities: viewerQuotesRead } = useQueryEntities({
    where: viewerQuotesWhere,
    first: 12,
    enabled: isMounted && viewerSpaceId !== null,
  });
  // A disabled read can still return cached rows, so the viewer's are only taken with a viewer space.
  const viewerQuotes = viewerSpaceId ? viewerQuotesRead : NO_ENTITIES;
  const { entities: citingStories, isLoading: isStoriesLoading } = useQueryEntities({
    where: citingStoriesWhere,
    first: 8,
    enabled: isMounted,
  });

  // Outgoing claims directly linked from the article/source (e.g. `Related claims`, `Notable claims`, `Claims`)
  const outgoingClaimRelations = React.useMemo(
    () =>
      readEntityRelations(entity, [
        TEMPLATE_ONTOLOGY.RELATED_CLAIMS_PROPERTY_ID,
        TEMPLATE_ONTOLOGY.NOTABLE_CLAIMS_PROPERTY_ID,
        TEMPLATE_ONTOLOGY.TOPIC_CLAIMS_PROPERTY_ID,
      ]),
    [entity]
  );

  const outgoingClaimIds = React.useMemo(() => {
    const seen = new Set<string>();
    const ids: string[] = [];
    for (const rel of outgoingClaimRelations) {
      const hex = ID.uuidToHex(rel.toEntity.id);
      if (seen.has(hex)) continue;
      seen.add(hex);
      ids.push(rel.toEntity.id);
    }
    return ids;
  }, [outgoingClaimRelations]);

  const outgoingClaimsWhere = React.useMemo(() => ({ id: { in: outgoingClaimIds } }), [outgoingClaimIds]);
  const { entities: hydratedOutgoingClaims, isLoading: isOutgoingClaimsLoading } = useQueryEntities({
    where: outgoingClaimsWhere,
    first: Math.max(outgoingClaimIds.length, 1),
    enabled: isMounted && outgoingClaimIds.length > 0,
  });

  // Deduplicated topic relations + batch-hydrated Avatar/Cover thumbnails for Topic pills
  const topicRelations = React.useMemo(() => {
    const raw = readEntityRelations(entity, TEMPLATE_ONTOLOGY.TOPICS_PROPERTY_ID);
    const seen = new Set<string>();
    const out: Relation[] = [];
    for (const rel of raw) {
      const hex = ID.uuidToHex(rel.toEntity.id);
      if (seen.has(hex)) continue;
      seen.add(hex);
      out.push(rel);
    }
    return out;
  }, [entity]);

  const topicIds = React.useMemo(() => topicRelations.map(rel => rel.toEntity.id), [topicRelations]);
  const topicMediaQuery = useTopicMediaBatch(topicIds);

  // Merge incoming citing claims + outgoing related/notable claims (deduplicated by hex ID)
  const combinedClaimSeeds = React.useMemo(() => {
    const hydratedByHex = new Map<string, Entity>();
    for (const item of hydratedOutgoingClaims) {
      hydratedByHex.set(ID.uuidToHex(item.id), item);
    }

    // `spaceId` is the space the row links to and votes in, so a vote shows on the claim's own page.
    const byHex = new Map<
      string,
      { id: string; title: string; kind?: ClaimKind; href: string; spaceId: string; entity: Entity | null }
    >();

    // A disabled read can still return cached rows, so the viewer's are only taken with a viewer space.
    for (const claim of viewerSpaceId ? [...citingClaims, ...viewerCitingClaims] : citingClaims) {
      if (!claim.name) continue;
      const hex = ID.uuidToHex(claim.id);
      const claimSpace = resolveEntitySpaceId(claim, spaceId);
      byHex.set(hex, {
        id: claim.id,
        title: claim.name,
        kind: readClaimKind(claim.values),
        href: NavUtils.toEntity(claimSpace, claim.id),
        spaceId: claimSpace,
        entity: claim,
      });
    }

    for (const rel of outgoingClaimRelations) {
      const hex = ID.uuidToHex(rel.toEntity.id);
      if (byHex.has(hex)) continue;
      const hydrated = hydratedByHex.get(hex);
      const claimTitle = hydrated?.name?.trim() || rel.toEntity.name?.trim();
      if (!claimTitle) continue;
      const targetSpace = hydrated
        ? resolveEntitySpaceId(hydrated, rel.toSpaceId ?? spaceId)
        : (rel.toSpaceId ?? spaceId);
      byHex.set(hex, {
        id: rel.toEntity.id,
        title: claimTitle,
        kind: hydrated ? readClaimKind(hydrated.values) : undefined,
        href: NavUtils.toEntity(targetSpace, rel.toEntity.id),
        spaceId: targetSpace,
        entity: hydrated ?? null,
      });
    }

    return Array.from(byHex.values());
  }, [citingClaims, hydratedOutgoingClaims, outgoingClaimRelations, spaceId, viewerCitingClaims, viewerSpaceId]);

  // Each row's counts in the space it votes in, the counts its pills draw (GEO-3819).
  const voteCountTargets = React.useMemo(
    () => combinedClaimSeeds.map(claim => ({ claimId: claim.id, spaceId: claim.spaceId })),
    [combinedClaimSeeds]
  );
  const voteCounts = useTemplateClaimVoteCounts({ pageSpaceId: spaceId, targets: voteCountTargets });

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

    const firstTopic = topicRelations[0];
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

    const quotes: SourceQuoteModel[] = [...sourceQuotes, ...viewerQuotes]
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

    const supportedClaims: ClaimSummaryModel[] = combinedClaimSeeds
      .map(claim => {
        const counts = voteCounts.countsFor(claim.id);
        const pos = counts?.positive ?? 0;
        const neg = counts?.negative ?? 0;
        const total = pos + neg;
        const pct = total > 0 ? Math.round((pos / total) * 100) : undefined;
        const isAccepted = total >= 2 && pct !== undefined && (pct >= 75 || pct <= 25);
        return {
          id: claim.id,
          title: claim.title,
          kind: claim.kind,
          overallPercent: pct,
          agreeCount: pos,
          disagreeCount: neg,
          voteTarget: { claimId: claim.id, spaceId: claim.spaceId, title: claim.title, entity: claim.entity },
          meta: total > 0 ? [`${total.toLocaleString('en-US')} ${total === 1 ? 'vote' : 'votes'}`] : undefined,
          split: {
            rows:
              total > 0 && pct !== undefined
                ? [
                    {
                      id: claim.spaceId,
                      label: voteCounts.labelFor(claim.spaceId, spaceLabel),
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
          href: claim.href,
        };
      })
      .sort((a, b) => (b.split.totalVotes ?? 0) - (a.split.totalVotes ?? 0));

    // Topic pills with circular images
    const topicMediaByHex = topicMediaQuery.data;
    const topics: ClaimTopicPillModel[] = topicRelations.map(rel => {
      const hex = ID.uuidToHex(rel.toEntity.id);
      return {
        id: rel.toEntity.id,
        label: rel.toEntity.name ?? rel.toEntity.id,
        imageUrl: topicMediaByHex?.get(hex) ?? null,
        href: NavUtils.toEntity(rel.toSpaceId ?? spaceId, rel.toEntity.id),
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

    const graphConnections = extractGraphConnections(entity, spaceId, [
      TEMPLATE_ONTOLOGY.TOPICS_PROPERTY_ID,
      TEMPLATE_ONTOLOGY.PUBLISHER_PROPERTY_ID,
      TEMPLATE_ONTOLOGY.AUTHORS_PROPERTY_ID,
      TEMPLATE_ONTOLOGY.RELATED_CLAIMS_PROPERTY_ID,
      TEMPLATE_ONTOLOGY.NOTABLE_CLAIMS_PROPERTY_ID,
      TEMPLATE_ONTOLOGY.TOPIC_CLAIMS_PROPERTY_ID,
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
      topics: topics.length > 0 ? topics : undefined,
      metadata,
      graphConnections: graphConnections.length > 0 ? graphConnections : undefined,
      contextByEntityId: buildEntityContextMap(entity.id, flags),
      supportedClaims,
      sections,
    };
  }, [
    citingStories,
    combinedClaimSeeds,
    entity,
    voteCounts,
    serverCoverUrl,
    sourceQuotes,
    viewerQuotes,
    space?.entity?.name,
    spaceId,
    topicMediaQuery.data,
    topicRelations,
  ]);

  const isSectionsLoading = useInitialHydrationGate(
    !isMounted ||
      isCitingClaimsLoading ||
      isQuotesLoading ||
      isStoriesLoading ||
      (outgoingClaimIds.length > 0 && isOutgoingClaimsLoading),
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
