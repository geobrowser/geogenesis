'use client';

import * as React from 'react';

import { getClaimSources } from '~/core/claims/browse/claim-sources';
import { useClaimRecord } from '~/core/claims/browse/use-claim-record';
import { claimTitleFrom, useClaimResponseState } from '~/core/claims/browse/use-claim-response-state';
import { CLAIM_TYPE_ID, TOPICS_PROPERTY_ID } from '~/core/claims/ontology';
import type { DebateClaim } from '~/core/debates/api';
import { useDebateClaims } from '~/core/debates/hooks';
import { useClaimPositionControl } from '~/core/debates/matchmaking/matchmaking-claim-card';
import { useSpace } from '~/core/hooks/use-space';
import { ID } from '~/core/id';
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
  type EntityListSectionModel,
  type SplitRow,
  type SubClaimModel,
  type TemplateDataSource,
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
} from '../ontology';
import { useLiveEntityActions } from './use-live-entity-actions';

/**
 * Live Geo adapter for `ClaimTemplate`.
 *
 * Bridges `useQueryEntity`, `useClaimResponseState`, `useClaimPositionControl`, incoming & outgoing
 * stance relations (`Supports`, `Opposes`, `Supported by`, `Opposed by`, `Subclaims`, `Inverse claims`,
 * `Supporting/Opposing arguments`), supporting Quotes (both live and SDK property IDs plus incoming
 * `Quote --[Supports]--> Claim`), `getClaimSources`, `useClaimRecord`, and live `useMutate` actions.
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

  const { entities: incomingSupportingClaims } = useQueryEntities({
    where: incomingSupportsWhere,
    first: 12,
  });
  const { entities: incomingOpposingClaims } = useQueryEntities({
    where: incomingOpposesWhere,
    first: 12,
  });
  const { entities: incomingSupportingQuotes } = useQueryEntities({
    where: incomingQuotesWhere,
    first: 10,
  });

  const topicRelations = React.useMemo(
    () =>
      (entity?.relations ?? []).filter(
        relation => relation.isDeleted !== true && ID.equals(relation.type.id, TOPICS_PROPERTY_ID)
      ),
    [entity?.relations]
  );

  const topicIds = React.useMemo(() => topicRelations.map(relation => relation.toEntity.id), [topicRelations]);
  const sources = React.useMemo(() => getClaimSources(entity?.relations ?? []), [entity?.relations]);
  const record = useClaimRecord({ claimId: entityId, spaceId, topicIds });

  // Collect all subclaim IDs so we can batch-fetch their live vote splits in a single request.
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
      TEMPLATE_ONTOLOGY.SUPPORTING_ARGUMENTS_PROPERTY_ID,
      TEMPLATE_ONTOLOGY.CLAIM_SUPPORTS_PROPERTY_ID,
    ]);
    const outgoingOpposes = readEntityRelations(entity, [
      TEMPLATE_ONTOLOGY.OPPOSING_ARGUMENTS_PROPERTY_ID,
      TEMPLATE_ONTOLOGY.CLAIM_OPPOSES_PROPERTY_ID,
      TEMPLATE_ONTOLOGY.INVERSE_CLAIMS_PROPERTY_ID,
    ]);
    const outgoingAddresses = readEntityRelations(entity, [
      TEMPLATE_ONTOLOGY.CLAIM_ADDRESSES_PROPERTY_ID,
      TEMPLATE_ONTOLOGY.SUBCLAIMS_PROPERTY_ID,
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
    const subClaims: SubClaimModel[] = subClaimSeedList.map(item => {
      const batch = subClaimResponseBatch.data?.get(
        claimResponseTargetKey({ entityId: item.id, responseKind: 'stance' })
      );
      const pos = batch?.counts.positive ?? 0;
      const neg = batch?.counts.negative ?? 0;
      const total = pos + neg;
      const pct = total > 0 ? Math.round((pos / total) * 100) : undefined;
      return {
        id: item.id,
        title: item.title,
        kind: item.kind,
        stance: item.stance,
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
    });

    const overviewHref = NavUtils.toEntity(spaceId, entityId);
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

    if (sources.length > 0) {
      sections.push({
        id: 'sources',
        title: 'Sources',
        items: sources.map(source => ({
          id: source.id,
          kind: 'source',
          kindLabel: 'Source',
          title: source.name ?? source.id,
          href: NavUtils.toEntity(spaceId, source.id),
        })),
      });
    }

    if (record.debateRows.length > 0) {
      sections.push({
        id: 'debates',
        title: 'Debates on this claim',
        items: record.debateRows.slice(0, 4).map(item => ({
          id: item.entityId,
          kind: 'debate',
          kindLabel: 'Debate',
          title: item.title || item.entityId,
          meta: item.description ?? undefined,
          href: NavUtils.toEntity(item.spaceId || spaceId, item.entityId),
        })),
        action:
          record.debatesTotal && record.debatesTotal > 4
            ? { label: `All ${record.debatesTotal} debates`, href: `${overviewHref}/debates` }
            : undefined,
      });
    }

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

    if (topicRelations.length > 0) {
      sections.push({
        id: 'topics',
        title: 'Topics',
        items: topicRelations.map(relation => ({
          id: relation.toEntity.id,
          kind: 'topic',
          kindLabel: 'Topic',
          title: relation.toEntity.name ?? relation.toEntity.id,
          href: NavUtils.toEntity(relation.toSpaceId ?? spaceId, relation.toEntity.id),
        })),
      });
    }

    const graphConnections = extractGraphConnections(entity, spaceId, [
      TOPICS_PROPERTY_ID,
      TEMPLATE_ONTOLOGY.BROADER_CLAIMS_PROPERTY_ID,
      TEMPLATE_ONTOLOGY.SUBCLAIMS_PROPERTY_ID,
      TEMPLATE_ONTOLOGY.SUPPORTING_ARGUMENTS_PROPERTY_ID,
      TEMPLATE_ONTOLOGY.OPPOSING_ARGUMENTS_PROPERTY_ID,
      TEMPLATE_ONTOLOGY.CLAIM_SUPPORTS_PROPERTY_ID,
      TEMPLATE_ONTOLOGY.CLAIM_OPPOSES_PROPERTY_ID,
      TEMPLATE_ONTOLOGY.CLAIM_ADDRESSES_PROPERTY_ID,
      TEMPLATE_ONTOLOGY.INVERSE_CLAIMS_PROPERTY_ID,
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
    incomingSupportingQuotes,
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
    topicRelations,
  ]);

  return {
    data: model,
    isLoading: isEntityLoading && !entity,
    source: 'live',
    actionCallbacks,
  };
}
