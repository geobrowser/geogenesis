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
import {
  claimRowGroups,
  placedAnswersReady,
  placedClaimKey,
  rowsByPlacedClaim,
} from '../matchmaking/tagged-claim-entry';
import { useCanPublishDebateIn } from '../use-can-publish-debate-in';
import { useClaimDebateCounts } from './claim-debate-counts';
import { useDebateAgendas } from './debate-agendas';
import {
  type CalloutClaim,
  type CalloutDay,
  calloutStep,
  pickCalloutClaims,
  todaysClaimsInOrder,
} from './todays-callout';
import { orderAgendaSpaces } from './todays-claims-order';
import { useDebatersSpaceMembership } from './use-debaters-space-membership';
import { todaysClaimsCalloutAtom } from '~/atoms';

const NO_IDS: string[] = [];

/**
 * GEO-3498. The daily Today's claims callout in the debates side panel.
 *
 * The day's set is taken once, the first time every read it is made from has settled: up to
 * `CALLOUT_MAX_CLAIMS` of today's agenda claims the viewer has not answered, highest-ranked first
 * and varied by topic and space (`pickCalloutClaims`). It is stored per account with the agenda
 * day, so the set outlives the panel closing, a reload and other tabs, and a newer agenda day starts a new one — which
 * is also what brings a dismissed callout back. Once nothing is left to ask, the end card stays
 * until dismissed or until the panel closes, and isn't shown again that day.
 *
 * Signed out there is nothing: the reads are all held back.
 */
export function useTodaysCallout() {
  const flagOn = useFeatureFlag('todaysClaimsCallout');
  const { authenticated, accountKey } = useGeoChatAuth();
  const enabled = flagOn && authenticated && accountKey !== null;
  const [stored, setStored] = useAtom(todaysClaimsCalloutAtom);

  const agendasQuery = useDebateAgendas(enabled);
  // The picker's gate (GEO-3489): anyone can publish the agenda type, so an agenda only counts in a
  // space that could carry a published debate. Judged once every agenda space's type has resolved.
  const publishability = useCanPublishDebateIn(agendasQuery.spaceIds, { enabled });
  const agendas = React.useMemo(
    () => agendasQuery.agendasIn(publishability.canPublishDebateIn),
    [agendasQuery, publishability.canPublishDebateIn]
  );
  const day = agendas.newestDay;
  const mine = accountKey !== null ? stored[accountKey] : undefined;
  const current = enabled && day !== null && mine?.day === day ? mine : null;
  // Only the first time a day's set is taken. Once it is, nothing below is asked again.
  const choosing =
    enabled &&
    !agendasQuery.isLoading &&
    !publishability.allowlistLoading &&
    !publishability.typesPending &&
    day !== null &&
    current === null;

  // Member spaces first, which needs the viewer's own space: until it is known, nobody is a member
  // of anything and the order would be taken without it.
  const agendaSpaceIds = React.useMemo(() => agendas.spaces.map(space => space.spaceId), [agendas.spaces]);
  const { personalSpaceId, isLoading: personalSpaceLoading } = usePersonalSpaceId();
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
      choosing && !personalSpaceLoading && !membership.isLoading && !counts.isLoading
        ? todaysClaimsInOrder(agendas, orderAgendaSpaces(agendaSpaceIds, membership.debatersIn), claimId =>
            counts.byClaimId?.get(claimId)
          )
        : [],
    [agendaSpaceIds, agendas, choosing, counts.byClaimId, counts.isLoading, membership, personalSpaceLoading]
  );

  // Each claim's ranking score, the one Explore's Best orders by (agenda boost included). A failed
  // lookup leaves every claim unscored, and the set keeps Today's claims order under the same caps —
  // all of them, even when only one batch failed, so the batches that answered aren't put first.
  const orderedIds = React.useMemo(() => ordered.map(claim => claim.claimId), [ordered]);
  const scores = useClaimOrderFacts(orderedIds, choosing && orderedIds.length > 0);

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
  const answersReadyIn = React.useCallback(
    (spaceId: string) => placedAnswersReady({ authenticated, accountKey }, rows.unresolvedSpaceIds, spaceId),
    [accountKey, authenticated, rows.unresolvedSpaceIds]
  );

  const writeMine = React.useCallback(
    (next: (previous: CalloutDay | undefined) => CalloutDay | undefined) =>
      setStored(previous => {
        if (accountKey === null) return previous;
        const updated = next(previous[accountKey]);
        return updated === previous[accountKey] || !updated ? previous : { ...previous, [accountKey]: updated };
      }),
    [accountKey, setStored]
  );

  // Taken once every space's rows have answered or failed. A space whose rows failed is left out —
  // asking about its claims could ask about a side the viewer already holds — rather than holding
  // the whole callout back for it; with no space answered, nothing is taken and it asks again later.
  React.useEffect(() => {
    if (!choosing || day === null || ordered.length === 0 || rows.isLoading || scores.isLoading) return;
    const answerable = ordered.filter(claim => answersReadyIn(claim.spaceId));
    if (answerable.length === 0) return;
    const claims = pickCalloutClaims(answerable, answeredInRows, claimId =>
      scores.failed ? undefined : scores.facts.get(uuidToHex(claimId))
    );
    // A set already taken for this day or a later one stays: another tab, holding newer agendas
    // than this one's cache, may have taken it, and replacing it would lose that day's progress.
    writeMine(previous =>
      previous && previous.day >= day ? previous : { day, claims, answered: [], skipped: [], dismissed: false }
    );
  }, [answeredInRows, answersReadyIn, choosing, day, ordered, rows.isLoading, scores, writeMine]);

  const step = React.useMemo(() => (current ? calloutStep(current, answeredInRows) : null), [answeredInRows, current]);

  const update = React.useCallback(
    (change: (previous: CalloutDay) => Partial<CalloutDay>) =>
      writeMine(previous => (previous?.day === day ? { ...previous, ...change(previous) } : previous)),
    [day, writeMine]
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

  // The end card is the visit's that reached it: it stays while the panel stays open, and the
  // next time it opens it is gone until the next agenda day. Each mount notes whether
  // the day had already ended when it first saw it, per account, and keeps an ended day hidden even
  // while the viewer's sides are still loading and the set reads as unfinished again; reaching the
  // end here marks the day ended.
  const finished = step !== null && step.current === null;
  const visit = current && accountKey !== null ? `${accountKey}|${current.day}` : null;
  const arrival = React.useRef<{ visit: string; ended: boolean } | null>(null);
  if (visit !== null && current && arrival.current?.visit !== visit) {
    arrival.current = { visit, ended: current.ended === true };
  }
  const endedBeforeThisVisit = visit !== null && arrival.current?.visit === visit && arrival.current.ended;
  React.useEffect(() => {
    if (finished && !current?.ended) update(() => ({ ended: true }));
  }, [current?.ended, finished, update]);

  // The set's claims, from the agendas' own lookup where it has them; only the ones it lacks — a set
  // taken from an agenda that has changed since — are asked for again.
  const agendaEntities = agendasQuery.claimEntities;
  const missingIds = React.useMemo(() => {
    if (!current) return NO_IDS;
    const held = new Set(agendaEntities.map(entity => normId(entity.id)));
    const missing = current.claims.map(claim => claim.claimId).filter(claimId => !held.has(normId(claimId)));
    return missing.length > 0 ? missing : NO_IDS;
  }, [agendaEntities, current]);
  const fetched = useClaimEntitiesByIds(missingIds);
  const entityOf = React.useCallback(
    (claimId: string) =>
      agendaEntities.find(entity => normId(entity.id) === normId(claimId)) ??
      fetched.entities.find(entity => normId(entity.id) === normId(claimId)),
    [agendaEntities, fetched.entities]
  );

  const visible = Boolean(current && step && !current.dismissed && current.claims.length > 0 && !endedBeforeThisVisit);

  return {
    visible,
    claims: current?.claims ?? [],
    step,
    entityOf,
    /**
     * Whether a claim missing from `entityOf` is known to be gone, rather than still loading or lost
     * to a failed lookup — only then may the callout move past it.
     */
    entitiesSettled: !agendasQuery.isLoading && !fetched.isLoading && !agendasQuery.error && !fetched.error,
    rowOf,
    answersReadyIn,
    markAnswered,
    skip,
    dismiss,
  };
}

export type TodaysCallout = ReturnType<typeof useTodaysCallout>;
