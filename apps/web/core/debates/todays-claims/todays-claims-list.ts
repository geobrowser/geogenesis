'use client';

import * as React from 'react';

import type { MatchmakingTopic } from '~/core/debates/api';
import { useLastSettled } from '~/core/hooks/use-last-settled';
import { equals as idEquals } from '~/core/id/normalize';
import { normId } from '~/core/utils/norm-id';

import type { ClaimPickerEntity } from '../claim-picker-page';
import { claimTopicsById, topicsFor } from '../matchmaking/topic-facets';
import { isSpaceDebatePublishable, useDebatePublishableSpaces } from '../use-debate-publishable-spaces';
import { useClaimDebateCounts } from './claim-debate-counts';
import { type DebateAgendas, NO_AGENDAS, useDebateAgendas } from './debate-agendas';
import { type TodaysCardScope, todaysCardScope } from './todays-claims-attribution';
import { orderedAgendaSections, todaysSectionKey } from './todays-claims-order';

/** A Today's claims card: the claim, the agenda space it is drawn in, its topics there. */
export type TodaysListClaim = {
  id: string;
  name: string;
  description: string | null;
  spaceId: string;
  topics: MatchmakingTopic[];
  /** GEO-3495's attribution for the card. */
  scope: TodaysCardScope;
};

/** One data block of one space's newest agenda, as the tab draws it. */
export type TodaysListSection = {
  /** By space and block: one block can be linked into two spaces' agendas. */
  key: string;
  /** The agenda's data block, which a section toggle is recorded as. */
  sectionId: string;
  name: string;
  claims: TodaysListClaim[];
};

/**
 * Every space's newest agenda as sections: the lead space first (the lobby's own, when it has one),
 * then the rest by the space ranking, each space's sections in its agenda's order. Inside a section,
 * claims nobody has debated since they were listed come first, then the debated ones, as the picker
 * orders them (GEO-3489). A claim listed in more than one place shows once, at the first; a section
 * left with none is dropped.
 */
export function placeTodaysClaims(
  agendas: DebateAgendas,
  entities: readonly ClaimPickerEntity[],
  {
    leadSpaceId = null,
    debatesOf = () => undefined,
  }: { leadSpaceId?: string | null; debatesOf?: (claimId: string) => number | undefined } = {}
): TodaysListSection[] {
  const entitiesById = new Map(entities.map(entity => [normId(entity.id), entity]));
  const topicsById = claimTopicsById(entities);
  const leads = (spaceId: string) => (leadSpaceId && idEquals(spaceId, leadSpaceId) ? 1 : 0);
  const listed = new Set<string>();

  const sections: TodaysListSection[] = [];
  for (const { section, claimIds } of orderedAgendaSections(agendas, leads, debatesOf)) {
    const claims = claimIds.flatMap(claimId => {
      const entity = entitiesById.get(claimId);
      if (!entity || listed.has(claimId)) return [];
      listed.add(claimId);
      return [
        {
          id: claimId,
          name: entity.name?.trim() ?? '',
          description: entity.description,
          spaceId: section.spaceId,
          topics: topicsFor(topicsById, claimId, section.spaceId) ?? [],
          scope: todaysCardScope(section.agendaId, section.listedOn, debatesOf(claimId), section.id),
        },
      ];
    });
    if (claims.length === 0) continue;
    sections.push({
      key: todaysSectionKey(section.spaceId, section.id),
      sectionId: section.id,
      name: section.name,
      claims,
    });
  }
  return sections;
}

/** The picker row's "N spaces · M claims", counted as the tab draws them. */
export function todaysListCounts(sections: readonly TodaysListSection[]) {
  const spaces = new Set(sections.flatMap(section => section.claims.map(claim => normId(claim.spaceId))));
  return { spaceCount: spaces.size, claimCount: sections.reduce((sum, section) => sum + section.claims.length, 0) };
}

const NO_SECTIONS: TodaysListSection[] = [];

/**
 * GEO-3491. Today's claims as a lobby list: every space's newest agenda, through the picker's shared
 * agendas hook, counting only spaces a debate can be published in, as the lobby's other lists do.
 *
 * With `ordered`, each section also waits for geo-chat's debates-since-listing counts and puts the
 * debated claims last; the order is then held for as long as the tab is open, so a debate recorded
 * meanwhile never moves a card under the reader. The picker's count needs no order and skips them.
 */
export function useTodaysClaimsList({
  leadSpaceId = null,
  ordered = true,
  enabled = true,
}: {
  leadSpaceId?: string | null;
  ordered?: boolean;
  enabled?: boolean;
} = {}) {
  const agendasQuery = useDebateAgendas(enabled);
  const { publishableSpaceIds, isLoading: publishableLoading } = useDebatePublishableSpaces({ enabled });
  const scopeSettled = !agendasQuery.isLoading && !publishableLoading;
  const agendas = React.useMemo(
    () =>
      scopeSettled
        ? agendasQuery.agendasIn(spaceId => isSpaceDebatePublishable(spaceId, publishableSpaceIds))
        : NO_AGENDAS,
    [agendasQuery, publishableSpaceIds, scopeSettled]
  );

  const asks = React.useMemo(
    () =>
      ordered && scopeSettled
        ? [...agendas.listedAtByClaim].map(([claimId, listedAt]) => ({ claimId, since: listedAt }))
        : [],
    [agendas.listedAtByClaim, ordered, scopeSettled]
  );
  const counts = useClaimDebateCounts(asks, enabled && asks.length > 0);

  // A failed count lookup is an answer too: every claim reads as undebated, in the agenda's order.
  const settling = !scopeSettled || (ordered && counts.isLoading);
  // The first counts the order settled on, kept for the life of the tab. The counts sit under the
  // `debates` query root, so a reconnect or a debate finishing anywhere refetches them in the
  // background, and a newer count would move a card under the reader. The picker pins its own the
  // same way (`todaysCountsRef`).
  const pinnedCounts = React.useRef<{ byClaimId: Map<string, number> | null } | null>(null);
  // Only once there were claims to count: pinned on an empty ask (agendas that failed and come back
  // on Try again), every claim would read as undebated for the rest of the visit.
  if (!settling && !pinnedCounts.current && asks.length > 0) pinnedCounts.current = { byClaimId: counts.byClaimId };
  const debatesByClaim = pinnedCounts.current ? pinnedCounts.current.byClaimId : counts.byClaimId;
  const sections = React.useMemo(() => {
    if (settling) return NO_SECTIONS;
    return placeTodaysClaims(agendas, agendasQuery.claimEntities, {
      leadSpaceId,
      debatesOf: claimId => debatesByClaim?.get(claimId),
    });
  }, [agendas, agendasQuery.claimEntities, debatesByClaim, leadSpaceId, settling]);
  // Held once settled: the counts and agendas are read once a visit, but the claims behind them can
  // refetch, and the order is set when the tab opens.
  const held = useLastSettled(sections, settling, `${leadSpaceId ?? ''}:${ordered}`);

  return {
    sections: held,
    /** The newest agenda day, which a section's remembered open state belongs to. */
    newestDay: agendas.newestDay,
    isLoading: settling && held.length === 0,
    error: agendasQuery.error,
    refetch: agendasQuery.refetch,
  };
}
