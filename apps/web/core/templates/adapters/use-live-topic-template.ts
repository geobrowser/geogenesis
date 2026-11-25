'use client';

import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';

import * as React from 'react';

import { CLAIM_TYPE_ID } from '~/core/claims/ontology';
import { CURATED_TOPIC_TAG_ID, NEWS_STORY_TYPE_ID, TAG_PROPERTY_ID, TOPIC_TYPE_ID } from '~/core/constants';
import { DEBATE_TYPE_ID } from '~/core/debates/ontology';
import type { ExploreFeedItem } from '~/core/explore/explore-card-item';
import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { ID } from '~/core/id';
import { useQueryEntities, useQueryEntity } from '~/core/sync/use-store';
import { useTopicAncestors } from '~/core/topics/browse/use-topic-ancestors';
import { useTopicConnectionCounts } from '~/core/topics/browse/use-topic-connection-counts';
import { type TopicCoveragePage, useTopicCoverage } from '~/core/topics/browse/use-topic-coverage';
import { useTopicLinkedEntities } from '~/core/topics/browse/use-topic-linked-entities';
import type { Entity } from '~/core/types';
import { Entities } from '~/core/utils/entity';
import { normId } from '~/core/utils/norm-id';
import { resolveEntitySpaceId } from '~/core/utils/space/entity-home-space';
import { NavUtils } from '~/core/utils/utils';

import {
  type BreadcrumbItem,
  type ClaimKind,
  type ClaimSummaryModel,
  type ClaimVoteTarget,
  type EntityLinkKind,
  type EntityLinkRowModel,
  type EntityListSectionModel,
  type SourceMediaKind,
  type SplitRow,
  type TemplateDataSource,
  type TopicRecentDebateModel,
  type TopicStatModel,
  type TopicTemplateModel,
  type TopicTimelineHighlightModel,
  type VoteChoice,
  formatCompactCount,
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
  resolvePostAuthor,
  resolveTemplateImageUrl,
} from '../ontology';
import {
  type FrozenClaimOrder,
  applyFrozenClaimOrder,
  claimOrderKey,
  freezeClaimOrder,
  orderClaimsByVotes,
} from './claim-vote-order';
import { debateParticipantsKey, formatUnixSecDate, toDebateGalleryModel } from './debate-gallery-model';
import { agendaClaimsForTopic, useRecentAgendaClaims } from './recent-agenda-claims';
import { topicCoverageIngestionLink } from './source-ingestion-links';
import { aggregateClaimVotes, baselineVoteFor } from './topic-claim-votes';
import {
  LIVE_CLAIMS_LIMIT,
  LIVE_COVERAGE_LIMIT,
  TOPIC_CLAIM_VOTES_QUERY_PREFIX,
  TOPIC_FEED_STALE_MS,
  type TopicBestDebates,
  buildOrderedClaimSeeds,
  fetchTopicClaimVotes,
  keepTaggedItems,
  topicBestDebatesQueryKey,
  topicClaimVotesQueryKey,
  topicFeedDebates as topicFeedDebatesOf,
  topicFeedEntityIds,
  topicFeedSliceQueryKey,
  topicVoteClaimIds,
} from './topic-template-queries';
import { useDebateParticipantsBatch } from './use-debate-participants-batch';
import { fetchPostAuthorMetadata } from './use-hydrated-source-cards';
import { useInitialHydrationGate } from './use-initial-hydration-gate';
import { useLiveEntityActions } from './use-live-entity-actions';
import { useTopicTaggedInSpace } from './use-topic-tagged-in-space';
import { useViewerSpaceId, useViewerTopicSources } from './use-viewer-sources';

/** How long the sections wait, from first render, for the claim vote counts that order the Claims list. */
const CLAIM_VOTES_MAX_WAIT_MS = 4000;
const NO_COVERAGE_ROWS: TopicCoveragePage['rows'] = [];
const NO_ENTITIES: Entity[] = [];
/** How many of the viewer's own personal-space claims or events a Topic reads. */
const VIEWER_ADDED_LIMIT = 8;
/** Rows the Topic Timeline shows. */
const TIMELINE_LIMIT = 8;
/**
 * News events newest `Event date` first, read on the server. Last update would rank by when anyone
 * last touched an event, which surfaced year-old events over last week's. Events without a date come
 * after every dated one.
 */
const EVENTS_BY_DATE_SORT = {
  propertyId: TEMPLATE_ONTOLOGY.EVENT_DATE_PROPERTY_ID,
  direction: 'desc',
  dataType: 'datetime',
  includeWithoutValue: true,
} as const;

async function fetchTopicFeedSlice({
  topicId,
  spaceId,
  typeId,
  sort = 'best',
  endpoint = 'topic',
  signal,
}: {
  topicId: string;
  spaceId: string;
  typeId: string;
  sort?: 'best' | 'top';
  endpoint?: 'topic' | 'space';
  signal?: AbortSignal;
}): Promise<ExploreFeedItem[]> {
  const params = new URLSearchParams(
    endpoint === 'space'
      ? {
          spaceId,
          spaceTopicId: topicId,
          sort,
          typeIds: typeId,
        }
      : {
          topicId,
          spaceId,
          sort,
          typeIds: typeId,
        }
  );
  const path = endpoint === 'space' ? '/api/topics/space/feed' : '/api/topics/feed';
  const response = await fetch(`${path}?${params.toString()}`, {
    credentials: 'include',
    signal,
  });
  if (!response.ok) return [];
  const data = (await response.json()) as { items?: ExploreFeedItem[] };
  return data.items ?? [];
}

function classifyCoverage(
  typeIds: readonly string[],
  typeName: string | null
): { kind: EntityLinkKind; label: string; mediaType: SourceMediaKind } {
  if (typeIds.some(id => ID.equals(id, NEWS_STORY_TYPE_ID))) {
    return { kind: 'news-story', label: typeName ?? 'News story', mediaType: 'article' };
  }
  if (typeIds.some(id => ID.equals(id, TEMPLATE_ONTOLOGY.ARTICLE_TYPE_ID))) {
    return { kind: 'source', label: typeName ?? 'Article', mediaType: 'article' };
  }
  if (typeIds.some(id => ID.equals(id, TEMPLATE_ONTOLOGY.EPISODE_TYPE_ID))) {
    return { kind: 'source', label: typeName ?? 'Podcast', mediaType: 'video' };
  }
  if (
    typeIds.some(id => ID.equals(id, TEMPLATE_ONTOLOGY.TWEET_TYPE_ID) || ID.equals(id, TEMPLATE_ONTOLOGY.POST_TYPE_ID))
  ) {
    return { kind: 'post', label: typeName ?? 'Post', mediaType: 'tweet' };
  }
  if (typeIds.some(id => ID.equals(id, TEMPLATE_ONTOLOGY.DATASET_TYPE_ID))) {
    return { kind: 'source', label: typeName ?? 'Dataset', mediaType: 'dataset' };
  }
  return { kind: 'source', label: typeName ?? 'Document', mediaType: 'document' };
}

/**
 * Live Geo adapter for `TopicTemplate`.
 *
 * Hydrates the full Topic experience from live Geo services:
 * - Best-ranked Claims (via `/api/topics/feed` + `useTopicLinkedEntities` + direct `Claims`),
 *   batch-hydrated for `Is factual` (`Factual`/`Judgment`) and `userVotes` from every voter
 *   (`Disputed` / `Accepted` tabs and interactive inline voting).
 * - Live `Recent debates` horizontal gallery (via `/api/topics/feed` for `DEBATE_TYPE_ID`).
 * - Live `Timeline` of the newest `News events` by `Event date`.
 * - Rich 2-column format-aware `Evidence` media cards (`layout: 'cards'`).
 * - Header stats (`countsByTopicId`), compact clickable `Subtopics` chips, `Context` relation
 *   pills, `Flags` (`Community notes` / `Disclaimer`), and live `useMutate` actions.
 *
 * Every list holds only what the viewed space published: the feeds are scoped to the route space,
 * and the linked-entity, coverage and count reads take it as their only space. Vote counts still
 * include every voter, since votes live in each voter's personal space.
 */
export function useLiveTopicTemplate({
  entityId,
  spaceId,
  serverCoverUrl,
  isSpaceHome = false,
}: {
  entityId: string;
  spaceId: string;
  serverCoverUrl?: string | null;
  /** True when rendered on a Topic Space's own homepage (`/space/[id]`), so debates & news read from `/api/topics/space/feed`. */
  isSpaceHome?: boolean;
}): TemplateDataSource<TopicTemplateModel> {
  const { entity, isLoading: isEntityLoading } = useQueryEntity({ id: entityId, spaceId });
  const { personalSpaceId } = usePersonalSpaceId();
  const spaceIds = React.useMemo(() => [normId(spaceId)], [spaceId]);
  const ancestors = useTopicAncestors(entityId, spaceId);
  const topicIds = React.useMemo(() => [entityId], [entityId]);
  const { countsByTopicId } = useTopicConnectionCounts(topicIds, { spaceId });

  const queryClient = useQueryClient();

  // 1. Top-voted AND Best-ranked Claims and Debates from Geo's topic/space ranking feed
  const topClaimsQuery = useQuery({
    queryKey: topicFeedSliceQueryKey('top-claims', entityId, spaceId),
    queryFn: ({ signal }) =>
      fetchTopicFeedSlice({ topicId: entityId, spaceId, typeId: CLAIM_TYPE_ID, sort: 'top', signal }),
    staleTime: TOPIC_FEED_STALE_MS,
  });

  const bestClaimsQuery = useQuery({
    queryKey: topicFeedSliceQueryKey('best-claims', entityId, spaceId),
    queryFn: ({ signal }) =>
      fetchTopicFeedSlice({ topicId: entityId, spaceId, typeId: CLAIM_TYPE_ID, sort: 'best', signal }),
    staleTime: TOPIC_FEED_STALE_MS,
  });

  const bestDebatesQuery = useQuery({
    queryKey: topicBestDebatesQueryKey(entityId, spaceId, isSpaceHome),
    queryFn: async ({ signal }): Promise<TopicBestDebates> => {
      if (isSpaceHome) {
        const spaceDebates = await fetchTopicFeedSlice({
          topicId: entityId,
          spaceId,
          typeId: DEBATE_TYPE_ID,
          endpoint: 'space',
          signal,
        });
        if (spaceDebates.length > 0) return { items: spaceDebates, fromSpaceFeed: true };
      }
      return {
        items: await fetchTopicFeedSlice({ topicId: entityId, spaceId, typeId: DEBATE_TYPE_ID, signal }),
        fromSpaceFeed: false,
      };
    },
    staleTime: TOPIC_FEED_STALE_MS,
  });

  // The topic feed checks only that an entity lives in the space; keep what the space itself tagged.
  // The space feed lists the space's own items by space, not by tag, so its rows are not checked.
  const topicFeedDebates = topicFeedDebatesOf(bestDebatesQuery.data);
  const feedEntityIds = React.useMemo(
    () => topicFeedEntityIds([topClaimsQuery.data, bestClaimsQuery.data, topicFeedDebates]),
    [bestClaimsQuery.data, topClaimsQuery.data, topicFeedDebates]
  );
  const { tagged: taggedInSpace, isLoading: isTaggedLoading } = useTopicTaggedInSpace({
    topicId: entityId,
    spaceId,
    entityIds: feedEntityIds,
    // One check once every slice has landed, rather than one per slice.
    enabled: !topClaimsQuery.isLoading && !bestClaimsQuery.isLoading && !bestDebatesQuery.isLoading,
  });
  const keepTagged = React.useCallback(
    (items: ExploreFeedItem[] | undefined): ExploreFeedItem[] => keepTaggedItems(items, taggedInSpace, isTaggedLoading),
    [isTaggedLoading, taggedInSpace]
  );
  const topClaims = React.useMemo(() => keepTagged(topClaimsQuery.data), [keepTagged, topClaimsQuery.data]);
  const bestClaims = React.useMemo(() => keepTagged(bestClaimsQuery.data), [bestClaimsQuery.data, keepTagged]);
  const bestDebates = React.useMemo(
    () =>
      bestDebatesQuery.data?.fromSpaceFeed ? bestDebatesQuery.data.items : keepTagged(bestDebatesQuery.data?.items),
    [bestDebatesQuery.data, keepTagged]
  );

  const debateIdsForParticipants = React.useMemo(
    () => bestDebates.slice(0, 8).map(item => item.entityId),
    [bestDebates]
  );
  const debateParticipantsQuery = useDebateParticipantsBatch(debateIdsForParticipants);

  // Fallback / local-sync linked claims & events
  const { entities: linkedClaims } = useTopicLinkedEntities({
    topicId: entityId,
    typeIds: [CLAIM_TYPE_ID],
    first: LIVE_CLAIMS_LIMIT,
    rankInSpaceId: spaceId,
    spaceIds,
    scopeRelationToSpaces: true,
  });

  const { entities: linkedEvents } = useTopicLinkedEntities({
    topicId: entityId,
    typeIds: [TEMPLATE_ONTOLOGY.NEWS_EVENT_TYPE_ID],
    first: TIMELINE_LIMIT,
    sort: EVENTS_BY_DATE_SORT,
    spaceIds,
    scopeRelationToSpaces: true,
  });

  // Sources the viewed space both holds and tagged with this Topic itself.
  const coverage = useTopicCoverage({
    topicId: entityId,
    spaceIds,
    scopeRelationToSpaces: true,
    first: LIVE_COVERAGE_LIMIT,
  });

  // The viewer's own personal-space sources tagged with this Topic, so a non-member who added one sees
  // it (GEO-3819): published ones by a second coverage read scoped to that space alone (skipped when
  // it is the page's space), staged ones from the local store. Only the viewer sees these.
  const viewerSpaceId = useViewerSpaceId(spaceId);
  const viewerCoverageEnabled = viewerSpaceId !== null && !ID.equals(viewerSpaceId, spaceId);
  const viewerCoverage = useTopicCoverage({
    topicId: entityId,
    spaceIds: viewerSpaceId ? [viewerSpaceId] : undefined,
    scopeRelationToSpaces: true,
    first: LIVE_COVERAGE_LIMIT,
    enabled: viewerCoverageEnabled,
  });
  // A disabled query still returns cached or placeholder data: with no viewer space its key is the
  // unscoped coverage key, so read its rows only while it is enabled.
  const viewerCoverageRows = viewerCoverageEnabled ? viewerCoverage.page.rows : NO_COVERAGE_ROWS;
  const viewerLocalSources = useViewerTopicSources(entityId, viewerSpaceId);
  // The viewer's own personal-space claims and events tagged with this Topic, so a non-editor who
  // added one sees it (GEO-3836). Only the viewer sees these.
  const viewerSpaceIds = React.useMemo(() => (viewerSpaceId ? [normId(viewerSpaceId)] : undefined), [viewerSpaceId]);
  const { entities: viewerClaimsRead } = useTopicLinkedEntities({
    topicId: entityId,
    typeIds: [CLAIM_TYPE_ID],
    first: VIEWER_ADDED_LIMIT,
    spaceIds: viewerSpaceIds,
    scopeRelationToSpaces: true,
    enabled: viewerCoverageEnabled,
  });
  const { entities: viewerEventsRead } = useTopicLinkedEntities({
    topicId: entityId,
    typeIds: [TEMPLATE_ONTOLOGY.NEWS_EVENT_TYPE_ID],
    first: VIEWER_ADDED_LIMIT,
    sort: EVENTS_BY_DATE_SORT,
    spaceIds: viewerSpaceIds,
    scopeRelationToSpaces: true,
    enabled: viewerCoverageEnabled,
  });
  const viewerLinkedClaims = viewerCoverageEnabled ? viewerClaimsRead : NO_ENTITIES;
  const viewerLinkedEvents = viewerCoverageEnabled ? viewerEventsRead : NO_ENTITIES;
  const coverageRows = React.useMemo(
    () => (viewerCoverageRows.length > 0 ? [...coverage.page.rows, ...viewerCoverageRows] : coverage.page.rows),
    [coverage.page.rows, viewerCoverageRows]
  );

  // Batch-hydrate Tweet / Post author names, @handles, and avatars for Evidence cards
  const tweetCoverageIds = React.useMemo(() => {
    const ids: string[] = [];
    for (const row of coverageRows) {
      const typeIds = row.types.map(t => t.id);
      if (
        typeIds.some(
          id => ID.equals(id, TEMPLATE_ONTOLOGY.TWEET_TYPE_ID) || ID.equals(id, TEMPLATE_ONTOLOGY.POST_TYPE_ID)
        )
      ) {
        ids.push(ID.uuidToHex(row.entityId));
      }
    }
    return ids;
  }, [coverageRows]);

  const tweetAuthorsQuery = useQuery({
    queryKey: ['live-topic-template', 'tweet-authors', tweetCoverageIds.join(',')],
    enabled: tweetCoverageIds.length > 0,
    staleTime: 120_000,
    // The Post page's own lookup, so a card names the same author and handle as the post's page.
    queryFn: () => fetchPostAuthorMetadata(tweetCoverageIds),
  });

  // Claims from any Debate agenda in the last 21 days lead the list (GEO-3873), read once for every Topic.
  const recentAgendaClaimsQuery = useRecentAgendaClaims();
  const agendaClaims = React.useMemo(
    () => agendaClaimsForTopic(recentAgendaClaimsQuery.data ?? [], entityId, spaceId),
    [entityId, recentAgendaClaimsQuery.data, spaceId]
  );

  const directClaimRels = React.useMemo(
    () => readEntityRelations(entity, TEMPLATE_ONTOLOGY.TOPIC_CLAIMS_PROPERTY_ID),
    [entity]
  );

  // Best order, agenda claims first (GEO-3868, GEO-3873): see `buildOrderedClaimSeeds`.
  const orderedClaimSeeds = React.useMemo(
    () =>
      buildOrderedClaimSeeds({
        spaceId,
        bestClaims,
        topClaims,
        bestDebates,
        linkedClaims,
        directClaimRels,
        agendaClaims,
        viewerLinkedClaims,
      }),
    [agendaClaims, bestClaims, bestDebates, directClaimRels, linkedClaims, spaceId, topClaims, viewerLinkedClaims]
  );

  // Batch-hydrate claim entities that came from `/api/topics/feed` so we read their real `Is factual` value
  const claimIdsToHydrate = React.useMemo(
    () => orderedClaimSeeds.filter(c => c.kind === undefined).map(c => c.id),
    [orderedClaimSeeds]
  );
  const hydrateClaimsWhere = React.useMemo(() => ({ id: { in: claimIdsToHydrate } }), [claimIdsToHydrate]);
  const { entities: hydratedClaimEntities } = useQueryEntities({
    where: hydrateClaimsWhere,
    first: Math.max(claimIdsToHydrate.length, 1),
    enabled: claimIdsToHydrate.length > 0,
  });

  const hydratedClaimKindByHex = React.useMemo(() => {
    const map = new Map<string, ClaimKind>();
    for (const c of hydratedClaimEntities) {
      map.set(ID.uuidToHex(c.id), readClaimKind(c.values));
    }
    return map;
  }, [hydratedClaimEntities]);

  // Collect all claim IDs (topic claims + debated claims) for ONE cross-space vote summary query
  const allVoteClaimIds = React.useMemo(
    () => topicVoteClaimIds(orderedClaimSeeds, bestDebates),
    [bestDebates, orderedClaimSeeds]
  );

  const votesQuery = useQuery({
    queryKey: topicClaimVotesQueryKey(allVoteClaimIds),
    enabled: allVoteClaimIds.length > 0,
    staleTime: 30_000,
    // A new claim set keeps the counts already drawn while its own counts load.
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) => fetchTopicClaimVotes(allVoteClaimIds, signal),
  });
  // The viewer's own vote is picked out here rather than in the query, so the key does not depend on
  // who is reading and the server can hand the counts over (it does not know the personal space).
  const votesByClaim = React.useMemo(
    () => (votesQuery.data ? aggregateClaimVotes(votesQuery.data, personalSpaceId) : undefined),
    [personalSpaceId, votesQuery.data]
  );

  // Rows go most votes first (GEO-3876), agenda claims among themselves and then the rest; ties and
  // claims with no votes keep Best order. The order is made once the reads that pick the claims have
  // settled and the counts for those claims are in, and then held, so a refetch (say after the viewer
  // votes) never moves a row. Once the rows are drawn they hold even when the claim set changes: see
  // the freeze after the sections gate below.
  const agendaLeadCount = React.useMemo(
    () => new Set(agendaClaims.map(claim => ID.uuidToHex(claim.id))).size,
    [agendaClaims]
  );
  const currentClaimOrderKey = React.useMemo(
    () => claimOrderKey(orderedClaimSeeds, agendaLeadCount),
    [agendaLeadCount, orderedClaimSeeds]
  );
  const votesForOrder = votesQuery.isPlaceholderData ? undefined : votesByClaim;
  const [frozenClaimOrder, setFrozenClaimOrder] = React.useState<FrozenClaimOrder | null>(null);
  // Every read that adds claims or moves them into the agenda group. Frozen before these settle, the
  // order would be made again, and the rows reshuffled, when the agenda claims land on top.
  const claimSetSettled =
    !topClaimsQuery.isLoading &&
    !bestClaimsQuery.isLoading &&
    !bestDebatesQuery.isLoading &&
    !recentAgendaClaimsQuery.isLoading &&
    !isTaggedLoading;
  const byVotesNow = React.useMemo(
    () =>
      votesForOrder
        ? orderClaimsByVotes({
            seeds: orderedClaimSeeds,
            leadingCount: agendaLeadCount,
            voteTotalFor: hex => {
              const raw = votesForOrder.get(hex);
              return (raw?.totalPositive ?? 0) + (raw?.totalNegative ?? 0);
            },
          })
        : null,
    [agendaLeadCount, orderedClaimSeeds, votesForOrder]
  );
  const displayedClaimSeeds = React.useMemo(() => {
    if (frozenClaimOrder) {
      return applyFrozenClaimOrder({
        seeds: orderedClaimSeeds,
        leadingCount: agendaLeadCount,
        frozen: frozenClaimOrder,
      });
    }
    return byVotesNow ?? orderedClaimSeeds;
  }, [agendaLeadCount, byVotesNow, frozenClaimOrder, orderedClaimSeeds]);
  const claimOrderPending =
    !claimSetSettled ||
    (orderedClaimSeeds.length > 0 && frozenClaimOrder?.key !== currentClaimOrderKey && !votesQuery.isError);

  const actionCallbacks = useLiveEntityActions({
    entityId,
    entityName: entity?.name ?? entityId,
    spaceId,
    entity,
    ownerKind: 'topic',
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

    // One "Everyone" split row per claim: the counts include every voter, so the row names no space.
    // A row's own vote is drawn by its pills (`TemplateClaimVote`), which swap the viewer's vote in
    // the row's space for the live one.
    const buildSplitForClaim = (
      claimId: string
    ): {
      rows: SplitRow[];
      total: number;
      agreeCount: number;
      disagreeCount: number;
      percent: number | undefined;
      userVote: VoteChoice;
      isAccepted: boolean;
    } => {
      const hex = ID.uuidToHex(claimId);
      const raw = votesByClaim?.get(hex);
      const userVote: VoteChoice = raw?.viewerVote ?? null;

      const pos = raw?.totalPositive ?? 0;
      const neg = raw?.totalNegative ?? 0;

      const total = pos + neg;
      const percent = total > 0 ? Math.round((pos / total) * 100) : undefined;
      const isAccepted = total >= 2 && percent !== undefined && (percent >= 75 || percent <= 25);

      const rows: SplitRow[] =
        total > 0 && percent !== undefined
          ? [{ id: 'all', label: 'Everyone', color: '#202020', percent, voterCount: total, isEveryone: true }]
          : [];

      return { rows, total, agreeCount: pos, disagreeCount: neg, percent, userVote, isAccepted };
    };

    // The row votes in `voteSpaceId` — the space its link opens, so the vote also shows on that
    // claim's own page. Counts here are totals across spaces, so the row is told the viewer's vote
    // in that space from the same query, and swaps only that one (GEO-3819).
    const refreshVotes = () => void queryClient.invalidateQueries({ queryKey: TOPIC_CLAIM_VOTES_QUERY_PREFIX });
    const voteTargetFor = (claimId: string, voteSpaceId: string, title: string): ClaimVoteTarget => ({
      claimId,
      spaceId: voteSpaceId,
      title,
      baselineVote: baselineVoteFor(votesByClaim, claimId, voteSpaceId),
      onSettled: refreshVotes,
    });

    // Count debates per claim ID from the topic's debates so Claim rows show debate counts
    const debateCountByClaimHex = new Map<string, number>();
    for (const d of bestDebates) {
      const claimId = d.debateClaim?.entityId;
      if (!claimId) continue;
      const hex = ID.uuidToHex(claimId);
      debateCountByClaimHex.set(hex, (debateCountByClaimHex.get(hex) ?? 0) + 1);
    }

    // One list (GEO-3868), no disputed / accepted split: in vote order (GEO-3876), Best for ties.
    const claims: ClaimSummaryModel[] = [];

    for (const seed of displayedClaimSeeds) {
      const hex = ID.uuidToHex(seed.id);
      const kind = seed.kind ?? hydratedClaimKindByHex.get(hex);
      const { rows, total, agreeCount, disagreeCount, percent, userVote, isAccepted } = buildSplitForClaim(seed.id);
      const debateCount = debateCountByClaimHex.get(hex);
      const claimHref = NavUtils.toEntity(seed.spaceId, seed.id);

      const summary: ClaimSummaryModel = {
        id: seed.id,
        title: seed.title,
        kind,
        overallPercent: percent,
        agreeCount,
        disagreeCount,
        userVote,
        debateCount: debateCount && debateCount > 0 ? debateCount : undefined,
        debatesHref: debateCount && debateCount > 0 ? `${claimHref}/debates` : undefined,
        voteTarget: voteTargetFor(seed.id, seed.spaceId, seed.title),
        split: {
          rows,
          isSplit: !isAccepted,
          totalVotes: total > 0 ? total : undefined,
        },
        href: claimHref,
      };

      claims.push(summary);
    }

    // 2. Live Recent Debates gallery
    const debateParticipantsByHex = debateParticipantsQuery.data;
    const recentDebates: TopicRecentDebateModel[] = bestDebates.slice(0, 8).map(item => {
      const claimSplit = buildSplitForClaim(item.debateClaim?.entityId ?? item.entityId);
      const votesLabel =
        claimSplit.total > 0
          ? `${formatCompactCount(claimSplit.total)} ${claimSplit.total === 1 ? 'vote' : 'votes'}`
          : item.spaceName || 'Geo';

      return toDebateGalleryModel(item, debateParticipantsByHex?.[debateParticipantsKey(item.entityId)], {
        fallbackSpaceId: spaceId,
        votesLabel,
      });
    });

    // 3. Timeline: News events only, newest Event date first, capped at TIMELINE_LIMIT. The space's
    // page arrives in that order; re-sorting merges in the viewer's own events. Undated events last.
    // `sortTs` is null without a usable date, so undated events stay last even behind pre-1970 ones.
    const timelineCandidates: { item: TopicTimelineHighlightModel; sortTs: number | null }[] = [];
    const seenTimelineHex = new Set<string>();

    for (const eventEntity of [...linkedEvents, ...viewerLinkedEvents]) {
      if (!eventEntity.name) continue;
      const hex = ID.uuidToHex(eventEntity.id);
      if (seenTimelineHex.has(hex)) continue;
      seenTimelineHex.add(hex);
      const rawDate = readEntityTextValue(eventEntity, TEMPLATE_ONTOLOGY.EVENT_DATE_PROPERTY_ID);
      const ts = rawDate ? Date.parse(rawDate) : NaN;
      timelineCandidates.push({
        sortTs: Number.isFinite(ts) ? ts : null,
        item: {
          id: eventEntity.id,
          when: formatOntologyDate(rawDate) ?? 'Event',
          title: eventEntity.name,
          summary: eventEntity.description ?? undefined,
          href: NavUtils.toEntity(resolveEntitySpaceId(eventEntity, spaceId), eventEntity.id),
        },
      });
    }

    const timelineHighlights = timelineCandidates
      .sort((a, b) => {
        if (a.sortTs === null || b.sortTs === null) return a.sortTs === null ? (b.sortTs === null ? 0 : 1) : -1;
        return b.sortTs - a.sortTs;
      })
      .slice(0, TIMELINE_LIMIT)
      .map(entry => entry.item);

    // 4. Evidence: rich format-aware 2-column media cards
    const directStories = readEntityRelations(entity, TEMPLATE_ONTOLOGY.STORIES_PROPERTY_ID);
    const seenCoverageIds = new Set<string>();
    const coverageItems: EntityLinkRowModel[] = [];

    const tweetAuthorsByHex = tweetAuthorsQuery.data;

    const pushCoverageRow = (row: (typeof coverageRows)[number]) => {
      const hex = ID.uuidToHex(row.entityId);
      if (seenCoverageIds.has(hex)) return;
      seenCoverageIds.add(hex);
      const typeIds = row.types.map(type => type.id);
      const firstTypeName = row.types.find(type => type.name)?.name ?? null;
      const { kind, label, mediaType } = classifyCoverage(typeIds, firstTypeName);
      const tweetMeta = mediaType === 'tweet' ? tweetAuthorsByHex?.get(hex) : undefined;
      // The same order as the Post page (see resolvePostAuthor).
      const tweetAuthor = tweetMeta ? resolvePostAuthor({ lookup: tweetMeta }) : undefined;
      coverageItems.push({
        id: row.entityId,
        kind,
        kindLabel: label,
        mediaType,
        publisher: tweetAuthor?.name ?? label,
        authorHandle: tweetAuthor?.handle,
        authorAvatarUrl:
          tweetMeta?.avatarUrl ?? (mediaType === 'tweet' ? resolveTemplateImageUrl(row.imageUrl) : undefined),
        date: formatUnixSecDate(row.createdAtSec),
        title: row.title || row.entityId,
        excerpt: row.description ?? undefined,
        thumbnailUrl: resolveTemplateImageUrl(row.imageUrl) ?? undefined,
        href: NavUtils.toEntity(row.spaceId || spaceId, row.entityId),
      });
    };

    for (const row of coverage.page.rows) pushCoverageRow(row);

    for (const rel of directStories) {
      const hex = ID.uuidToHex(rel.toEntity.id);
      if (seenCoverageIds.has(hex) || !rel.toEntity.name) continue;
      seenCoverageIds.add(hex);
      coverageItems.push({
        id: rel.toEntity.id,
        kind: 'news-story',
        kindLabel: 'News story',
        mediaType: 'article',
        publisher: 'News story',
        title: rel.toEntity.name,
        href: NavUtils.toEntity(rel.toSpaceId ?? spaceId, rel.toEntity.id),
      });
    }

    // After the page's own: the viewer's published personal-space sources, then their staged ones.
    for (const row of viewerCoverageRows) pushCoverageRow(row);
    for (const source of viewerLocalSources) {
      const hex = ID.uuidToHex(source.id);
      if (seenCoverageIds.has(hex)) continue;
      seenCoverageIds.add(hex);
      const { kind, label, mediaType } = classifyCoverage(source.typeIds, source.typeName);
      coverageItems.push({
        id: source.id,
        kind,
        kindLabel: label,
        mediaType,
        publisher: label,
        title: source.name || source.id,
        href: NavUtils.toEntity(source.spaceId, source.id),
      });
    }

    const sections: EntityListSectionModel[] = [
      {
        id: 'coverage',
        title: 'Sources',
        layout: 'cards',
        items: coverageItems,
        emptyText: 'No sources',
        ingestionLink: topicCoverageIngestionLink(entity.id, entity.name, spaceId),
      },
    ];

    // 5. Compact Subtopics chips in header (deduplicated by ID & normalized name)
    const subtopicRels = readEntityRelations(entity, [
      TEMPLATE_ONTOLOGY.SUBTOPICS_PROPERTY_ID,
      TEMPLATE_ONTOLOGY.UNNAMED_SUBTOPIC_PROPERTY_ID,
    ]);
    const seenSubtopicNames = new Set<string>();
    const subtopics = subtopicRels
      .filter(rel => {
        const name = rel.toEntity.name?.trim();
        if (!name) return false;
        const key = name.toLowerCase();
        if (seenSubtopicNames.has(key)) return false;
        seenSubtopicNames.add(key);
        return true;
      })
      .map(rel => ({
        id: rel.toEntity.id,
        label: rel.toEntity.name!.trim(),
        href: NavUtils.toEntity(rel.toSpaceId ?? spaceId, rel.toEntity.id),
      }));

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
      subtopics: subtopics.length > 0 ? subtopics : undefined,
      claims: claims.length > 0 ? claims : undefined,
      recentDebates: recentDebates.length > 0 ? recentDebates : undefined,
      timelineHighlights: timelineHighlights.length > 0 ? timelineHighlights : undefined,
      graphConnections: graphConnections.length > 0 ? graphConnections : undefined,
      contextByEntityId: buildEntityContextMap(entity.id, flags),
      sections: sections.length > 0 ? sections : undefined,
    };
  }, [
    ancestors,
    bestDebates,
    countsByTopicId,
    coverage.page.rows,
    viewerCoverageRows,
    viewerLocalSources,
    debateParticipantsQuery.data,
    entity,
    entityId,
    hydratedClaimKindByHex,
    linkedEvents,
    viewerLinkedEvents,
    displayedClaimSeeds,
    queryClient,
    serverCoverUrl,
    spaceId,
    tweetAuthorsQuery.data,
    votesByClaim,
  ]);

  const sectionsGateKey = `${ID.uuidToHex(entityId)}:${ID.uuidToHex(spaceId)}:${isSpaceHome ? 'home' : 'entity'}`;
  const isBaseSectionsLoading = useInitialHydrationGate(
    topClaimsQuery.isLoading ||
      bestClaimsQuery.isLoading ||
      bestDebatesQuery.isLoading ||
      recentAgendaClaimsQuery.isLoading ||
      isTaggedLoading ||
      coverage.isLoading ||
      (orderedClaimSeeds.length > 0 && votesQuery.isLoading),
    sectionsGateKey,
    1100,
    // Everything above reads the queries the Topic page's server prefetch hands over, or the entity
    // the server seeds the store with, so the server and the first client render agree on it.
    { revealSettledBeforeMount: true }
  );
  // The Claims list is ordered by its vote counts, so it waits a little longer than the other
  // sections, for its claims and their counts: drawn before, it would reshuffle when they land (GEO-3876).
  const isWaitingForClaimVotes = useInitialHydrationGate(
    isBaseSectionsLoading || claimOrderPending,
    sectionsGateKey,
    CLAIM_VOTES_MAX_WAIT_MS,
    { revealSettledBeforeMount: true }
  );
  const isSectionsLoading = isBaseSectionsLoading || isWaitingForClaimVotes;
  if (orderedClaimSeeds.length > 0 && frozenClaimOrder?.key !== currentClaimOrderKey) {
    if (isSectionsLoading) {
      // Not drawn yet: order the claims by their counts once the set has settled and the counts are in.
      if (claimSetSettled && byVotesNow) setFrozenClaimOrder(freezeClaimOrder(currentClaimOrderKey, byVotesNow));
    } else {
      // Drawn: hold what this render shows, so no row on screen moves. A claim that joins the list (one
      // the viewer adds, or a refetch brings in) goes after the rows of its group, and past the wait
      // with no counts the rows keep Best order.
      setFrozenClaimOrder(freezeClaimOrder(currentClaimOrderKey, displayedClaimSeeds));
    }
  }

  return {
    data: model,
    isLoading: isEntityLoading && !entity,
    isSectionsLoading,
    source: 'live',
    actionCallbacks,
  };
}
