'use client';

import * as React from 'react';

import { useAtom } from 'jotai';

import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { uuidToHex } from '~/core/id/normalize';
import { useFeatureFlag } from '~/core/state/feature-flags';
import { normId } from '~/core/utils/norm-id';

import { useClaimEntitiesByIds } from '../claim-picker-page';
import { useDebateClaimsBySpaces, useGeoChatAuth } from '../hooks';
import { useClaimOrderFacts } from '../matchmaking/claim-order-facts';
import { claimRowGroups, placedClaimKey, rowsByPlacedClaim } from '../matchmaking/tagged-claim-entry';
import { isSpaceDebatePublishable, useDebatePublishableSpaces } from '../use-debate-publishable-spaces';
import { useClaimDebateCounts } from './claim-debate-counts';
import { useDebateAgendas } from './debate-agendas';
import { type CalloutClaim, calloutStep, pickCalloutClaims, todaysClaimsInOrder } from './todays-callout';
import { orderAgendaSpaces } from './todays-claims-order';
import { useDebatersSpaceMembership } from './use-debaters-space-membership';
import { todaysClaimsCalloutAtom } from '~/atoms';

const NO_IDS: string[] = [];

/**
 * GEO-3498. The daily Today's claims callout, shared by the side panel and the full-screen hub.
 *
 * The day's set is taken once, the first time every read it is made from has settled: up to
 * `CALLOUT_MAX_CLAIMS` claims the viewer has not answered, the highest-ranked spread across the
 * agendas' spaces (`pickCalloutClaims`). It is stored with the agenda day and the account, so
 * the panel and the hub walk the same set, and a newer agenda day starts a new one — which is also
 * what brings a dismissed callout back.
 *
 * Signed out there is nothing: the reads are all held back.
 */
export function useTodaysCallout() {
  const flagOn = useFeatureFlag('todaysClaims');
  const { authenticated, accountKey } = useGeoChatAuth();
  const enabled = flagOn && authenticated && accountKey !== null;
  const [stored, setStored] = useAtom(todaysClaimsCalloutAtom);

  const agendasQuery = useDebateAgendas(enabled);
  const { publishableSpaceIds, isLoading: publishableLoading } = useDebatePublishableSpaces({ enabled });
  const agendas = React.useMemo(
    () => agendasQuery.agendasIn(spaceId => isSpaceDebatePublishable(spaceId, publishableSpaceIds)),
    [agendasQuery, publishableSpaceIds]
  );
  const day = agendas.newestDay;
  const current = enabled && day !== null && stored.day === day && stored.accountKey === accountKey ? stored : null;
  // Only the first time a day's set is taken. Once it is, nothing below is asked again.
  const choosing = enabled && !agendasQuery.isLoading && !publishableLoading && day !== null && current === null;

  const agendaSpaceIds = React.useMemo(() => agendas.spaces.map(space => space.spaceId), [agendas.spaces]);
  const { personalSpaceId } = usePersonalSpaceId();
  const membership = useDebatersSpaceMembership(
    agendaSpaceIds,
    personalSpaceId ? [personalSpaceId] : NO_IDS,
    choosing && agendaSpaceIds.length > 0
  );

  const countAsks = React.useMemo(
    () => (choosing ? [...agendas.listedAtByClaim].map(([claimId, listedAt]) => ({ claimId, since: listedAt })) : []),
    [agendas.listedAtByClaim, choosing]
  );
  const counts = useClaimDebateCounts(countAsks, countAsks.length > 0);

  const ordered = React.useMemo(
    () =>
      choosing && !membership.isLoading && !counts.isLoading
        ? todaysClaimsInOrder(agendas, orderAgendaSpaces(agendaSpaceIds, membership.debatersIn), claimId =>
            counts.byClaimId?.get(claimId)
          )
        : [],
    [agendaSpaceIds, agendas, choosing, counts.byClaimId, counts.isLoading, membership]
  );

  // Each claim's ranking score, the one Explore's Best orders by (agenda boost included), for picking
  // the highest-ranked across the spaces. Without an answer the set keeps Today's claims order.
  const orderedIds = React.useMemo(() => ordered.map(claim => claim.claimId), [ordered]);
  const scores = useClaimOrderFacts(orderedIds, choosing && orderedIds.length > 0);
  const scoresSettled = !scores.isLoading;

  // The viewer's side on each claim the callout could ask about, then on the day's set: geo-chat's
  // rows, per space, the way the hub's graph-sourced lists read them.
  const placed = current ? current.claims : ordered;
  const rowGroups = React.useMemo(
    () => claimRowGroups(placed.map(claim => ({ spaceId: claim.spaceId, claimId: claim.claimId }))),
    [placed]
  );
  const rows = useDebateClaimsBySpaces(rowGroups);
  const rowsByClaim = React.useMemo(() => rowsByPlacedClaim(rows.claims), [rows.claims]);
  const rowOf = React.useCallback(
    (claim: CalloutClaim) => rowsByClaim.get(placedClaimKey({ spaceId: claim.spaceId, claimId: claim.claimId })),
    [rowsByClaim]
  );
  const answeredInRows = React.useCallback(
    (claimId: string) => {
      const claim = placed.find(candidate => candidate.claimId === claimId);
      return Boolean(claim && rowOf(claim)?.viewer_response);
    },
    [placed, rowOf]
  );

  // Taken once the rows have answered for every space: a set taken over a failed lookup would ask
  // about claims the viewer already holds a side on.
  const rowsSettled = !rows.isLoading && rows.unresolvedSpaceIds.size === 0;
  React.useEffect(() => {
    if (!choosing || ordered.length === 0 || !rowsSettled || !scoresSettled || day === null) return;
    const claims = pickCalloutClaims(
      ordered,
      answeredInRows,
      claimId => scores.facts.get(uuidToHex(claimId))?.rankingScore
    );
    setStored(previous =>
      previous.day === day && previous.accountKey === accountKey
        ? previous
        : { accountKey, day, claims, answered: [], skipped: [], dismissed: false }
    );
  }, [accountKey, answeredInRows, choosing, day, ordered, rowsSettled, scores.facts, scoresSettled, setStored]);

  const step = React.useMemo(() => (current ? calloutStep(current, answeredInRows) : null), [answeredInRows, current]);

  const update = React.useCallback(
    (change: (day: NonNullable<typeof current>) => Partial<NonNullable<typeof current>>) =>
      setStored(previous =>
        previous.day === day && previous.accountKey === accountKey ? { ...previous, ...change(previous) } : previous
      ),
    [accountKey, day, setStored]
  );
  const markAnswered = React.useCallback(
    (claimId: string) =>
      update(previous => (previous.answered.includes(claimId) ? {} : { answered: [...previous.answered, claimId] })),
    [update]
  );
  const skip = React.useCallback(
    (claimId: string) =>
      update(previous => (previous.skipped.includes(claimId) ? {} : { skipped: [...previous.skipped, claimId] })),
    [update]
  );
  const dismiss = React.useCallback(() => update(() => ({ dismissed: true })), [update]);

  // The set's own claims, looked up by id rather than taken from the agendas, so a set taken from
  // an agenda that has since changed still draws.
  const setIds = React.useMemo(() => (current ? current.claims.map(claim => claim.claimId) : NO_IDS), [current]);
  const entities = useClaimEntitiesByIds(setIds);

  const visible = Boolean(current && step && !current.dismissed && current.claims.length > 0);

  return {
    visible,
    claims: current?.claims ?? [],
    step,
    entityOf: React.useCallback(
      (claimId: string) => entities.entities.find(entity => normId(entity.id) === normId(claimId)),
      [entities.entities]
    ),
    entitiesLoading: entities.isLoading,
    rowOf,
    /** Whether a card in `spaceId` may be answered yet: that space's rows have landed. */
    answersReadyIn: React.useCallback(
      (spaceId: string) => !rows.unresolvedSpaceIds.has(spaceId),
      [rows.unresolvedSpaceIds]
    ),
    markAnswered,
    skip,
    dismiss,
  };
}

export type TodaysCallout = ReturnType<typeof useTodaysCallout>;
