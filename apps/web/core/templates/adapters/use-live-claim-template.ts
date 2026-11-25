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
import { CLAIM_RESPONSE_COPY } from '~/core/responses/entity-response';
import { useQueryEntities, useQueryEntity } from '~/core/sync/use-store';
import type { Entity, Relation } from '~/core/types';
import { Entities } from '~/core/utils/entity';
import { normId } from '~/core/utils/norm-id';
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
} from '../ontology';
import { debateParticipantsKey, toDebateGalleryModel } from './debate-gallery-model';
import { sourcesIngestionLink } from './source-ingestion-links';
import { useDebateParticipantsBatch } from './use-debate-participants-batch';
import { useHydratedSourceCards } from './use-hydrated-source-cards';
import { useInitialHydrationGate } from './use-initial-hydration-gate';
import { useLiveEntityActions } from './use-live-entity-actions';
import { useTemplateClaimVoteCounts } from './use-template-claim-vote-counts';
import { useTopicMediaBatch } from './use-topic-media-batch';
import { useEntityWithViewerSources, useViewerSpaceId } from './use-viewer-sources';

/**
 * One quotes section from the Claim's own quote relations plus Quotes that point at the Claim,
 * deduplicated by Quote id. Null when there is nothing to show.
 */
function quoteSection(
  id: string,
  title: string,
  outgoing: readonly Relation[],
  incoming: readonly Entity[],
  spaceId: string
): EntityListSectionModel | null {
  const items = new Map<string, EntityListSectionModel['items'][number]>();
  for (const rel of outgoing) {
    if (!rel.toEntity.name) continue;
    items.set(ID.uuidToHex(rel.toEntity.id), {
      id: rel.toEntity.id,
      kind: 'source',
      kindLabel: 'Quote',
      title: rel.toEntity.name,
      href: NavUtils.toEntity(rel.toSpaceId ?? spaceId, rel.toEntity.id),
    });
  }
  for (const quote of incoming) {
    const hex = ID.uuidToHex(quote.id);
    if (!quote.name || items.has(hex)) continue;
    items.set(hex, {
      id: quote.id,
      kind: 'source',
      kindLabel: 'Quote',
      title: quote.name,
      href: NavUtils.toEntity(resolveEntitySpaceId(quote, spaceId), quote.id),
    });
  }
  return items.size > 0 ? { id, title, items: Array.from(items.values()) } : null;
}

/**
 * Live Geo adapter for `ClaimTemplate`.
 *
 * Bridges `useQueryEntity`, `useClaimResponseState`, `useClaimPositionControl`, incoming & outgoing
 * stance relations (`Supports`, `Opposes`, `Supported by`, `Opposed by`, `Subclaims`, `Inverse claims`,
 * `Supporting/Opposing arguments`) with live vote counts, `Factual`/`Judgment` hydration, and
 * interactive inline voting; Debates gallery cards with speaker stills; Topic pills with images;
 * supporting and opposing Quotes, Sources; and live `useMutate` actions.
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
  // Incoming lists hold only entities in the viewed space.
  const incomingSupportsWhere = React.useMemo(
    () => ({
      types: [{ id: { equals: CLAIM_TYPE_ID } }],
      spaces: [{ equals: normId(spaceId) }],
      relations: [
        {
          typeOf: { id: { equals: TEMPLATE_ONTOLOGY.CLAIM_SUPPORTS_PROPERTY_ID } },
          toEntity: { id: { equals: entityId } },
        },
      ],
    }),
    [entityId, spaceId]
  );
  const incomingOpposesWhere = React.useMemo(
    () => ({
      types: [{ id: { equals: CLAIM_TYPE_ID } }],
      spaces: [{ equals: normId(spaceId) }],
      relations: [
        {
          typeOf: { id: { equals: TEMPLATE_ONTOLOGY.CLAIM_OPPOSES_PROPERTY_ID } },
          toEntity: { id: { equals: entityId } },
        },
      ],
    }),
    [entityId, spaceId]
  );
  const incomingQuotesWhere = React.useCallback(
    (propertyId: string) => ({
      types: [{ id: { equals: TEMPLATE_ONTOLOGY.QUOTE_TYPE_ID } }],
      spaces: [{ equals: normId(spaceId) }],
      relations: [{ typeOf: { id: { equals: propertyId } }, toEntity: { id: { equals: entityId } } }],
    }),
    [entityId, spaceId]
  );
  const incomingSupportingQuotesWhere = React.useMemo(
    () => incomingQuotesWhere(TEMPLATE_ONTOLOGY.CLAIM_SUPPORTS_PROPERTY_ID),
    [incomingQuotesWhere]
  );
  const incomingOpposingQuotesWhere = React.useMemo(
    () => incomingQuotesWhere(TEMPLATE_ONTOLOGY.CLAIM_OPPOSES_PROPERTY_ID),
    [incomingQuotesWhere]
  );

  const [isMounted, setIsMounted] = React.useState(false);
  React.useEffect(() => {
    setIsMounted(true);
  }, []);

  const { entities: incomingSupportingClaims, isLoading: isSupportingLoading } = useQueryEntities({
    where: incomingSupportsWhere,
    first: 12,
    enabled: isMounted,
  });
  const { entities: incomingOpposingClaims, isLoading: isOpposingLoading } = useQueryEntities({
    where: incomingOpposesWhere,
    first: 12,
    enabled: isMounted,
  });
  // The viewer's own personal-space Supports / Opposes claims, so a non-editor who added one from
  // this page sees it (GEO-3836). Disabled signed out or when the page is in their own space.
  const viewerSpaceId = useViewerSpaceId(spaceId);
  const viewerWhere = React.useCallback(
    (propertyId: string) => ({
      types: [{ id: { equals: CLAIM_TYPE_ID } }],
      spaces: [{ equals: normId(viewerSpaceId ?? '') }],
      relations: [{ typeOf: { id: { equals: propertyId } }, toEntity: { id: { equals: entityId } } }],
    }),
    [entityId, viewerSpaceId]
  );
  const viewerSupportsWhere = React.useMemo(
    () => viewerWhere(TEMPLATE_ONTOLOGY.CLAIM_SUPPORTS_PROPERTY_ID),
    [viewerWhere]
  );
  const viewerOpposesWhere = React.useMemo(
    () => viewerWhere(TEMPLATE_ONTOLOGY.CLAIM_OPPOSES_PROPERTY_ID),
    [viewerWhere]
  );
  const { entities: viewerSupportingClaims } = useQueryEntities({
    where: viewerSupportsWhere,
    first: 12,
    enabled: isMounted && viewerSpaceId !== null,
  });
  const { entities: viewerOpposingClaims } = useQueryEntities({
    where: viewerOpposesWhere,
    first: 12,
    enabled: isMounted && viewerSpaceId !== null,
  });
  const { entities: incomingSupportingQuotes } = useQueryEntities({
    where: incomingSupportingQuotesWhere,
    first: 10,
    enabled: isMounted,
  });
  const { entities: incomingOpposingQuotes } = useQueryEntities({
    where: incomingOpposingQuotesWhere,
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

  // Batch-hydrate topic thumbnail images (Avatar preferred, then Cover) for Topic pills
  const topicMediaQuery = useTopicMediaBatch(topicIds);

  // Page-space Sources plus the viewer's own personal-space ones, so a non-member who added a source
  // sees it (GEO-3819).
  const sourcesEntity = useEntityWithViewerSources({ entity, entityId, spaceId });
  const sources = React.useMemo(() => getClaimSources(sourcesEntity?.relations ?? []), [sourcesEntity?.relations]);
  const { items: hydratedSourceCards, isLoading: isSourcesLoading } = useHydratedSourceCards({
    sources,
    spaceId,
    enabled: isMounted,
  });
  const record = useClaimRecord({ claimId: entityId, spaceId, topicIds });

  const debateIdsForParticipants = React.useMemo(
    () => record.debateRows.slice(0, 8).map(item => item.entityId),
    [record.debateRows]
  );
  const debateParticipantsQuery = useDebateParticipantsBatch(debateIdsForParticipants);

  // Collect all subclaim IDs (Supporting, Opposing, Related)
  const subClaimSeedList = React.useMemo(() => {
    if (!entity) return [];
    const byId = new Map<
      string,
      { id: string; title: string; kind?: ClaimKind; stance?: ClaimStance; href: string; spaceId: string }
    >();

    const upsert = (entry: {
      id: string;
      title: string;
      kind?: ClaimKind;
      stance?: ClaimStance;
      href: string;
      spaceId: string;
    }) => {
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

    // A disabled read can still return cached rows, so the viewer's are only taken with a viewer space.
    const supporting = viewerSpaceId
      ? [...incomingSupportingClaims, ...viewerSupportingClaims]
      : incomingSupportingClaims;
    const opposing = viewerSpaceId ? [...incomingOpposingClaims, ...viewerOpposingClaims] : incomingOpposingClaims;

    for (const c of supporting) {
      if (!c.name) continue;
      upsert({
        id: c.id,
        title: c.name,
        kind: readClaimKind(c.values),
        stance: 'supports',
        href: NavUtils.toEntity(resolveEntitySpaceId(c, spaceId), c.id),
        spaceId: resolveEntitySpaceId(c, spaceId),
      });
    }
    for (const c of opposing) {
      if (!c.name) continue;
      upsert({
        id: c.id,
        title: c.name,
        kind: readClaimKind(c.values),
        stance: 'opposes',
        href: NavUtils.toEntity(resolveEntitySpaceId(c, spaceId), c.id),
        spaceId: resolveEntitySpaceId(c, spaceId),
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
    // With the viewer's own personal-space Subclaims / Related claims (`withViewerSources`).
    const outgoingAddresses = readEntityRelations(sourcesEntity, [
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
        spaceId: rel.toSpaceId ?? spaceId,
      });
    }
    for (const rel of outgoingOpposes) {
      if (!rel.toEntity.name) continue;
      upsert({
        id: rel.toEntity.id,
        title: rel.toEntity.name,
        stance: 'opposes',
        href: NavUtils.toEntity(rel.toSpaceId ?? spaceId, rel.toEntity.id),
        spaceId: rel.toSpaceId ?? spaceId,
      });
    }
    for (const rel of outgoingAddresses) {
      if (!rel.toEntity.name) continue;
      upsert({
        id: rel.toEntity.id,
        title: rel.toEntity.name,
        stance: 'addresses',
        href: NavUtils.toEntity(rel.toSpaceId ?? spaceId, rel.toEntity.id),
        spaceId: rel.toSpaceId ?? spaceId,
      });
    }

    return Array.from(byId.values());
  }, [
    entity,
    incomingOpposingClaims,
    incomingSupportingClaims,
    sourcesEntity,
    spaceId,
    viewerOpposingClaims,
    viewerSpaceId,
    viewerSupportingClaims,
  ]);

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

  // Each sub-claim's counts in the space its row votes in, the counts its pills draw (GEO-3819).
  const subClaimVoteCountTargets = React.useMemo(
    () => subClaimSeedList.map(item => ({ claimId: item.id, spaceId: item.spaceId })),
    [subClaimSeedList]
  );
  const subClaimVoteCounts = useTemplateClaimVoteCounts({ pageSpaceId: spaceId, targets: subClaimVoteCountTargets });

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
        const counts = subClaimVoteCounts.countsFor(item.id);
        const pos = counts?.positive ?? 0;
        const neg = counts?.negative ?? 0;
        const total = pos + neg;
        const pct = total > 0 ? Math.round((pos / total) * 100) : undefined;

        return {
          id: item.id,
          title: item.title,
          kind: item.kind ?? hydratedSubClaimKindByHex.get(hex) ?? 'judgment',
          stance: item.stance,
          agreeCount: pos,
          disagreeCount: neg,
          // Votes in the space the row links to, so the vote shows on the sub-claim's own page.
          voteTarget: { claimId: item.id, spaceId: item.spaceId, title: item.title },
          split: {
            rows:
              total > 0 && pct !== undefined
                ? [
                    {
                      id: item.spaceId,
                      label: subClaimVoteCounts.labelFor(item.spaceId, spaceLabel),
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

    // Debates gallery cards (with speaker stills and profile avatars)
    const debateParticipantsByHex = debateParticipantsQuery.data;
    const votesLabel =
      summary.total > 0 ? `${formatCompactCount(summary.total)} ${summary.total === 1 ? 'vote' : 'votes'}` : spaceLabel;
    // Every debate here argued this claim, so the card names it by this page's title.
    const debates: TopicRecentDebateModel[] = record.debateRows
      .slice(0, 8)
      .map(item =>
        toDebateGalleryModel(
          { ...item, title: item.title || title, debateClaim: { entityId: entity.id, name: title } },
          debateParticipantsByHex?.[debateParticipantsKey(item.entityId)],
          { fallbackSpaceId: spaceId, votesLabel }
        )
      );

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

    // Quotes come in two shapes: the Claim's own `Quotes that support/oppose claims` relations, and a
    // Quote's `Supports`/`Opposes` relation to this Claim. Each side reads only its own properties,
    // so an opposing quote never lands under Supporting quotes and vice versa.
    const supportingQuotes = quoteSection(
      'quotes',
      'Supporting quotes',
      readEntityRelations(entity, [
        TEMPLATE_ONTOLOGY.QUOTES_THAT_SUPPORT_CLAIMS_LIVE_PROPERTY_ID,
        TEMPLATE_ONTOLOGY.QUOTES_THAT_SUPPORT_CLAIMS_PROPERTY_ID,
      ]),
      incomingSupportingQuotes,
      spaceId
    );
    if (supportingQuotes) sections.push(supportingQuotes);
    const opposingQuotes = quoteSection(
      'opposing-quotes',
      'Opposing quotes',
      readEntityRelations(entity, TEMPLATE_ONTOLOGY.QUOTES_THAT_OPPOSE_CLAIMS_PROPERTY_ID),
      incomingOpposingQuotes,
      spaceId
    );
    if (opposingQuotes) sections.push(opposingQuotes);

    sections.push({
      id: 'sources',
      title: 'Sources',
      layout: 'cards',
      items: hydratedSourceCards,
      emptyText: 'No sources',
      ingestionLink: sourcesIngestionLink(entity.id, title, spaceId),
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
        // No "All related claims" link (Preston): the section shows its six and stops.
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
      TEMPLATE_ONTOLOGY.QUOTES_THAT_OPPOSE_CLAIMS_PROPERTY_ID,
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
        hint:
          control.responseError ??
          state.responseBlockedReason ??
          (control.needsAccountSetup ? CLAIM_RESPONSE_COPY.finishSetup : undefined),
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
    debateParticipantsQuery.data,
    entity,
    entityId,
    hydratedSubClaimKindByHex,
    incomingOpposingQuotes,
    incomingSupportingQuotes,
    record.claimRows,
    record.debateRows,
    record.debatesTotal,
    row,
    serverCoverUrl,
    hydratedSourceCards,
    space?.entity?.name,
    spaceId,
    state,
    subClaimVoteCounts,
    subClaimSeedList,
    topicMediaQuery.data,
    topicRelations,
  ]);

  const isSectionsLoading = useInitialHydrationGate(
    !isMounted ||
      isSupportingLoading ||
      isOpposingLoading ||
      isSourcesLoading ||
      record.debatesLoading ||
      record.claimsLoading,
    `${ID.uuidToHex(entityId)}:${ID.uuidToHex(spaceId)}`
  );

  return {
    data: model,
    isLoading: isEntityLoading && !entity,
    isSectionsLoading,
    source: 'live',
    actionCallbacks,
  };
}
