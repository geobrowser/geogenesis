'use client';

import * as React from 'react';

import { getClaimSources } from '~/core/claims/browse/claim-sources';
import { useClaimRecord } from '~/core/claims/browse/use-claim-record';
import { claimTitleFrom, useClaimResponseState } from '~/core/claims/browse/use-claim-response-state';
import { CLAIM_IS_FACTUAL_PROPERTY_ID, TOPICS_PROPERTY_ID } from '~/core/claims/ontology';
import type { DebateClaim } from '~/core/debates/api';
import { useDebateClaims } from '~/core/debates/hooks';
import { useClaimPositionControl } from '~/core/debates/matchmaking/matchmaking-claim-card';
import { ID } from '~/core/id';
import { useQueryEntity } from '~/core/sync/use-store';
import { NavUtils } from '~/core/utils/utils';

import type {
  BreadcrumbItem,
  ClaimKind,
  ClaimTemplateModel,
  EntityListSectionModel,
  SplitRow,
  TemplateDataSource,
  VoteChoice,
} from '../models';

function readClaimKind(values: readonly { property: { id: string }; value: string }[]): ClaimKind {
  const factual = values.find(entry => ID.equals(entry.property.id, CLAIM_IS_FACTUAL_PROPERTY_ID));
  if (factual?.value === '1' || factual?.value.toLowerCase() === 'true') {
    return 'fact';
  }
  return 'judgment';
}

/**
 * Live Geo Tier-1 adapter for `ClaimTemplate`.
 *
 * Bridges `useQueryEntity`, `useClaimResponseState`, `useClaimPositionControl`, `getClaimSources`,
 * and `useClaimRecord` onto `ClaimTemplateModel` so real Agree/Disagree votes publish through the
 * existing Geo response pipeline.
 */
export function useLiveClaimTemplate({
  entityId,
  spaceId,
}: {
  entityId: string;
  spaceId: string;
}): TemplateDataSource<ClaimTemplateModel> {
  const { entity, isLoading: isEntityLoading } = useQueryEntity({ id: entityId, spaceId });
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

  const model = React.useMemo<ClaimTemplateModel | null>(() => {
    if (!entity) return null;

    const title = claimTitleFrom({ entity, row }) ?? entity.id;
    const { summary } = state;
    const agreePercent = summary.percent ?? 0;
    const userVote: VoteChoice =
      control.viewerPosition === true ? 'agree' : control.viewerPosition === false ? 'disagree' : null;

    const rows: SplitRow[] =
      summary.total > 0
        ? [
            {
              id: 'all',
              label: 'Everyone',
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
            href: NavUtils.toEntity(spaceId, firstTopic.toEntity.id),
          },
          { id: entity.id, label: title },
        ]
      : undefined;

    const overviewHref = NavUtils.toEntity(spaceId, entityId);
    const sections: EntityListSectionModel[] = [];

    if (record.claimRows.length > 0) {
      sections.push({
        id: 'related-claims',
        title: 'Related claims',
        items: record.claimRows.slice(0, 6).map(item => ({
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

    if (topicRelations.length > 0) {
      sections.push({
        id: 'topics',
        title: 'Topics',
        items: topicRelations.map(relation => ({
          id: relation.toEntity.id,
          kind: 'topic',
          kindLabel: 'Topic',
          title: relation.toEntity.name ?? relation.toEntity.id,
          href: NavUtils.toEntity(spaceId, relation.toEntity.id),
        })),
      });
    }

    const countSummary =
      summary.total > 0
        ? `${summary.total.toLocaleString('en-US')} ${summary.total === 1 ? 'vote' : 'votes'} (${summary.positive.toLocaleString('en-US')} agree · ${summary.negative.toLocaleString('en-US')} disagree)`
        : 'No votes yet. Be the first to weigh in.';

    return {
      id: entity.id,
      title,
      breadcrumbs,
      kind: readClaimKind(entity.values),
      split: {
        rows,
        isSplit: summary.isControversial,
        totalVotes: summary.total,
      },
      debateCount: record.debatesTotal ?? undefined,
      debatesHref: `${overviewHref}/debates`,
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
      sections,
    };
  }, [
    control,
    entity,
    entityId,
    record.claimRows,
    record.claimsTotal,
    record.debateRows,
    record.debatesTotal,
    row,
    sources,
    spaceId,
    state,
    topicRelations,
  ]);

  return {
    data: model,
    isLoading: isEntityLoading && !entity,
    source: 'live',
  };
}
