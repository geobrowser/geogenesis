'use client';

import * as React from 'react';

import { useSpace } from '~/core/hooks/use-space';
import { ID } from '~/core/id';
import { claimResponseTargetKey } from '~/core/responses/claim-response-summaries';
import { useClaimResponseSummaryBatch } from '~/core/responses/use-claim-response-summaries';
import { useQueryEntities, useQueryEntity } from '~/core/sync/use-store';
import type { Entity } from '~/core/types';
import { Entities } from '~/core/utils/entity';
import { resolveEntitySpaceId } from '~/core/utils/space/entity-home-space';
import { NavUtils } from '~/core/utils/utils';

import type {
  BreadcrumbItem,
  ClaimSummaryModel,
  PodcastEpisodeTemplateModel,
  PodcastPersonModel,
  PodcastPlatformLinkModel,
  PodcastTopicChipModel,
  SourceQuoteModel,
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
  resolveTemplateImageUrl,
} from '../ontology';
import { formatPodcastDuration } from '../views/podcast-shared';
import { useLiveEntityActions } from './use-live-entity-actions';

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
 * Live Geo adapter for `PodcastEpisodeTemplate` (`TEMPLATE_ONTOLOGY.EPISODE_TYPE_ID`).
 *
 * Hydrates episode artwork, parent Podcast Show (with fallback artwork), air date, duration,
 * episode number, direct audio stream URL, Topics, Notable claims (with live vote splits via
 * `useClaimResponseSummaryBatch`), Notable quotes, Hosts, Guests, Contributors (with portraits),
 * Listen on platform links, Context, Flags, and `useMutate` actions.
 */
export function useLivePodcastEpisodeTemplate({
  entityId,
  spaceId,
  serverCoverUrl,
}: {
  entityId: string;
  spaceId: string;
  serverCoverUrl?: string | null;
}): TemplateDataSource<PodcastEpisodeTemplateModel> {
  const { entity, isLoading } = useQueryEntity({ id: entityId, spaceId });
  const { space } = useSpace(spaceId);

  const podcastRelations = React.useMemo(
    () => readEntityRelations(entity, TEMPLATE_ONTOLOGY.PODCAST_PROPERTY_ID),
    [entity]
  );
  const hostRelations = React.useMemo(() => readEntityRelations(entity, TEMPLATE_ONTOLOGY.HOSTS_PROPERTY_ID), [entity]);
  const guestRelations = React.useMemo(
    () => readEntityRelations(entity, TEMPLATE_ONTOLOGY.GUESTS_PROPERTY_ID),
    [entity]
  );
  const contributorRelations = React.useMemo(
    () => readEntityRelations(entity, TEMPLATE_ONTOLOGY.CONTRIBUTORS_PROPERTY_ID),
    [entity]
  );
  const listenOnRelations = React.useMemo(
    () => readEntityRelations(entity, TEMPLATE_ONTOLOGY.LISTEN_ON_PROPERTY_ID),
    [entity]
  );
  const avatarRelations = React.useMemo(
    () => readEntityRelations(entity, TEMPLATE_ONTOLOGY.AVATAR_PROPERTY_ID),
    [entity]
  );
  const claimRelations = React.useMemo(
    () =>
      readEntityRelations(entity, [
        TEMPLATE_ONTOLOGY.NOTABLE_CLAIMS_PROPERTY_ID,
        TEMPLATE_ONTOLOGY.RELATED_CLAIMS_PROPERTY_ID,
      ]),
    [entity]
  );
  const quoteRelations = React.useMemo(
    () => readEntityRelations(entity, TEMPLATE_ONTOLOGY.QUOTES_PROPERTY_ID),
    [entity]
  );

  // Batch 1: hydrate Episode's Avatar, parent Podcast Show, Hosts, Guests, Contributors, and Listen on relation entities
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
    for (const rel of podcastRelations) push(rel.toEntity.id);
    for (const rel of hostRelations) push(rel.toEntity.id);
    for (const rel of guestRelations) push(rel.toEntity.id);
    for (const rel of contributorRelations) push(rel.toEntity.id);
    for (const rel of listenOnRelations) {
      push(rel.entityId);
      push(rel.toEntity.id);
    }
    for (const rel of claimRelations.slice(0, 40)) {
      push(rel.toEntity.id);
    }
    return ids;
  }, [
    avatarRelations,
    claimRelations,
    contributorRelations,
    guestRelations,
    hostRelations,
    listenOnRelations,
    podcastRelations,
  ]);

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

  // Batch 2: hydrate Avatar Image entities for the parent Show, Hosts, Guests, and Contributors
  const secondHopAvatarIds = React.useMemo(() => {
    const seen = new Set<string>();
    const ids: string[] = [];
    const inspect = (targetId: string) => {
      const targetEntity = firstHopById.get(ID.uuidToHex(targetId));
      const avRel = readEntityRelations(targetEntity, TEMPLATE_ONTOLOGY.AVATAR_PROPERTY_ID)[0];
      if (!avRel) return;
      const hex = ID.uuidToHex(avRel.toEntity.id);
      if (seen.has(hex) || firstHopById.has(hex)) return;
      seen.add(hex);
      ids.push(avRel.toEntity.id);
    };

    for (const rel of podcastRelations) inspect(rel.toEntity.id);
    for (const rel of hostRelations) inspect(rel.toEntity.id);
    for (const rel of guestRelations) inspect(rel.toEntity.id);
    for (const rel of contributorRelations) inspect(rel.toEntity.id);
    return ids;
  }, [contributorRelations, firstHopById, guestRelations, hostRelations, podcastRelations]);

  const secondHopWhere = React.useMemo(() => ({ id: { in: secondHopAvatarIds } }), [secondHopAvatarIds]);
  const { entities: secondHopEntities } = useQueryEntities({
    where: secondHopWhere,
    first: Math.max(secondHopAvatarIds.length, 1),
    enabled: secondHopAvatarIds.length > 0,
  });

  const hydratedById = React.useMemo(() => {
    const map = new Map<string, Entity>(firstHopById);
    for (const item of secondHopEntities) map.set(ID.uuidToHex(item.id), item);
    return map;
  }, [firstHopById, secondHopEntities]);

  // Batch-fetch live vote summaries for all Notable claims on this episode
  const claimBatchTargets = React.useMemo(
    () => claimRelations.slice(0, 40).map(rel => ({ entityId: rel.toEntity.id, responseKind: 'stance' as const })),
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
    ownerKind: 'episode',
  });

  const model = React.useMemo<PodcastEpisodeTemplateModel | null>(() => {
    if (!entity) return null;

    const title = entity.name ?? entity.id;
    const spaceLabel = space?.entity?.name?.trim() || 'Everyone';

    const showRel = podcastRelations[0];
    const showEntity = showRel ? hydratedById.get(ID.uuidToHex(showRel.toEntity.id)) : undefined;
    const showSpaceId = showEntity ? resolveEntitySpaceId(showEntity, spaceId) : (showRel?.toSpaceId ?? spaceId);
    const showArtwork = readAvatarUrlFromEntity(showEntity, hydratedById);
    const show = showRel?.toEntity.name
      ? {
          id: showRel.toEntity.id,
          name: showRel.toEntity.name.trim(),
          artworkUrl: showArtwork,
          href: NavUtils.toEntity(showSpaceId, showRel.toEntity.id),
        }
      : undefined;

    const artworkUrl =
      readAvatarUrlFromEntity(entity, hydratedById) ??
      resolveTemplateImageUrl(Entities.cover(entity.relations)) ??
      resolveTemplateImageUrl(serverCoverUrl) ??
      showArtwork;

    const airDate = formatOntologyDate(readEntityTextValue(entity, TEMPLATE_ONTOLOGY.AIR_DATE_PROPERTY_ID));
    const durationRaw = readEntityTextValue(entity, TEMPLATE_ONTOLOGY.DURATION_PROPERTY_ID);
    const durationSec = durationRaw ? Number(durationRaw) : undefined;
    const durationLabel = formatPodcastDuration(durationSec);

    const episodeNumRaw = readEntityTextValue(entity, TEMPLATE_ONTOLOGY.EPISODE_NUMBER_PROPERTY_ID);
    const parsedNum = episodeNumRaw ? Number(episodeNumRaw) : NaN;
    const episodeNumber = Number.isFinite(parsedNum) && parsedNum > 0 ? Math.round(parsedNum) : undefined;

    const audioUrl = readEntityTextValue(entity, TEMPLATE_ONTOLOGY.AUDIO_URL_PROPERTY_ID) ?? undefined;

    // Topics (deduplicated by normalized name, sorted alphabetically)
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

    // Notable claims with live vote summaries, real Factual/Judgment kinds, and inline Agree/Disagree voting
    const claims: ClaimSummaryModel[] = claimRelations
      .map(rel => {
        const claimTitle = rel.toEntity.name?.trim();
        if (!claimTitle) return null;
        const claimHex = ID.uuidToHex(rel.toEntity.id);
        const claimEntity = hydratedById.get(claimHex);
        const summary = responseBatch.data?.get(
          claimResponseTargetKey({ entityId: rel.toEntity.id, responseKind: 'stance' })
        );
        const pos = summary?.counts.positive ?? 0;
        const neg = summary?.counts.negative ?? 0;
        // The space the row links to and votes in, so a vote shows on the claim's own page.
        const claimSpaceId = claimEntity ? resolveEntitySpaceId(claimEntity, spaceId) : (rel.toSpaceId ?? spaceId);
        const total = pos + neg;
        const pct = total > 0 ? Math.round((pos / total) * 100) : 0;
        const isAccepted = total >= 2 && (pct >= 75 || pct <= 25);

        return {
          id: rel.toEntity.id,
          title: claimTitle,
          kind: readClaimKind(claimEntity?.values),
          overallPercent: total > 0 ? pct : undefined,
          agreeCount: pos,
          disagreeCount: neg,
          voteTarget: {
            claimId: rel.toEntity.id,
            spaceId: claimSpaceId,
            title: claimTitle,
            entity: claimEntity ?? null,
          },
          split: {
            rows:
              total > 0
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
          href: NavUtils.toEntity(claimSpaceId, rel.toEntity.id),
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)
      .sort((a, b) => (b.split.totalVotes ?? 0) - (a.split.totalVotes ?? 0));

    // Notable quotes
    const quotes: SourceQuoteModel[] = quoteRelations
      .map(rel => {
        const text = rel.toEntity.name?.trim();
        if (!text) return null;
        return {
          id: rel.toEntity.id,
          text,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);

    const buildPeople = (rels: typeof hostRelations, role: 'Host' | 'Guest' | 'Contributor'): PodcastPersonModel[] =>
      rels
        .map(rel => {
          const name = rel.toEntity.name?.trim();
          if (!name) return null;
          const personEntity = hydratedById.get(ID.uuidToHex(rel.toEntity.id));
          const personSpace = personEntity ? resolveEntitySpaceId(personEntity, spaceId) : (rel.toSpaceId ?? spaceId);
          return {
            id: rel.toEntity.id,
            name,
            avatarUrl: readAvatarUrlFromEntity(personEntity, hydratedById),
            role,
            href: NavUtils.toEntity(personSpace, rel.toEntity.id),
          };
        })
        .filter((item): item is NonNullable<typeof item> => item !== null)
        .sort((a, b) => a.name.localeCompare(b.name));

    const hosts = buildPeople(hostRelations, 'Host');
    const guests = buildPeople(guestRelations, 'Guest');
    const contributors = buildPeople(contributorRelations, 'Contributor');

    // Listen on platforms (read deep link from relation entity Website property)
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

    const breadcrumbs: BreadcrumbItem[] = [
      ...(space?.entity?.name ? [{ id: spaceId, label: space.entity.name, href: NavUtils.toSpace(spaceId) }] : []),
      ...(show ? [{ id: show.id, label: show.name, href: show.href }] : []),
      { id: entity.id, label: title },
    ];

    const graphConnections = extractGraphConnections(entity, spaceId, [
      TEMPLATE_ONTOLOGY.PODCAST_PROPERTY_ID,
      TEMPLATE_ONTOLOGY.HOSTS_PROPERTY_ID,
      TEMPLATE_ONTOLOGY.GUESTS_PROPERTY_ID,
      TEMPLATE_ONTOLOGY.CONTRIBUTORS_PROPERTY_ID,
      TEMPLATE_ONTOLOGY.TOPICS_PROPERTY_ID,
      TEMPLATE_ONTOLOGY.LISTEN_ON_PROPERTY_ID,
      TEMPLATE_ONTOLOGY.NOTABLE_CLAIMS_PROPERTY_ID,
      TEMPLATE_ONTOLOGY.RELATED_CLAIMS_PROPERTY_ID,
      TEMPLATE_ONTOLOGY.QUOTES_PROPERTY_ID,
      TEMPLATE_ONTOLOGY.AVATAR_PROPERTY_ID,
    ]);
    const flags = extractEntityFlags(entity, spaceId);

    return {
      id: entity.id,
      title,
      artworkUrl,
      breadcrumbs,
      show,
      airDate,
      durationLabel,
      episodeNumber,
      audioUrl,
      description: entity.description?.trim() || undefined,
      topics,
      claims,
      quotes,
      hosts,
      guests,
      contributors: contributors.length > 0 ? contributors : undefined,
      listenOn,
      graphConnections,
      contextByEntityId: buildEntityContextMap(entity.id, flags),
    };
  }, [
    claimRelations,
    contributorRelations,
    entity,
    guestRelations,
    hostRelations,
    hydratedById,
    listenOnRelations,
    podcastRelations,
    quoteRelations,
    responseBatch.data,
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
