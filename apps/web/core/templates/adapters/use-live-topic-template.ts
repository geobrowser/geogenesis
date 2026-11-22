'use client';

import type { TypedDocumentNode } from '@graphql-typed-document-node/core';
import { useQuery } from '@tanstack/react-query';

import * as React from 'react';

import { Effect } from 'effect';
import { parse } from 'graphql';

import { CLAIM_TYPE_ID } from '~/core/claims/ontology';
import { CURATED_TOPIC_TAG_ID, NEWS_STORY_TYPE_ID, TAG_PROPERTY_ID, TOPIC_TYPE_ID } from '~/core/constants';
import { DEBATE_TYPE_ID } from '~/core/debates/ontology';
import type { ExploreFeedItem } from '~/core/explore/explore-card-item';
import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { ID } from '~/core/id';
import { graphql } from '~/core/io/graphql-client';
import { getSpaces } from '~/core/io/queries';
import { useQueryEntities, useQueryEntity } from '~/core/sync/use-store';
import { useTopicAncestors } from '~/core/topics/browse/use-topic-ancestors';
import { useTopicConnectionCounts } from '~/core/topics/browse/use-topic-connection-counts';
import { useTopicCoverage } from '~/core/topics/browse/use-topic-coverage';
import { useTopicLinkedEntities } from '~/core/topics/browse/use-topic-linked-entities';
import { useTopicSpaceScope } from '~/core/topics/use-topic-space-scope';
import { Entities } from '~/core/utils/entity';
import { resolveEntitySpaceId } from '~/core/utils/space/entity-home-space';
import { NavUtils } from '~/core/utils/utils';

import {
  type BreadcrumbItem,
  type ClaimKind,
  type ClaimSummaryModel,
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
  resolveTemplateImageUrl,
} from '../ontology';
import { useLiveEntityActions } from './use-live-entity-actions';

const LIVE_CLAIMS_LIMIT = 40;
const LIVE_COVERAGE_LIMIT = 12;

const MULTI_SPACE_CLAIM_VOTES_QUERY = parse(/* GraphQL */ `
  query MultiSpaceClaimVotes($objectIds: [UUID!]!) {
    userVotesConnection(
      first: 1000
      filter: { objectType: { is: 0 }, voteType: { in: [0, 1] }, objectId: { in: $objectIds } }
    ) {
      nodes {
        userId
        objectId
        spaceId
        voteType
        voteKind
      }
    }
  }
`) as TypedDocumentNode<
  {
    userVotesConnection?: {
      nodes?: Array<{
        userId: string;
        objectId: string;
        spaceId: string;
        voteType: number;
        voteKind: number;
      }> | null;
    } | null;
  },
  { objectIds: string[] }
>;

interface TweetAuthorMetadata {
  name?: string;
  handle?: string;
  avatarUrl?: string | null;
}

const TWEET_AUTHORS_QUERY = parse(/* GraphQL */ `
  query TopicTweetAuthors(
    $ids: [UUID!]!
    $authorsPropertyId: UUID!
    $avatarPropertyId: UUID!
    $webUrlPropertyId: UUID!
    $imageUrlPropertyId: UUID!
  ) {
    entities(first: 24, filter: { id: { in: $ids } }) {
      id
      valuesList(first: 6, filter: { propertyId: { is: $webUrlPropertyId } }) {
        propertyId
        text
      }
      relationsList(first: 4, filter: { typeId: { is: $authorsPropertyId } }) {
        toEntityId
        toEntity {
          id
          name
          relationsList(first: 2, filter: { typeId: { is: $avatarPropertyId } }) {
            toEntity {
              valuesList(first: 4, filter: { propertyId: { is: $imageUrlPropertyId } }) {
                propertyId
                text
              }
            }
          }
        }
      }
    }
  }
`) as TypedDocumentNode<
  {
    entities?: {
      id: string;
      valuesList?: { propertyId: string; text?: string | null }[] | null;
      relationsList?:
        | {
            toEntityId: string;
            toEntity?: {
              id: string;
              name?: string | null;
              relationsList?:
                | {
                    toEntity?: {
                      valuesList?: { propertyId: string; text?: string | null }[] | null;
                    } | null;
                  }[]
                | null;
            } | null;
          }[]
        | null;
    }[];
  },
  {
    ids: string[];
    authorsPropertyId: string;
    avatarPropertyId: string;
    webUrlPropertyId: string;
    imageUrlPropertyId: string;
  }
>;

function extractHandleFromSocialUrl(rawUrl: string | null | undefined): string | undefined {
  if (!rawUrl) return undefined;
  try {
    const parsed = new URL(rawUrl.trim());
    if (!/(^|\.)(x\.com|twitter\.com)$/i.test(parsed.hostname)) return undefined;
    const handle = parsed.pathname.split('/').filter(Boolean)[0];
    if (!handle || /^(i|home|explore|search|intent|hashtag)$/i.test(handle)) return undefined;
    return handle.startsWith('@') ? handle : `@${handle}`;
  } catch {
    return undefined;
  }
}

type SpaceVoteBucket = {
  spaceId: string;
  positive: number;
  negative: number;
};

type ClaimMultiSpaceVotes = {
  totalPositive: number;
  totalNegative: number;
  viewerVote: VoteChoice;
  bySpace: SpaceVoteBucket[];
};

const SUBSPACE_PALETTE = ['#6833ff', '#3963fe', '#0f766e', '#b45309'] as const;

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

function formatUnixSecDate(sec: number | undefined): string | undefined {
  if (!sec || !Number.isFinite(sec)) return undefined;
  return new Date(sec * 1000).toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * Parse speaker names & claim text from live Geo Debate titles, which follow either:
 * - `"Alice vs. Bob on <Claim>"`
 * - `"<Claim> | Alice vs. Bob"`
 */
function parseDebateTitle(
  rawTitle: string,
  fallbackClaim?: string
): { claimTitle: string; speakers: [string, string] } {
  const clean = rawTitle.trim();
  const pipeMatch = clean.match(/^(.+?)\s*\|\s*(.+?)\s+vs\.?\s+(.+)$/i);
  if (pipeMatch) {
    return {
      claimTitle: fallbackClaim?.trim() || pipeMatch[1]!.trim(),
      speakers: [pipeMatch[2]!.trim(), pipeMatch[3]!.trim()],
    };
  }
  const onMatch = clean.match(/^(.+?)\s+vs\.?\s+(.+?)\s+on\s+(.+)$/i);
  if (onMatch) {
    return {
      claimTitle: fallbackClaim?.trim() || onMatch[3]!.trim(),
      speakers: [onMatch[1]!.trim(), onMatch[2]!.trim()],
    };
  }
  return {
    claimTitle: fallbackClaim?.trim() || clean,
    speakers: ['For', 'Against'],
  };
}

/**
 * Live Geo adapter for `TopicTemplate`.
 *
 * Hydrates the full Topic experience from live Geo services:
 * - Best-ranked Claims (via `/api/topics/feed` + `useTopicLinkedEntities` + direct `Claims`),
 *   batch-hydrated for `Is factual` (`Factual`/`Judgment`) and cross-space `userVotes` (with
 *   multi-space split bars, `Disputed` / `Accepted` tabs, and interactive inline voting).
 * - Live `Recent debates` horizontal gallery (via `/api/topics/feed` for `DEBATE_TYPE_ID`).
 * - Live `Timeline` combining `News events` (`Event date`) and dated `News stories`.
 * - Rich 2-column format-aware `Sources & evidence` media cards (`layout: 'cards'`).
 * - Header stats (`countsByTopicId`), compact clickable `Subtopics` chips, `Context` relation
 *   pills, `Flags` (`Community notes` / `Disclaimer`), and live `useMutate` actions.
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
  const spaceIds = useTopicSpaceScope(spaceId);
  const ancestors = useTopicAncestors(entityId, spaceId);
  const { countsByTopicId } = useTopicConnectionCounts([entityId]);

  // Optimistic inline vote state per claim so Agree/Disagree on Topic rows responds immediately.
  const [localVotes, setLocalVotes] = React.useState<Record<string, VoteChoice>>({});

  // 1. Top-voted AND Best-ranked Claims, Debates, and News stories from Geo's topic/space ranking feed
  const topClaimsQuery = useQuery({
    queryKey: ['live-topic-template', 'top-claims', ID.uuidToHex(entityId), ID.uuidToHex(spaceId)],
    queryFn: ({ signal }) =>
      fetchTopicFeedSlice({ topicId: entityId, spaceId, typeId: CLAIM_TYPE_ID, sort: 'top', signal }),
    staleTime: 60_000,
  });

  const bestClaimsQuery = useQuery({
    queryKey: ['live-topic-template', 'best-claims', ID.uuidToHex(entityId), ID.uuidToHex(spaceId)],
    queryFn: ({ signal }) =>
      fetchTopicFeedSlice({ topicId: entityId, spaceId, typeId: CLAIM_TYPE_ID, sort: 'best', signal }),
    staleTime: 60_000,
  });

  const bestDebatesQuery = useQuery({
    queryKey: ['live-topic-template', 'best-debates', ID.uuidToHex(entityId), ID.uuidToHex(spaceId), isSpaceHome],
    queryFn: async ({ signal }) => {
      if (isSpaceHome) {
        const spaceDebates = await fetchTopicFeedSlice({
          topicId: entityId,
          spaceId,
          typeId: DEBATE_TYPE_ID,
          endpoint: 'space',
          signal,
        });
        if (spaceDebates.length > 0) return spaceDebates;
      }
      return fetchTopicFeedSlice({ topicId: entityId, spaceId, typeId: DEBATE_TYPE_ID, signal });
    },
    staleTime: 60_000,
  });

  const bestNewsQuery = useQuery({
    queryKey: ['live-topic-template', 'best-news', ID.uuidToHex(entityId), ID.uuidToHex(spaceId), isSpaceHome],
    queryFn: async ({ signal }) => {
      if (isSpaceHome) {
        const spaceNews = await fetchTopicFeedSlice({
          topicId: entityId,
          spaceId,
          typeId: NEWS_STORY_TYPE_ID,
          endpoint: 'space',
          signal,
        });
        if (spaceNews.length > 0) return spaceNews;
      }
      return fetchTopicFeedSlice({ topicId: entityId, spaceId, typeId: NEWS_STORY_TYPE_ID, signal });
    },
    staleTime: 60_000,
  });

  // Fallback / local-sync linked claims & events
  const { entities: linkedClaims } = useTopicLinkedEntities({
    topicId: entityId,
    typeIds: [CLAIM_TYPE_ID],
    first: LIVE_CLAIMS_LIMIT,
    rankInSpaceId: spaceId,
    spaceIds,
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

  // Batch-hydrate Tweet / Post author names, @handles, and avatars for Sources & evidence cards
  const tweetCoverageIds = React.useMemo(() => {
    const ids: string[] = [];
    for (const row of coverage.page.rows) {
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
  }, [coverage.page.rows]);

  const tweetAuthorsQuery = useQuery({
    queryKey: ['live-topic-template', 'tweet-authors', tweetCoverageIds.join(',')],
    enabled: tweetCoverageIds.length > 0,
    staleTime: 120_000,
    queryFn: async () => {
      const entities = await Effect.runPromise(
        graphql({
          query: TWEET_AUTHORS_QUERY,
          variables: {
            ids: tweetCoverageIds,
            authorsPropertyId: TEMPLATE_ONTOLOGY.AUTHORS_PROPERTY_ID,
            avatarPropertyId: TEMPLATE_ONTOLOGY.AVATAR_PROPERTY_ID,
            webUrlPropertyId: TEMPLATE_ONTOLOGY.WEB_URL_PROPERTY_ID,
            imageUrlPropertyId: TEMPLATE_ONTOLOGY.IMAGE_URL_PROPERTY_ID,
          },
          decoder: data => data.entities ?? [],
        })
      );

      const map = new Map<string, TweetAuthorMetadata>();
      for (const item of entities) {
        const hex = ID.uuidToHex(item.id);
        const urlVal = item.valuesList?.find(v => ID.equals(v.propertyId, TEMPLATE_ONTOLOGY.WEB_URL_PROPERTY_ID))?.text;
        const handle = extractHandleFromSocialUrl(urlVal);
        const author = item.relationsList?.[0]?.toEntity;
        const authorName = author?.name?.trim() || undefined;
        const rawAvatar = author?.relationsList?.[0]?.toEntity?.valuesList?.find(v =>
          ID.equals(v.propertyId, TEMPLATE_ONTOLOGY.IMAGE_URL_PROPERTY_ID)
        )?.text;
        map.set(hex, {
          name: authorName,
          handle,
          avatarUrl: resolveTemplateImageUrl(rawAvatar),
        });
      }
      return map;
    },
  });

  const directClaimRels = React.useMemo(
    () => readEntityRelations(entity, TEMPLATE_ONTOLOGY.TOPIC_CLAIMS_PROPERTY_ID),
    [entity]
  );

  // Merge all claim IDs (Best-ranked first, then linkedClaims, then direct relations, plus debate claims)
  const orderedClaimSeeds = React.useMemo(() => {
    const seen = new Set<string>();
    const seeds: {
      id: string;
      title: string;
      spaceId: string;
      spaceName?: string;
      kind?: ClaimKind;
      debateCount?: number;
    }[] = [];

    const add = (item: (typeof seeds)[number]) => {
      const hex = ID.uuidToHex(item.id);
      if (seen.has(hex) || !item.title.trim()) return;
      seen.add(hex);
      seeds.push(item);
    };

    for (const item of topClaimsQuery.data ?? []) {
      add({
        id: item.entityId,
        title: item.title,
        spaceId: item.spaceId || spaceId,
        spaceName: item.spaceName,
      });
    }
    for (const debateItem of bestDebatesQuery.data ?? []) {
      if (!debateItem.debateClaim?.entityId || !debateItem.debateClaim?.name) continue;
      add({
        id: debateItem.debateClaim.entityId,
        title: debateItem.debateClaim.name,
        spaceId: debateItem.spaceId || spaceId,
        spaceName: debateItem.spaceName,
      });
    }
    for (const item of bestClaimsQuery.data ?? []) {
      add({
        id: item.entityId,
        title: item.title,
        spaceId: item.spaceId || spaceId,
        spaceName: item.spaceName,
      });
    }
    for (const claim of linkedClaims) {
      if (!claim.name) continue;
      add({
        id: claim.id,
        title: claim.name,
        spaceId: resolveEntitySpaceId(claim, spaceId),
        kind: readClaimKind(claim.values),
      });
    }
    for (const rel of directClaimRels) {
      if (!rel.toEntity.name) continue;
      add({
        id: rel.toEntity.id,
        title: rel.toEntity.name,
        spaceId: rel.toSpaceId ?? spaceId,
      });
    }
    return seeds.slice(0, LIVE_CLAIMS_LIMIT);
  }, [bestClaimsQuery.data, bestDebatesQuery.data, directClaimRels, linkedClaims, spaceId, topClaimsQuery.data]);

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
  const allVoteClaimIds = React.useMemo(() => {
    const seen = new Set<string>();
    const ids: string[] = [];
    const push = (id: string | undefined) => {
      if (!id) return;
      const hex = ID.uuidToHex(id);
      if (seen.has(hex)) return;
      seen.add(hex);
      ids.push(hex);
    };
    for (const c of orderedClaimSeeds) push(c.id);
    for (const d of bestDebatesQuery.data ?? []) push(d.debateClaim?.entityId);
    return ids;
  }, [bestDebatesQuery.data, orderedClaimSeeds]);

  const votesQuery = useQuery({
    queryKey: ['live-topic-template', 'multi-space-votes', personalSpaceId ?? null, allVoteClaimIds],
    enabled: allVoteClaimIds.length > 0,
    staleTime: 30_000,
    queryFn: async ({ signal }) => {
      const response = await Effect.runPromise(
        graphql({
          query: MULTI_SPACE_CLAIM_VOTES_QUERY,
          variables: { objectIds: allVoteClaimIds },
          decoder: data => data.userVotesConnection?.nodes ?? [],
          signal,
        })
      );

      // Deduplicate by (objectId, spaceId, userId) so a single user counts once per space
      const activeByKey = new Map<
        string,
        { objectHex: string; spaceHex: string; userId: string; isPositive: boolean }
      >();
      const spaceIdsSet = new Set<string>();

      for (const row of response) {
        if (row.voteType !== 0 && row.voteType !== 1) continue;
        const objectHex = ID.uuidToHex(row.objectId);
        const spaceHex = ID.uuidToHex(row.spaceId);
        spaceIdsSet.add(spaceHex);
        activeByKey.set(`${objectHex}:${spaceHex}:${row.userId}`, {
          objectHex,
          spaceHex,
          userId: row.userId,
          isPositive: row.voteType === 0,
        });
      }

      const spaceNameByHex = new Map<string, string>();
      if (spaceIdsSet.size > 0) {
        try {
          const spaces = await Effect.runPromise(getSpaces({ spaceIds: Array.from(spaceIdsSet) }, signal));
          for (const sp of spaces) {
            if (sp.entity?.name) {
              spaceNameByHex.set(ID.uuidToHex(sp.id), sp.entity.name);
            }
          }
        } catch {
          // Non-fatal: falls back to feed spaceName or "Everyone"
        }
      }

      const byClaim = new Map<string, ClaimMultiSpaceVotes>();
      const byClaimSpace = new Map<string, Map<string, SpaceVoteBucket>>();

      for (const entry of activeByKey.values()) {
        let claimAgg = byClaim.get(entry.objectHex);
        if (!claimAgg) {
          claimAgg = { totalPositive: 0, totalNegative: 0, viewerVote: null, bySpace: [] };
          byClaim.set(entry.objectHex, claimAgg);
        }
        if (entry.isPositive) claimAgg.totalPositive += 1;
        else claimAgg.totalNegative += 1;

        if (personalSpaceId && ID.equals(entry.userId, personalSpaceId)) {
          claimAgg.viewerVote = entry.isPositive ? 'agree' : 'disagree';
        }

        let spaceMap = byClaimSpace.get(entry.objectHex);
        if (!spaceMap) {
          spaceMap = new Map();
          byClaimSpace.set(entry.objectHex, spaceMap);
        }
        let bucket = spaceMap.get(entry.spaceHex);
        if (!bucket) {
          bucket = { spaceId: entry.spaceHex, positive: 0, negative: 0 };
          spaceMap.set(entry.spaceHex, bucket);
        }
        if (entry.isPositive) bucket.positive += 1;
        else bucket.negative += 1;
      }

      for (const [claimHex, spaceMap] of byClaimSpace.entries()) {
        const agg = byClaim.get(claimHex);
        if (agg) {
          agg.bySpace = Array.from(spaceMap.values()).sort(
            (a, b) => b.positive + b.negative - (a.positive + a.negative)
          );
        }
      }

      return { byClaim, spaceNameByHex };
    },
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

    // Helper to build SplitRows from cross-space votes + optimistic local override
    const buildSplitForClaim = (
      claimId: string,
      fallbackSpaceName?: string
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
      const raw = votesQuery.data?.byClaim.get(hex);
      const spaceNames = votesQuery.data?.spaceNameByHex;
      const hasLocalOverride = Object.prototype.hasOwnProperty.call(localVotes, hex);
      const userVote: VoteChoice = hasLocalOverride ? localVotes[hex]! : (raw?.viewerVote ?? null);

      let pos = raw?.totalPositive ?? 0;
      let neg = raw?.totalNegative ?? 0;

      if (hasLocalOverride) {
        if (raw?.viewerVote === 'agree') pos = Math.max(0, pos - 1);
        if (raw?.viewerVote === 'disagree') neg = Math.max(0, neg - 1);
        if (userVote === 'agree') pos += 1;
        if (userVote === 'disagree') neg += 1;
      }

      const total = pos + neg;
      const percent = total > 0 ? Math.round((pos / total) * 100) : undefined;
      const isAccepted = total >= 2 && percent !== undefined && (percent >= 75 || percent <= 25);

      const rows: SplitRow[] = [];
      if (total > 0 && percent !== undefined) {
        const spaceBuckets = raw?.bySpace ?? [];
        if (spaceBuckets.length > 1) {
          rows.push({
            id: 'all',
            label: 'All spaces',
            color: '#202020',
            percent,
            voterCount: total,
            isEveryone: true,
            userLabel: userVote ? `You: ${userVote === 'agree' ? 'Agree' : 'Disagree'}` : undefined,
          });
          spaceBuckets.slice(0, 3).forEach((bucket, idx) => {
            const bTotal = bucket.positive + bucket.negative;
            const bPct = bTotal > 0 ? Math.round((bucket.positive / bTotal) * 100) : 0;
            rows.push({
              id: bucket.spaceId,
              label: spaceNames?.get(bucket.spaceId) ?? bucket.spaceId.slice(0, 8),
              color: SUBSPACE_PALETTE[idx % SUBSPACE_PALETTE.length]!,
              percent: bPct,
              voterCount: bTotal,
              isSubspace: true,
              href: NavUtils.toSpace(bucket.spaceId),
            });
          });
        } else {
          const singleSpaceId = spaceBuckets[0]?.spaceId;
          const label =
            (singleSpaceId ? spaceNames?.get(singleSpaceId) : undefined) ||
            (fallbackSpaceName && fallbackSpaceName.length > 8 ? fallbackSpaceName : undefined) ||
            'Everyone';
          rows.push({
            id: singleSpaceId ?? spaceId,
            label,
            color: '#202020',
            percent,
            voterCount: total,
            isEveryone: true,
            userLabel: userVote ? `You: ${userVote === 'agree' ? 'Agree' : 'Disagree'}` : undefined,
          });
        }
      }

      return { rows, total, agreeCount: pos, disagreeCount: neg, percent, userVote, isAccepted };
    };

    // Count debates per claim ID from the topic's debates so Claim rows show debate counts
    const debateCountByClaimHex = new Map<string, number>();
    for (const d of bestDebatesQuery.data ?? []) {
      const claimId = d.debateClaim?.entityId;
      if (!claimId) continue;
      const hex = ID.uuidToHex(claimId);
      debateCountByClaimHex.set(hex, (debateCountByClaimHex.get(hex) ?? 0) + 1);
    }

    const contestedClaims: ClaimSummaryModel[] = [];
    const agreedClaims: ClaimSummaryModel[] = [];

    for (const seed of orderedClaimSeeds) {
      const hex = ID.uuidToHex(seed.id);
      const kind = seed.kind ?? hydratedClaimKindByHex.get(hex);
      const { rows, total, agreeCount, disagreeCount, percent, userVote, isAccepted } = buildSplitForClaim(
        seed.id,
        seed.spaceName
      );
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
        onVote: choice => {
          setLocalVotes(prev => ({ ...prev, [hex]: choice }));
        },
        onClearVote: () => {
          setLocalVotes(prev => ({ ...prev, [hex]: null }));
        },
        split: {
          rows,
          isSplit: !isAccepted,
          totalVotes: total > 0 ? total : undefined,
        },
        href: claimHref,
      };

      if (isAccepted) {
        agreedClaims.push(summary);
      } else {
        contestedClaims.push(summary);
      }
    }

    // Sort so claims with live votes/debates lead cleanly ahead of unvoted claims
    const byEngagement = (a: ClaimSummaryModel, b: ClaimSummaryModel) => {
      const scoreA = (a.split.totalVotes ?? 0) * 10 + (a.debateCount ?? 0) * 5;
      const scoreB = (b.split.totalVotes ?? 0) * 10 + (b.debateCount ?? 0) * 5;
      return scoreB - scoreA;
    };
    contestedClaims.sort(byEngagement);
    agreedClaims.sort(byEngagement);

    // 2. Live Recent Debates gallery
    const recentDebates: TopicRecentDebateModel[] = (bestDebatesQuery.data ?? []).slice(0, 8).map(item => {
      const { claimTitle, speakers } = parseDebateTitle(item.title, item.debateClaim?.name);
      const claimId = item.debateClaim?.entityId ?? item.entityId;
      const claimHex = ID.uuidToHex(claimId);
      const claimSplit = buildSplitForClaim(claimId, item.spaceName);
      const normDebateId = ID.uuidToHex(item.entityId).toLowerCase();
      const slot1Avatar = resolveTemplateImageUrl(item.debatePosters?.slot1) ?? `/api/debates/still/${normDebateId}/1`;
      const slot2Avatar = resolveTemplateImageUrl(item.debatePosters?.slot2) ?? `/api/debates/still/${normDebateId}/2`;
      const dateStr = formatUnixSecDate(item.createdAtSec) ?? 'Debate';
      const votesLabel =
        claimSplit.total > 0
          ? `${formatCompactCount(claimSplit.total)} ${claimSplit.total === 1 ? 'vote' : 'votes'}`
          : item.spaceName || 'Geo';

      return {
        id: item.entityId,
        claimId,
        claimTitle,
        date: dateStr,
        duration: '',
        votesLabel,
        agreeCount: claimSplit.agreeCount,
        disagreeCount: claimSplit.disagreeCount,
        userVote: claimSplit.userVote,
        onVote: choice => setLocalVotes(prev => ({ ...prev, [claimHex]: choice })),
        onClearVote: () => setLocalVotes(prev => ({ ...prev, [claimHex]: null })),
        participants: [
          {
            name: speakers[0],
            position: 'Agree',
            communityColor: '#3963fe',
            avatarUrl: slot1Avatar,
          },
          {
            name: speakers[1],
            position: 'Disagree',
            communityColor: '#6833ff',
            avatarUrl: slot2Avatar,
          },
        ],
        split:
          claimSplit.rows.length > 0
            ? { rows: claimSplit.rows, isSplit: !claimSplit.isAccepted, totalVotes: claimSplit.total }
            : undefined,
        href: NavUtils.toEntity(item.spaceId || spaceId, item.entityId),
      };
    });

    // 3. Timeline: combine News events + recent dated News stories (newest first, capped at 8)
    const timelineCandidates: { item: TopicTimelineHighlightModel; sortTs: number }[] = [];
    const seenTimelineHex = new Set<string>();

    for (const eventEntity of linkedEvents) {
      if (!eventEntity.name) continue;
      const hex = ID.uuidToHex(eventEntity.id);
      if (seenTimelineHex.has(hex)) continue;
      seenTimelineHex.add(hex);
      const rawDate = readEntityTextValue(eventEntity, TEMPLATE_ONTOLOGY.EVENT_DATE_PROPERTY_ID);
      const ts = rawDate ? Date.parse(rawDate) : 0;
      timelineCandidates.push({
        sortTs: Number.isFinite(ts) ? ts : 0,
        item: {
          id: eventEntity.id,
          when: formatOntologyDate(rawDate) ?? 'Event',
          title: eventEntity.name,
          summary: eventEntity.description ?? undefined,
          href: NavUtils.toEntity(resolveEntitySpaceId(eventEntity, spaceId), eventEntity.id),
        },
      });
    }

    for (const story of bestNewsQuery.data ?? []) {
      if (!story.title) continue;
      const hex = ID.uuidToHex(story.entityId);
      if (seenTimelineHex.has(hex)) continue;
      seenTimelineHex.add(hex);
      timelineCandidates.push({
        sortTs: (story.createdAtSec ?? 0) * 1000,
        item: {
          id: story.entityId,
          when: formatUnixSecDate(story.createdAtSec) ?? 'News',
          title: story.title,
          summary: story.description ?? undefined,
          href: NavUtils.toEntity(story.spaceId || spaceId, story.entityId),
        },
      });
    }

    const timelineHighlights = timelineCandidates
      .sort((a, b) => b.sortTs - a.sortTs)
      .slice(0, 8)
      .map(entry => entry.item);

    // 4. Sources & evidence: rich format-aware 2-column media cards
    const directStories = readEntityRelations(entity, TEMPLATE_ONTOLOGY.STORIES_PROPERTY_ID);
    const seenCoverageIds = new Set<string>();
    const coverageItems: EntityLinkRowModel[] = [];

    const tweetAuthorsByHex = tweetAuthorsQuery.data;

    for (const row of coverage.page.rows) {
      const hex = ID.uuidToHex(row.entityId);
      if (seenCoverageIds.has(hex)) continue;
      seenCoverageIds.add(hex);
      const typeIds = row.types.map(type => type.id);
      const firstTypeName = row.types.find(type => type.name)?.name ?? null;
      const { kind, label, mediaType } = classifyCoverage(typeIds, firstTypeName);
      const tweetMeta = mediaType === 'tweet' ? tweetAuthorsByHex?.get(hex) : undefined;
      coverageItems.push({
        id: row.entityId,
        kind,
        kindLabel: label,
        mediaType,
        publisher: tweetMeta?.name ?? tweetMeta?.handle ?? label,
        authorHandle: tweetMeta?.handle,
        authorAvatarUrl:
          tweetMeta?.avatarUrl ?? (mediaType === 'tweet' ? resolveTemplateImageUrl(row.imageUrl) : undefined),
        date: formatUnixSecDate(row.createdAtSec),
        title: row.title || row.entityId,
        excerpt: row.description ?? undefined,
        thumbnailUrl: resolveTemplateImageUrl(row.imageUrl) ?? undefined,
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
        mediaType: 'article',
        publisher: 'News story',
        title: rel.toEntity.name,
        href: NavUtils.toEntity(rel.toSpaceId ?? spaceId, rel.toEntity.id),
      });
    }

    const sections: EntityListSectionModel[] = [];
    if (coverageItems.length > 0) {
      sections.push({
        id: 'coverage',
        title: 'Sources & evidence',
        layout: 'cards',
        items: coverageItems,
      });
    }

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
      contestedClaims: contestedClaims.length > 0 ? contestedClaims : undefined,
      agreedClaims: agreedClaims.length > 0 ? agreedClaims : undefined,
      recentDebates: recentDebates.length > 0 ? recentDebates : undefined,
      timelineHighlights: timelineHighlights.length > 0 ? timelineHighlights : undefined,
      graphConnections: graphConnections.length > 0 ? graphConnections : undefined,
      contextByEntityId: buildEntityContextMap(entity.id, flags),
      sections: sections.length > 0 ? sections : undefined,
    };
  }, [
    ancestors,
    bestDebatesQuery.data,
    bestNewsQuery.data,
    countsByTopicId,
    coverage.page.rows,
    entity,
    entityId,
    hydratedClaimKindByHex,
    linkedEvents,
    localVotes,
    orderedClaimSeeds,
    serverCoverUrl,
    spaceId,
    tweetAuthorsQuery.data,
    votesQuery.data,
  ]);

  return {
    data: model,
    isLoading: isEntityLoading && !entity,
    source: 'live',
    actionCallbacks,
  };
}
