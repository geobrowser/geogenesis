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
  StrongestCaseModel,
  SubClaimFactModel,
  TemplateDataSource,
  VoteChoice,
} from '../models';
import { TEMPLATE_ONTOLOGY, readEntityRelations } from '../ontology';

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

    const broaderClaims = readEntityRelations(entity, TEMPLATE_ONTOLOGY.BROADER_CLAIMS_PROPERTY_ID);
    const subClaimRelations = readEntityRelations(entity, TEMPLATE_ONTOLOGY.SUBCLAIMS_PROPERTY_ID);
    const supportingArgs = readEntityRelations(entity, TEMPLATE_ONTOLOGY.SUPPORTING_ARGUMENTS_PROPERTY_ID);
    const opposingArgs = readEntityRelations(entity, TEMPLATE_ONTOLOGY.OPPOSING_ARGUMENTS_PROPERTY_ID);
    const supportsClaims = readEntityRelations(entity, TEMPLATE_ONTOLOGY.CLAIM_SUPPORTS_PROPERTY_ID);
    const opposesClaims = readEntityRelations(entity, TEMPLATE_ONTOLOGY.CLAIM_OPPOSES_PROPERTY_ID);

    const subClaims: SubClaimFactModel[] = subClaimRelations.map(rel => ({
      id: rel.toEntity.id,
      title: rel.toEntity.name ?? rel.toEntity.id,
      split: { rows: [], isSplit: false },
      sources: [],
      href: NavUtils.toEntity(spaceId, rel.toEntity.id),
    }));

    const strongestCases: StrongestCaseModel[] = [];
    if (supportingArgs.length > 0) {
      strongestCases.push({
        id: 'supporting-arguments',
        communityId: 'support',
        title: 'Supporting arguments',
        accentColor: '#127a5b',
        points: supportingArgs.map(rel => rel.toEntity.name ?? rel.toEntity.id),
        sources: [],
      });
    }
    if (opposingArgs.length > 0) {
      strongestCases.push({
        id: 'opposing-arguments',
        communityId: 'oppose',
        title: 'Opposing arguments',
        accentColor: '#d9341c',
        points: opposingArgs.map(rel => rel.toEntity.name ?? rel.toEntity.id),
        sources: [],
      });
    }

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
          href: NavUtils.toEntity(spaceId, rel.toEntity.id),
        })),
      });
    }

    if (supportsClaims.length > 0 || opposesClaims.length > 0) {
      sections.push({
        id: 'stance-links',
        title: 'Connected claims',
        items: [
          ...supportsClaims.map(rel => ({
            id: `supports-${rel.toEntity.id}`,
            kind: 'claim' as const,
            kindLabel: 'Supports',
            title: rel.toEntity.name ?? rel.toEntity.id,
            meta: 'Supports this claim',
            href: NavUtils.toEntity(spaceId, rel.toEntity.id),
          })),
          ...opposesClaims.map(rel => ({
            id: `opposes-${rel.toEntity.id}`,
            kind: 'claim' as const,
            kindLabel: 'Opposes',
            title: rel.toEntity.name ?? rel.toEntity.id,
            meta: 'Opposes this claim',
            href: NavUtils.toEntity(spaceId, rel.toEntity.id),
          })),
        ],
      });
    }

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
      subClaims: subClaims.length > 0 ? subClaims : undefined,
      strongestCases: strongestCases.length > 0 ? strongestCases : undefined,
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
