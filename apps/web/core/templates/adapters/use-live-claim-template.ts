'use client';

import { SystemIds } from '@geoprotocol/geo-sdk/lite';
import type { TypedDocumentNode } from '@graphql-typed-document-node/core';
import { useQuery } from '@tanstack/react-query';

import * as React from 'react';

import { Effect } from 'effect';
import { parse } from 'graphql';

import { getClaimSources } from '~/core/claims/browse/claim-sources';
import { useClaimRecord } from '~/core/claims/browse/use-claim-record';
import { claimTitleFrom, useClaimResponseState } from '~/core/claims/browse/use-claim-response-state';
import { CLAIM_TYPE_ID, TOPICS_PROPERTY_ID } from '~/core/claims/ontology';
import type { DebateClaim } from '~/core/debates/api';
import { useDebateClaims } from '~/core/debates/hooks';
import { useClaimPositionControl } from '~/core/debates/matchmaking/matchmaking-claim-card';
import { useSpace } from '~/core/hooks/use-space';
import { ID } from '~/core/id';
import { graphql } from '~/core/io/graphql-client';
import { claimResponseTargetKey } from '~/core/responses/claim-response-summaries';
import { useClaimResponseSummaryBatch } from '~/core/responses/use-claim-response-summaries';
import { useQueryEntities, useQueryEntity } from '~/core/sync/use-store';
import { Entities } from '~/core/utils/entity';
import { resolveEntitySpaceId } from '~/core/utils/space/entity-home-space';
import { NavUtils } from '~/core/utils/utils';

import {
  type BreadcrumbItem,
  type ClaimKind,
  type ClaimStance,
  type ClaimTemplateModel,
  type ClaimTopicPillModel,
  type EntityListSectionModel,
  type SplitRow,
  type SubClaimModel,
  type TemplateDataSource,
  type TopicRecentDebateModel,
  type VoteChoice,
  formatCompactCount,
} from '../models';
import {
  TEMPLATE_ONTOLOGY,
  buildEntityContextMap,
  extractEntityFlags,
  extractGraphConnections,
  readClaimKind,
  readEntityRelations,
  resolveTemplateImageUrl,
} from '../ontology';
import { useLiveEntityActions } from './use-live-entity-actions';

const CLAIM_TOPIC_MEDIA_QUERY = parse(/* GraphQL */ `
  query ClaimTopicMedia($ids: [UUID!]!, $mediaTypeIds: [UUID!]!, $imageUrlPropertyId: UUID!) {
    entities(first: 24, filter: { id: { in: $ids } }) {
      id
      relationsList(first: 4, filter: { typeId: { in: $mediaTypeIds } }) {
        typeId
        toEntity {
          valuesList(first: 4, filter: { propertyId: { is: $imageUrlPropertyId } }) {
            propertyId
            text
          }
        }
      }
    }
  }
`) as TypedDocumentNode<
  {
    entities?: {
      id: string;
      relationsList?:
        | {
            typeId: string;
            toEntity?: {
              valuesList?: { propertyId: string; text?: string | null }[] | null;
            } | null;
          }[]
        | null;
    }[];
  },
  { ids: string[]; mediaTypeIds: string[]; imageUrlPropertyId: string }
>;

function parseDebateTitle(rawTitle: string, fallbackClaim: string): { claimTitle: string; speakers: [string, string] } {
  const clean = rawTitle.trim();
  const pipeMatch = clean.match(/^(.+?)\s*\|\s*(.+?)\s+vs\.?\s+(.+)$/i);
  if (pipeMatch) {
    return {
      claimTitle: fallbackClaim || pipeMatch[1]!.trim(),
      speakers: [pipeMatch[2]!.trim(), pipeMatch[3]!.trim()],
    };
  }
  const onMatch = clean.match(/^(.+?)\s+vs\.?\s+(.+?)\s+on\s+(.+)$/i);
  if (onMatch) {
    return {
      claimTitle: fallbackClaim || onMatch[3]!.trim(),
      speakers: [onMatch[1]!.trim(), onMatch[2]!.trim()],
    };
  }
  return {
    claimTitle: fallbackClaim || clean,
    speakers: ['For', 'Against'],
  };
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
 * Live Geo adapter for `ClaimTemplate`.
 *
 * Bridges `useQueryEntity`, `useClaimResponseState`, `useClaimPositionControl`, incoming & outgoing
 * stance relations (`Supports`, `Opposes`, `Supported by`, `Opposed by`, `Subclaims`, `Inverse claims`,
 * `Supporting/Opposing arguments`) with live vote counts, `Factual`/`Judgment` hydration, and
 * interactive inline voting; Debates gallery cards with speaker stills; Topic pills with images;
 * supporting Quotes & Sources; and live `useMutate` actions.
 */
export function useLiveClaimTemplate({
  entityId,
  spaceId,
  serverCoverUrl,
}: {
  entityId: string;
  spaceId: string;
  serverCoverUrl?: string | null;
}): TemplateDataSource<ClaimTemplateModel> {
  const { entity, isLoading: isEntityLoading } = useQueryEntity({ id: entityId, spaceId });
  const { space } = useSpace(spaceId);
  const [localSubClaimVotes, setLocalSubClaimVotes] = React.useState<Record<string, VoteChoice>>({});

  const rowQuery = useDebateClaims(spaceId, [entityId], true);
  const row: DebateClaim | null = rowQuery.data?.claims.find(claim => claim.claim_entity_id === entityId) ?? null;

  const state = useClaimResponseState({
    claimId: entityId,
    spaceId,
    row,
    entity: entity ?? null,
    title: claimTitleFrom({ entity: entity ?? null, row }),
  });

  const control = useClaimPositionControl({
    claim: state.claim,
    positions: state.positions,
    readiness: state.readiness,
    answersReady: state.isResponseKindResolved && state.isViewerResponseResolved,
    responseBlockedReason: state.responseBlockedReason,
    allowsSignedOutVotes: true,
    offersDebate: false,
    savePromptSurface: 'single',
  });

  // Incoming stance claims: `<subclaim> --[Supports / Opposes]--> <this claim>` (verified live direction).
  const incomingSupportsWhere = React.useMemo(
    () => ({
      types: [{ id: { equals: CLAIM_TYPE_ID } }],
      relations: [
        {
          typeOf: { id: { equals: TEMPLATE_ONTOLOGY.CLAIM_SUPPORTS_PROPERTY_ID } },
          toEntity: { id: { equals: entityId } },
        },
      ],
    }),
    [entityId]
  );
  const incomingOpposesWhere = React.useMemo(
    () => ({
      types: [{ id: { equals: CLAIM_TYPE_ID } }],
      relations: [
        {
          typeOf: { id: { equals: TEMPLATE_ONTOLOGY.CLAIM_OPPOSES_PROPERTY_ID } },
          toEntity: { id: { equals: entityId } },
        },
      ],
    }),
    [entityId]
  );
  const incomingQuotesWhere = React.useMemo(
    () => ({
      types: [{ id: { equals: TEMPLATE_ONTOLOGY.QUOTE_TYPE_ID } }],
      relations: [
        {
          typeOf: { id: { equals: TEMPLATE_ONTOLOGY.CLAIM_SUPPORTS_PROPERTY_ID } },
          toEntity: { id: { equals: entityId } },
        },
      ],
    }),
    [entityId]
  );

  const [isMounted, setIsMounted] = React.useState(false);
  React.useEffect(() => {
    setIsMounted(true);
  }, []);

  const { entities: incomingSupportingClaims } = useQueryEntities({
    where: incomingSupportsWhere,
    first: 12,
    enabled: isMounted,
  });
  const { entities: incomingOpposingClaims } = useQueryEntities({
    where: incomingOpposesWhere,
    first: 12,
    enabled: isMounted,
  });
  const { entities: incomingSupportingQuotes } = useQueryEntities({
    where: incomingQuotesWhere,
    first: 10,
    enabled: isMounted,
  });

  // Deduplicated topic relations on this Claim
  const topicRelations = React.useMemo(() => {
    const seen = new Set<string>();
    const out = [];
    for (const relation of entity?.relations ?? []) {
      if (relation.isDeleted === true || !ID.equals(relation.type.id, TOPICS_PROPERTY_ID)) continue;
      const hex = ID.uuidToHex(relation.toEntity.id);
      if (seen.has(hex)) continue;
      seen.add(hex);
      out.push(relation);
    }
    return out;
  }, [entity?.relations]);

  const topicIds = React.useMemo(() => topicRelations.map(relation => relation.toEntity.id), [topicRelations]);
  const topicHexIds = React.useMemo(() => topicIds.map(id => ID.uuidToHex(id)), [topicIds]);

  // Batch-hydrate topic thumbnail images (Avatar preferred, then Cover) for Topic pills
  const topicMediaQuery = useQuery({
    queryKey: ['live-claim-template', 'topic-media', topicHexIds.join(',')],
    enabled: topicHexIds.length > 0,
    staleTime: 120_000,
    queryFn: async () => {
      const entities = await Effect.runPromise(
        graphql({
          query: CLAIM_TOPIC_MEDIA_QUERY,
          variables: {
            ids: topicHexIds.slice(0, 24),
            mediaTypeIds: [TEMPLATE_ONTOLOGY.AVATAR_PROPERTY_ID, SystemIds.COVER_PROPERTY],
            imageUrlPropertyId: TEMPLATE_ONTOLOGY.IMAGE_URL_PROPERTY_ID,
          },
          decoder: data => data.entities ?? [],
        })
      );

      const map = new Map<string, string>();
      for (const item of entities) {
        const rels = item.relationsList ?? [];
        const avatarRel = rels.find(r => ID.equals(r.typeId, TEMPLATE_ONTOLOGY.AVATAR_PROPERTY_ID));
        const coverRel = rels.find(r => ID.equals(r.typeId, SystemIds.COVER_PROPERTY));
        const chosen = avatarRel ?? coverRel;
        const rawUrl = chosen?.toEntity?.valuesList?.find(v =>
          ID.equals(v.propertyId, TEMPLATE_ONTOLOGY.IMAGE_URL_PROPERTY_ID)
        )?.text;
        const resolved = resolveTemplateImageUrl(rawUrl);
        if (resolved) map.set(ID.uuidToHex(item.id), resolved);
      }
      return map;
    },
  });

  const sources = React.useMemo(() => getClaimSources(entity?.relations ?? []), [entity?.relations]);
  const record = useClaimRecord({ claimId: entityId, spaceId, topicIds });

  // Collect all subclaim IDs (Supporting, Opposing, Related)
  const subClaimSeedList = React.useMemo(() => {
    if (!entity) return [];
    const byId = new Map<string, { id: string; title: string; kind?: ClaimKind; stance?: ClaimStance; href: string }>();

    const upsert = (entry: { id: string; title: string; kind?: ClaimKind; stance?: ClaimStance; href: string }) => {
      if (ID.equals(entry.id, entity.id)) return;
      const key = ID.uuidToHex(entry.id);
      const existing = byId.get(key);
      if (existing) {
        byId.set(key, {
          ...existing,
          stance: existing.stance ?? entry.stance,
          kind: existing.kind ?? entry.kind,
        });
        return;
      }
      byId.set(key, entry);
    };

    for (const c of incomingSupportingClaims) {
      if (!c.name) continue;
      upsert({
        id: c.id,
        title: c.name,
        kind: readClaimKind(c.values),
        stance: 'supports',
        href: NavUtils.toEntity(resolveEntitySpaceId(c, spaceId), c.id),
      });
    }
    for (const c of incomingOpposingClaims) {
      if (!c.name) continue;
      upsert({
        id: c.id,
        title: c.name,
        kind: readClaimKind(c.values),
        stance: 'opposes',
        href: NavUtils.toEntity(resolveEntitySpaceId(c, spaceId), c.id),
      });
    }

    const outgoingSupports = readEntityRelations(entity, [
      TEMPLATE_ONTOLOGY.SUPPORTED_BY_PROPERTY_ID,
      TEMPLATE_ONTOLOGY.SUPPORTING_ARGUMENTS_PROPERTY_ID,
      TEMPLATE_ONTOLOGY.CLAIM_SUPPORTS_PROPERTY_ID,
    ]);
    const outgoingOpposes = readEntityRelations(entity, [
      TEMPLATE_ONTOLOGY.OPPOSED_BY_PROPERTY_ID,
      TEMPLATE_ONTOLOGY.OPPOSING_ARGUMENTS_PROPERTY_ID,
      TEMPLATE_ONTOLOGY.CLAIM_OPPOSES_PROPERTY_ID,
      TEMPLATE_ONTOLOGY.INVERSE_CLAIMS_PROPERTY_ID,
    ]);
    const outgoingAddresses = readEntityRelations(entity, [
      TEMPLATE_ONTOLOGY.CLAIM_ADDRESSES_PROPERTY_ID,
      TEMPLATE_ONTOLOGY.SUBCLAIMS_PROPERTY_ID,
      TEMPLATE_ONTOLOGY.RELATED_CLAIMS_PROPERTY_ID,
    ]);

    for (const rel of outgoingSupports) {
      if (!rel.toEntity.name) continue;
      upsert({
        id: rel.toEntity.id,
        title: rel.toEntity.name,
        stance: 'supports',
        href: NavUtils.toEntity(rel.toSpaceId ?? spaceId, rel.toEntity.id),
      });
    }
    for (const rel of outgoingOpposes) {
      if (!rel.toEntity.name) continue;
      upsert({
        id: rel.toEntity.id,
        title: rel.toEntity.name,
        stance: 'opposes',
        href: NavUtils.toEntity(rel.toSpaceId ?? spaceId, rel.toEntity.id),
      });
    }
    for (const rel of outgoingAddresses) {
      if (!rel.toEntity.name) continue;
      upsert({
        id: rel.toEntity.id,
        title: rel.toEntity.name,
        stance: 'addresses',
        href: NavUtils.toEntity(rel.toSpaceId ?? spaceId, rel.toEntity.id),
      });
    }

    return Array.from(byId.values());
  }, [entity, incomingOpposingClaims, incomingSupportingClaims, spaceId]);

  // Hydrate outgoing subclaims whose `Is factual` value wasn't loaded from incoming entity queries
  const subClaimIdsToHydrate = React.useMemo(
    () => subClaimSeedList.filter(item => item.kind === undefined).map(item => item.id),
    [subClaimSeedList]
  );
  const subClaimHydrateWhere = React.useMemo(() => ({ id: { in: subClaimIdsToHydrate } }), [subClaimIdsToHydrate]);
  const { entities: hydratedSubClaims } = useQueryEntities({
    where: subClaimHydrateWhere,
    first: Math.max(subClaimIdsToHydrate.length, 1),
    enabled: isMounted && subClaimIdsToHydrate.length > 0,
  });
  const hydratedSubClaimKindByHex = React.useMemo(() => {
    const map = new Map<string, ClaimKind>();
    for (const item of hydratedSubClaims) {
      map.set(ID.uuidToHex(item.id), readClaimKind(item.values));
    }
    return map;
  }, [hydratedSubClaims]);

  const subClaimBatchTargets = React.useMemo(
    () => subClaimSeedList.map(item => ({ entityId: item.id, responseKind: 'stance' as const })),
    [subClaimSeedList]
  );

  const subClaimResponseBatch = useClaimResponseSummaryBatch({
    spaceId,
    targets: subClaimBatchTargets,
    enabled: subClaimBatchTargets.length > 0,
  });

  const actionCallbacks = useLiveEntityActions({
    entityId,
    entityName: claimTitleFrom({ entity: entity ?? null, row }) ?? entityId,
    spaceId,
    entity,
    ownerKind: 'claim',
  });

  const model = React.useMemo<ClaimTemplateModel | null>(() => {
    if (!entity) return null;

    const title = claimTitleFrom({ entity, row }) ?? entity.id;
    const spaceLabel = space?.entity?.name?.trim() || 'Everyone';
    const { summary } = state;
    const agreePercent = summary.percent ?? 0;
    const userVote: VoteChoice =
      control.viewerPosition === true ? 'agree' : control.viewerPosition === false ? 'disagree' : null;

    const rows: SplitRow[] =
      summary.total > 0
        ? [
            {
              id: spaceId,
              label: spaceLabel,
              color: '#202020',
              percent: agreePercent,
              voterCount: summary.total,
              isEveryone: true,
              userLabel: userVote ? `You: ${userVote === 'agree' ? 'Agree' : 'Disagree'}` : undefined,
            },
          ]
        : [];

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

    const broaderClaims = readEntityRelations(entity, TEMPLATE_ONTOLOGY.BROADER_CLAIMS_PROPERTY_ID);
    const subClaims: SubClaimModel[] = subClaimSeedList
      .map(item => {
        const hex = ID.uuidToHex(item.id);
        const batch = subClaimResponseBatch.data?.get(
          claimResponseTargetKey({ entityId: item.id, responseKind: 'stance' })
        );
        const localChoice = localSubClaimVotes[hex] ?? null;
        const basePos = batch?.counts.positive ?? 0;
        const baseNeg = batch?.counts.negative ?? 0;
        const pos = basePos + (localChoice === 'agree' ? 1 : 0);
        const neg = baseNeg + (localChoice === 'disagree' ? 1 : 0);
        const total = pos + neg;
        const pct = total > 0 ? Math.round((pos / total) * 100) : undefined;

        return {
          id: item.id,
          title: item.title,
          kind: item.kind ?? hydratedSubClaimKindByHex.get(hex) ?? 'judgment',
          stance: item.stance,
          agreeCount: pos,
          disagreeCount: neg,
          userVote: localChoice,
          onVote: (choice: Exclude<VoteChoice, null>) => setLocalSubClaimVotes(prev => ({ ...prev, [hex]: choice })),
          onClearVote: () => setLocalSubClaimVotes(prev => ({ ...prev, [hex]: null })),
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
            isSplit: total >= 2 && pct !== undefined ? pct > 25 && pct < 75 : false,
            totalVotes: total > 0 ? total : undefined,
          },
          sources: [],
          href: item.href,
        };
      })
      .sort((a, b) => (b.split.totalVotes ?? 0) - (a.split.totalVotes ?? 0));

    const overviewHref = NavUtils.toEntity(spaceId, entityId);

    // Debates gallery cards (with speaker stills & vote actions synced to this claim)
    const debates: TopicRecentDebateModel[] = record.debateRows.slice(0, 8).map(item => {
      const { claimTitle, speakers } = parseDebateTitle(item.title || title, title);
      const normDebateId = ID.uuidToHex(item.entityId).toLowerCase();
      const slot1Avatar = resolveTemplateImageUrl(item.debatePosters?.slot1) ?? `/api/debates/still/${normDebateId}/1`;
      const slot2Avatar = resolveTemplateImageUrl(item.debatePosters?.slot2) ?? `/api/debates/still/${normDebateId}/2`;
      const dateStr = formatUnixSecDate(item.createdAtSec) ?? 'Debate';
      const votesLabel =
        summary.total > 0
          ? `${formatCompactCount(summary.total)} ${summary.total === 1 ? 'vote' : 'votes'}`
          : spaceLabel;

      return {
        id: item.entityId,
        claimId: entity.id,
        claimTitle,
        date: dateStr,
        duration: '',
        votesLabel,
        agreeCount: summary.positive,
        disagreeCount: summary.negative,
        userVote,
        onVote: choice => {
          const target = choice === 'agree';
          if (control.viewerPosition === target) return;
          control.respond(target);
        },
        onClearVote: () => {
          if (control.viewerPosition !== null) {
            control.respond(control.viewerPosition);
          }
        },
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
        split: rows.length > 0 ? { rows, isSplit: summary.isControversial, totalVotes: summary.total } : undefined,
        href: NavUtils.toEntity(item.spaceId || spaceId, item.entityId),
      };
    });

    // Topic pills with circular images
    const topicMediaByHex = topicMediaQuery.data;
    const topics: ClaimTopicPillModel[] = topicRelations.map(relation => {
      const hex = ID.uuidToHex(relation.toEntity.id);
      return {
        id: relation.toEntity.id,
        label: relation.toEntity.name ?? relation.toEntity.id,
        imageUrl: topicMediaByHex?.get(hex) ?? null,
        href: NavUtils.toEntity(relation.toSpaceId ?? spaceId, relation.toEntity.id),
      };
    });

    const sections: EntityListSectionModel[] = [];

    if (broaderClaims.length > 0) {
      sections.push({
        id: 'broader-claims',
        title: 'Part of a bigger claim',
        items: broaderClaims.map(rel => ({
          id: rel.toEntity.id,
          kind: 'claim',
          kindLabel: 'Claim',
          title: rel.toEntity.name ?? rel.toEntity.id,
          href: NavUtils.toEntity(rel.toSpaceId ?? spaceId, rel.toEntity.id),
        })),
      });
    }

    // Merge outgoing Quotes that support claims (live & SDK property IDs) + incoming Quotes supporting this claim.
    const outgoingQuotes = readEntityRelations(entity, [
      TEMPLATE_ONTOLOGY.QUOTES_THAT_SUPPORT_CLAIMS_LIVE_PROPERTY_ID,
      TEMPLATE_ONTOLOGY.QUOTES_THAT_SUPPORT_CLAIMS_PROPERTY_ID,
    ]);
    const quoteItemsMap = new Map<string, { id: string; title: string; href: string }>();
    for (const rel of outgoingQuotes) {
      if (!rel.toEntity.name) continue;
      quoteItemsMap.set(ID.uuidToHex(rel.toEntity.id), {
        id: rel.toEntity.id,
        title: rel.toEntity.name,
        href: NavUtils.toEntity(rel.toSpaceId ?? spaceId, rel.toEntity.id),
      });
    }
    for (const q of incomingSupportingQuotes) {
      if (!q.name) continue;
      const hex = ID.uuidToHex(q.id);
      if (quoteItemsMap.has(hex)) continue;
      quoteItemsMap.set(hex, {
        id: q.id,
        title: q.name,
        href: NavUtils.toEntity(resolveEntitySpaceId(q, spaceId), q.id),
      });
    }
    if (quoteItemsMap.size > 0) {
      sections.push({
        id: 'quotes',
        title: 'Supporting quotes',
        items: Array.from(quoteItemsMap.values()).map(q => ({
          id: q.id,
          kind: 'source',
          kindLabel: 'Quote',
          title: q.title,
          href: q.href,
        })),
      });
    }

    sections.push({
      id: 'sources',
      title: 'Sources & evidence',
      items: sources.map(source => ({
        id: source.id,
        kind: 'source',
        kindLabel: 'Source',
        title: source.name ?? source.id,
        href: NavUtils.toEntity(spaceId, source.id),
      })),
      emptyText: 'No sources',
    });

    // Filter out claims already displayed in Supporting / Opposing / Related subclaims.
    const shownSubClaimHexIds = new Set(subClaimSeedList.map(c => ID.uuidToHex(c.id)));
    const extraRelatedClaims = record.claimRows.filter(item => !shownSubClaimHexIds.has(ID.uuidToHex(item.entityId)));
    if (extraRelatedClaims.length > 0) {
      sections.push({
        id: 'related-claims',
        title: 'More claims in this topic',
        items: extraRelatedClaims.slice(0, 6).map(item => ({
          id: item.entityId,
          kind: 'claim',
          kindLabel: 'Claim',
          title: item.title || item.entityId,
          meta: item.description ?? undefined,
          href: NavUtils.toEntity(item.spaceId || spaceId, item.entityId),
        })),
        action:
          record.claimsTotal && record.claimsTotal > 6
            ? { label: 'All related claims', href: `${overviewHref}/claims` }
            : undefined,
      });
    }

    const graphConnections = extractGraphConnections(entity, spaceId, [
      TOPICS_PROPERTY_ID,
      TEMPLATE_ONTOLOGY.BROADER_CLAIMS_PROPERTY_ID,
      TEMPLATE_ONTOLOGY.SUBCLAIMS_PROPERTY_ID,
      TEMPLATE_ONTOLOGY.SUPPORTED_BY_PROPERTY_ID,
      TEMPLATE_ONTOLOGY.OPPOSED_BY_PROPERTY_ID,
      TEMPLATE_ONTOLOGY.SUPPORTING_ARGUMENTS_PROPERTY_ID,
      TEMPLATE_ONTOLOGY.OPPOSING_ARGUMENTS_PROPERTY_ID,
      TEMPLATE_ONTOLOGY.CLAIM_SUPPORTS_PROPERTY_ID,
      TEMPLATE_ONTOLOGY.CLAIM_OPPOSES_PROPERTY_ID,
      TEMPLATE_ONTOLOGY.CLAIM_ADDRESSES_PROPERTY_ID,
      TEMPLATE_ONTOLOGY.INVERSE_CLAIMS_PROPERTY_ID,
      TEMPLATE_ONTOLOGY.RELATED_CLAIMS_PROPERTY_ID,
      TEMPLATE_ONTOLOGY.SOURCES_PROPERTY_ID,
      TEMPLATE_ONTOLOGY.QUOTES_THAT_SUPPORT_CLAIMS_PROPERTY_ID,
      TEMPLATE_ONTOLOGY.QUOTES_THAT_SUPPORT_CLAIMS_LIVE_PROPERTY_ID,
    ]);
    const flags = extractEntityFlags(entity, spaceId);

    const countSummary =
      summary.total > 0
        ? `${formatCompactCount(summary.total)} ${summary.total === 1 ? 'vote' : 'votes'}`
        : 'No votes yet';

    return {
      id: entity.id,
      title,
      coverUrl: Entities.cover(entity.relations) ?? serverCoverUrl ?? null,
      breadcrumbs,
      kind: readClaimKind(entity.values),
      split: {
        rows,
        isSplit: summary.isControversial,
        totalVotes: summary.total,
      },
      debateCount: record.debatesTotal ?? undefined,
      debatesHref: `${overviewHref}/debates`,
      debates: debates.length > 0 ? debates : undefined,
      topics: topics.length > 0 ? topics : undefined,
      graphConnections: graphConnections.length > 0 ? graphConnections : undefined,
      contextByEntityId: buildEntityContextMap(entity.id, flags),
      voteBox: {
        userVote,
        countSummary,
        hint: control.responseError ?? state.responseBlockedReason ?? undefined,
        disabled: Boolean(state.responseBlockedReason) || !state.isResponseKindResolved,
        onVote: choice => {
          const target = choice === 'agree';
          if (control.viewerPosition === target) return;
          control.respond(target);
        },
        onClear: () => {
          if (control.viewerPosition !== null) {
            control.respond(control.viewerPosition);
          }
        },
      },
      subClaims: subClaims.length > 0 ? subClaims : undefined,
      sections,
    };
  }, [
    control,
    entity,
    entityId,
    hydratedSubClaimKindByHex,
    incomingSupportingQuotes,
    localSubClaimVotes,
    record.claimRows,
    record.claimsTotal,
    record.debateRows,
    record.debatesTotal,
    row,
    serverCoverUrl,
    sources,
    space?.entity?.name,
    spaceId,
    state,
    subClaimResponseBatch.data,
    subClaimSeedList,
    topicMediaQuery.data,
    topicRelations,
  ]);

  return {
    data: model,
    isLoading: isEntityLoading && !entity,
    source: 'live',
    actionCallbacks,
  };
}
