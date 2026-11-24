'use client';

import type { TypedDocumentNode } from '@graphql-typed-document-node/core';
import { useInfiniteQuery } from '@tanstack/react-query';

import * as React from 'react';

import { Effect } from 'effect';
import { parse } from 'graphql';

import { useSpace } from '~/core/hooks/use-space';
import { ID } from '~/core/id';
import { graphql } from '~/core/io/graphql-client';
import { useQueryEntities, useQueryEntity } from '~/core/sync/use-store';
import type { Entity } from '~/core/types';
import { Entities } from '~/core/utils/entity';
import { resolveEntitySpaceId } from '~/core/utils/space/entity-home-space';
import { NavUtils } from '~/core/utils/utils';

import type {
  BreadcrumbItem,
  PodcastEpisodeSummaryModel,
  PodcastPersonModel,
  PodcastPlatformLinkModel,
  PodcastShowTemplateModel,
  PodcastTopicChipModel,
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
  resolveTemplateImageUrl,
} from '../ontology';
import { formatPodcastDuration } from '../views/podcast-shared';
import { useLiveEntityActions } from './use-live-entity-actions';

const EPISODES_FETCH_PAGE_SIZE = 30;

interface ShowEpisodesQueryNode {
  id: string;
  name?: string | null;
  description?: string | null;
  spaceIds?: string[] | null;
  valuesList?:
    | {
        propertyId: string;
        text?: string | null;
        float?: number | null;
        datetime?: string | null;
      }[]
    | null;
  relationsList?:
    | {
        typeId: string;
        toEntityId: string;
        toEntity?: {
          id: string;
          valuesList?: { propertyId: string; text?: string | null }[] | null;
        } | null;
      }[]
    | null;
}

interface ShowEpisodesQueryData {
  entitiesConnection?: {
    totalCount: number;
    pageInfo?: { hasNextPage: boolean; endCursor?: string | null } | null;
    nodes?: ShowEpisodesQueryNode[] | null;
  } | null;
}

const SHOW_EPISODES_QUERY = parse(/* GraphQL */ `
  query PodcastShowEpisodes(
    $episodeTypeId: UUID!
    $podcastPropertyId: UUID!
    $showId: UUID!
    $spaceIds: [UUID!]
    $avatarPropertyId: UUID!
    $first: Int!
    $after: Cursor
  ) {
    entitiesConnection(
      first: $first
      after: $after
      orderBy: [CREATED_AT_DESC, ID_DESC]
      filter: {
        typeIds: { in: [$episodeTypeId] }
        spaceIds: { overlaps: $spaceIds }
        relations: { some: { typeId: { is: $podcastPropertyId }, toEntityId: { is: $showId } } }
      }
    ) {
      totalCount
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        id
        name
        description
        spaceIds
        valuesList(first: 15) {
          propertyId
          text
          float
          datetime
        }
        relationsList(first: 4, filter: { typeId: { is: $avatarPropertyId } }) {
          typeId
          toEntityId
          toEntity {
            id
            valuesList(first: 5) {
              propertyId
              text
            }
          }
        }
      }
    }
  }
`) as TypedDocumentNode<
  ShowEpisodesQueryData,
  {
    episodeTypeId: string;
    podcastPropertyId: string;
    showId: string;
    spaceIds: string[];
    avatarPropertyId: string;
    first: number;
    after?: string | null;
  }
>;

function fallbackPlatformUrl(name: string): string | null {
  const lower = name.toLowerCase();
  if (lower.includes('spotify')) return 'https://open.spotify.com';
  if (lower.includes('apple')) return 'https://podcasts.apple.com';
  return null;
}

function readAvatarUrlFromEntity(entity: Entity | undefined, imageEntitiesById: Map<string, Entity>): string | null {
  if (!entity) return null;
  const direct = Entities.avatar(entity.relations);
  if (direct) return resolveTemplateImageUrl(direct);

  const avatarRel = readEntityRelations(entity, TEMPLATE_ONTOLOGY.AVATAR_PROPERTY_ID)[0];
  if (!avatarRel) return null;
  const directVal = avatarRel.toEntity.value;
  if (directVal && (directVal.startsWith('ipfs://') || directVal.startsWith('http'))) {
    return resolveTemplateImageUrl(directVal);
  }
  const imageEntity = imageEntitiesById.get(ID.uuidToHex(avatarRel.toEntity.id));
  const rawUrl = readEntityTextValue(imageEntity, TEMPLATE_ONTOLOGY.IMAGE_URL_PROPERTY_ID);
  return resolveTemplateImageUrl(rawUrl);
}

/**
 * Live Geo adapter for `PodcastShowTemplate` (`TEMPLATE_ONTOLOGY.PODCAST_TYPE_ID`).
 *
 * Hydrates show artwork, description, date founded, RSS feed, Topics, Hosts (with circular
 * avatars), Listen on platform deep links (via relation entity `Website` values), paginated live
 * Episodes (`entitiesConnection` filtered by `Podcast` relation), Context, Flags, and `useMutate`
 * actions.
 */
export function useLivePodcastShowTemplate({
  entityId,
  spaceId,
  serverCoverUrl,
}: {
  entityId: string;
  spaceId: string;
  serverCoverUrl?: string | null;
}): TemplateDataSource<PodcastShowTemplateModel> {
  const { entity, isLoading } = useQueryEntity({ id: entityId, spaceId });
  const { space } = useSpace(spaceId);

  const hostRelations = React.useMemo(() => readEntityRelations(entity, TEMPLATE_ONTOLOGY.HOSTS_PROPERTY_ID), [entity]);
  const listenOnRelations = React.useMemo(
    () => readEntityRelations(entity, TEMPLATE_ONTOLOGY.LISTEN_ON_PROPERTY_ID),
    [entity]
  );
  const avatarRelations = React.useMemo(
    () => readEntityRelations(entity, TEMPLATE_ONTOLOGY.AVATAR_PROPERTY_ID),
    [entity]
  );

  // Batch 1: hydrate Show's Avatar image entity, Host person entities, and Listen on relation entities
  const firstHopIds = React.useMemo(() => {
    const seen = new Set<string>();
    const ids: string[] = [];
    const push = (id: string | null | undefined) => {
      if (!id) return;
      const hex = ID.uuidToHex(id);
      if (seen.has(hex)) return;
      seen.add(hex);
      ids.push(id);
    };
    for (const rel of avatarRelations) push(rel.toEntity.id);
    for (const rel of hostRelations) push(rel.toEntity.id);
    for (const rel of listenOnRelations) {
      push(rel.entityId);
      push(rel.toEntity.id);
    }
    return ids;
  }, [avatarRelations, hostRelations, listenOnRelations]);

  const firstHopWhere = React.useMemo(() => ({ id: { in: firstHopIds } }), [firstHopIds]);
  const { entities: firstHopEntities } = useQueryEntities({
    where: firstHopWhere,
    first: Math.max(firstHopIds.length, 1),
    enabled: firstHopIds.length > 0,
  });

  const firstHopById = React.useMemo(() => {
    const map = new Map<string, Entity>();
    for (const item of firstHopEntities) map.set(ID.uuidToHex(item.id), item);
    return map;
  }, [firstHopEntities]);

  // Batch 2: hydrate Host avatar Image entities so host portraits resolve cleanly
  const hostAvatarIds = React.useMemo(() => {
    const seen = new Set<string>();
    const ids: string[] = [];
    for (const rel of hostRelations) {
      const hostEntity = firstHopById.get(ID.uuidToHex(rel.toEntity.id));
      const avRel = readEntityRelations(hostEntity, TEMPLATE_ONTOLOGY.AVATAR_PROPERTY_ID)[0];
      if (!avRel) continue;
      const hex = ID.uuidToHex(avRel.toEntity.id);
      if (seen.has(hex) || firstHopById.has(hex)) continue;
      seen.add(hex);
      ids.push(avRel.toEntity.id);
    }
    return ids;
  }, [hostRelations, firstHopById]);

  const hostAvatarWhere = React.useMemo(() => ({ id: { in: hostAvatarIds } }), [hostAvatarIds]);
  const { entities: hostAvatarEntities } = useQueryEntities({
    where: hostAvatarWhere,
    first: Math.max(hostAvatarIds.length, 1),
    enabled: hostAvatarIds.length > 0,
  });

  const hydratedById = React.useMemo(() => {
    const map = new Map<string, Entity>(firstHopById);
    for (const item of hostAvatarEntities) map.set(ID.uuidToHex(item.id), item);
    return map;
  }, [firstHopById, hostAvatarEntities]);

  // Paginated Episodes belonging to this Podcast Show, only those in the viewed space
  const episodesQuery = useInfiniteQuery({
    queryKey: ['podcast-show-episodes', ID.uuidToHex(entityId), ID.uuidToHex(spaceId)],
    enabled: Boolean(entityId),
    initialPageParam: null as string | null,
    staleTime: 60_000,
    queryFn: async ({ pageParam }) => {
      return Effect.runPromise(
        graphql({
          query: SHOW_EPISODES_QUERY,
          variables: {
            episodeTypeId: TEMPLATE_ONTOLOGY.EPISODE_TYPE_ID,
            podcastPropertyId: TEMPLATE_ONTOLOGY.PODCAST_PROPERTY_ID,
            showId: ID.uuidToHex(entityId),
            spaceIds: [ID.uuidToHex(spaceId)],
            avatarPropertyId: TEMPLATE_ONTOLOGY.AVATAR_PROPERTY_ID,
            first: EPISODES_FETCH_PAGE_SIZE,
            after: pageParam ?? undefined,
          },
          decoder: data => data.entitiesConnection ?? { totalCount: 0, pageInfo: null, nodes: [] },
        })
      );
    },
    getNextPageParam: lastPage =>
      lastPage.pageInfo?.hasNextPage ? (lastPage.pageInfo.endCursor ?? undefined) : undefined,
  });

  const actionCallbacks = useLiveEntityActions({
    entityId,
    entityName: entity?.name ?? entityId,
    spaceId,
    entity,
    ownerKind: 'podcast',
  });

  const fetchNextPage = episodesQuery.fetchNextPage;
  const hasNextPage = Boolean(episodesQuery.hasNextPage);
  const isFetchingNextPage = episodesQuery.isFetchingNextPage;

  const model = React.useMemo<PodcastShowTemplateModel | null>(() => {
    if (!entity) return null;

    const title = entity.name ?? entity.id;
    const artworkUrl =
      readAvatarUrlFromEntity(entity, hydratedById) ??
      resolveTemplateImageUrl(Entities.cover(entity.relations)) ??
      resolveTemplateImageUrl(serverCoverUrl);

    const foundedRaw = readEntityTextValue(entity, TEMPLATE_ONTOLOGY.DATE_FOUNDED_PROPERTY_ID);
    const foundedYear = foundedRaw ? new Date(foundedRaw).getUTCFullYear() : NaN;
    const dateRange = Number.isFinite(foundedYear) && foundedYear > 1900 ? `${foundedYear} – present` : undefined;
    const rssFeedUrl = readEntityTextValue(entity, TEMPLATE_ONTOLOGY.RSS_FEED_URL_PROPERTY_ID) ?? undefined;

    // Topics (deduplicated by normalized name)
    const seenTopicNames = new Set<string>();
    const topics: PodcastTopicChipModel[] = [];
    for (const rel of readEntityRelations(entity, TEMPLATE_ONTOLOGY.TOPICS_PROPERTY_ID)) {
      const label = rel.toEntity.name?.trim();
      if (!label) continue;
      const key = label.toLowerCase();
      if (seenTopicNames.has(key)) continue;
      seenTopicNames.add(key);
      topics.push({
        id: rel.toEntity.id,
        label,
        href: NavUtils.toEntity(rel.toSpaceId ?? spaceId, rel.toEntity.id),
      });
    }
    topics.sort((a, b) => a.label.localeCompare(b.label));

    // Hosts (sorted alphabetically, hydrated with avatar portraits)
    const hosts: PodcastPersonModel[] = hostRelations
      .map(rel => {
        const name = rel.toEntity.name?.trim();
        if (!name) return null;
        const hostEntity = hydratedById.get(ID.uuidToHex(rel.toEntity.id));
        const hostSpace = hostEntity ? resolveEntitySpaceId(hostEntity, spaceId) : (rel.toSpaceId ?? spaceId);
        return {
          id: rel.toEntity.id,
          name,
          avatarUrl: readAvatarUrlFromEntity(hostEntity, hydratedById),
          role: 'Host' as const,
          href: NavUtils.toEntity(hostSpace, rel.toEntity.id),
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)
      .sort((a, b) => a.name.localeCompare(b.name));

    // Listen on platforms (read URL from relation entity Website property)
    const listenOn: PodcastPlatformLinkModel[] = [];
    for (const rel of listenOnRelations) {
      const name = rel.toEntity.name?.trim();
      if (!name) continue;
      const relEntity = hydratedById.get(ID.uuidToHex(rel.entityId));
      const targetEntity = hydratedById.get(ID.uuidToHex(rel.toEntity.id));
      const url =
        readEntityTextValue(relEntity, TEMPLATE_ONTOLOGY.WEBSITE_PROPERTY_ID) ??
        readEntityTextValue(relEntity, TEMPLATE_ONTOLOGY.WEB_URL_PROPERTY_ID) ??
        readEntityTextValue(targetEntity, TEMPLATE_ONTOLOGY.WEBSITE_PROPERTY_ID) ??
        fallbackPlatformUrl(name);
      if (!url) continue;
      listenOn.push({ id: rel.id, name, url });
    }

    // Episodes from GraphQL pages, deduplicated & sorted newest airDate first
    const pages = episodesQuery.data?.pages ?? [];
    const totalCount = pages[0]?.totalCount ?? 0;
    const seenEpHex = new Set<string>();
    const episodes: PodcastEpisodeSummaryModel[] = [];

    for (const page of pages) {
      for (const node of page.nodes ?? []) {
        if (!node.name?.trim()) continue;
        const hex = ID.uuidToHex(node.id);
        if (seenEpHex.has(hex)) continue;
        seenEpHex.add(hex);

        const values = node.valuesList ?? [];
        const airVal = values.find(v => ID.equals(v.propertyId, TEMPLATE_ONTOLOGY.AIR_DATE_PROPERTY_ID));
        const airRaw = airVal?.datetime ?? airVal?.text ?? null;
        const airDateTs = airRaw ? Date.parse(airRaw) : 0;

        const durVal = values.find(v => ID.equals(v.propertyId, TEMPLATE_ONTOLOGY.DURATION_PROPERTY_ID));
        const durationSec =
          typeof durVal?.float === 'number' ? durVal.float : durVal?.text ? Number(durVal.text) : undefined;

        const numVal = values.find(v => ID.equals(v.propertyId, TEMPLATE_ONTOLOGY.EPISODE_NUMBER_PROPERTY_ID));
        const epNum = typeof numVal?.float === 'number' ? Math.round(numVal.float) : undefined;

        const avRel = (node.relationsList ?? []).find(r => ID.equals(r.typeId, TEMPLATE_ONTOLOGY.AVATAR_PROPERTY_ID));
        const avUrlVal = avRel?.toEntity?.valuesList?.find(v =>
          ID.equals(v.propertyId, TEMPLATE_ONTOLOGY.IMAGE_URL_PROPERTY_ID)
        );
        const epArtwork = resolveTemplateImageUrl(avUrlVal?.text);
        const epSpaceId = node.spaceIds?.includes(spaceId) ? spaceId : (node.spaceIds?.[0] ?? spaceId);

        episodes.push({
          id: node.id,
          title: node.name.trim(),
          showName: title,
          description: node.description?.trim() || undefined,
          airDate: formatOntologyDate(airRaw),
          airDateTs: Number.isFinite(airDateTs) ? airDateTs : 0,
          durationLabel: formatPodcastDuration(durationSec),
          episodeNumber: epNum,
          artworkUrl: epArtwork,
          href: NavUtils.toEntity(epSpaceId, node.id),
        });
      }
    }

    episodes.sort((a, b) => (b.airDateTs ?? 0) - (a.airDateTs ?? 0));

    const breadcrumbs: BreadcrumbItem[] = [
      ...(space?.entity?.name ? [{ id: spaceId, label: space.entity.name, href: NavUtils.toSpace(spaceId) }] : []),
      { id: entity.id, label: title },
    ];

    const graphConnections = extractGraphConnections(entity, spaceId, [
      TEMPLATE_ONTOLOGY.HOSTS_PROPERTY_ID,
      TEMPLATE_ONTOLOGY.TOPICS_PROPERTY_ID,
      TEMPLATE_ONTOLOGY.LISTEN_ON_PROPERTY_ID,
      TEMPLATE_ONTOLOGY.AVATAR_PROPERTY_ID,
    ]);
    const flags = extractEntityFlags(entity, spaceId);

    return {
      id: entity.id,
      title,
      artworkUrl,
      breadcrumbs,
      description: entity.description?.trim() || undefined,
      episodeCount: totalCount > 0 ? totalCount : episodes.length,
      dateRange,
      rssFeedUrl,
      topics,
      episodes,
      hasMoreEpisodes: hasNextPage,
      isLoadingMoreEpisodes: isFetchingNextPage,
      onLoadMoreEpisodes: () => {
        void fetchNextPage();
      },
      hosts,
      listenOn,
      graphConnections,
      contextByEntityId: buildEntityContextMap(entity.id, flags),
    };
  }, [
    entity,
    episodesQuery.data?.pages,
    fetchNextPage,
    hasNextPage,
    hostRelations,
    hydratedById,
    isFetchingNextPage,
    listenOnRelations,
    serverCoverUrl,
    space?.entity?.name,
    spaceId,
  ]);

  return {
    data: model,
    isLoading,
    source: 'live',
    actionCallbacks,
  };
}
