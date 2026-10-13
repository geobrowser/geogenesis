'use client';

import * as React from 'react';

import { CLAIM_RESPONSE_OBJECT_TYPE } from '~/core/claims/browse/claim-response-summary';
import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { useEntityResponders } from '~/core/responses/use-entity-responders';
import { normId } from '~/core/utils/norm-id';

import type { DebatePerson } from '../api';
import { useGeoChatAuth } from '../hooks';
import { useCurrentGeoChatUserId } from '../use-current-geo-chat-user-id';
import { useMinuteClock } from './debate-calendar-controls';
import { type FreeSlot, freeSlotsByUser } from './debate-calendar-model';
import { useDebatePeople, useSchedulablePeople } from './hooks';
import { isExcludedFromPeopleTab } from './people-tab-exclusions';

/** Who on the other side of a claim the viewer could debate: now, or at a booked time (GEO-3244). */
export type ClaimOpponents = {
  /**
   * `loading` until the viewer's side and the reads behind this are in; `none` for a viewer who
   * holds no side or is signed out, who is offered nothing; `ready` otherwise, even when empty.
   */
  status: 'loading' | 'none' | 'ready';
  /** On the other side and online, as the People tab orders them: can be asked now, away, in a debate. */
  online: DebatePerson[];
  /** How many of `online` can be asked right now. */
  askableCount: number;
  /** On the other side with free time in the calendar's two weeks, by `normId(profile_space_id)`. */
  withFreeTime: ReadonlySet<string>;
  /** Everyone's free half-hours, by `normId(user_id)`, for a row that offers a booking. */
  slotsByUser: ReadonlyMap<string, FreeSlot[]>;
};

const EMPTY: Omit<ClaimOpponents, 'status'> = {
  online: [],
  askableCount: 0,
  withFreeTime: new Set(),
  slotsByUser: new Map(),
};

/** Can be asked for a live debate right now: online, at their tab, and not already in one. */
export function isAskableNow(person: DebatePerson): boolean {
  return person.online && !person.away && !person.in_debate;
}

/**
 * The people on the other side of a claim from the viewer, and when each could debate.
 *
 * One answer for the claim page's Request debate button and the popup it opens, so the button
 * never offers people the popup then fails to list. The free-time read is the debate calendar's own
 * (`useSchedulablePeople(…, { calendar: true })`), so opening the calendar from here is a cache hit.
 *
 * Sides come from the graph's responders. Live matching reads geo-chat's readiness instead, so a
 * vote the graph has not indexed yet can be missing here for a few seconds; nothing is enforced on
 * it, so that only delays an offer.
 *
 * `viewerPosition`: `undefined` while unknown, `null` for no side. Pass the host's optimistic side,
 * so a vote just cast counts before it is indexed. `enabled` holds every read off.
 */
export function useClaimOpponents({
  claimId,
  spaceId,
  viewerPosition,
  enabled = true,
}: {
  claimId: string;
  spaceId: string;
  viewerPosition: boolean | null | undefined;
  enabled?: boolean;
}): ClaimOpponents {
  const { authenticated } = useGeoChatAuth();
  const { personalSpaceId } = usePersonalSpaceId();
  const currentUserId = useCurrentGeoChatUserId();
  const asking = enabled && authenticated && typeof viewerPosition === 'boolean';

  const { responders, isLoading: respondersLoading } = useEntityResponders({
    entityId: claimId,
    spaceId,
    objectType: CLAIM_RESPONSE_OBJECT_TYPE,
    responseKind: 'stance',
  });
  const peopleQuery = useDebatePeople(asking);
  const schedulableQuery = useSchedulablePeople(asking, { calendar: true });
  const now = useMinuteClock();

  const opposite = React.useMemo(() => {
    if (typeof viewerPosition !== 'boolean') return new Set<string>();
    const side = viewerPosition ? 'negative' : 'positive';
    return new Set(responders.filter(responder => responder.direction === side).map(r => normId(r.userId)));
  }, [responders, viewerPosition]);

  const isViewer = React.useCallback(
    (person: Pick<DebatePerson, 'user_id' | 'profile_space_id'>) =>
      (currentUserId !== null && normId(person.user_id) === normId(currentUserId)) ||
      (personalSpaceId !== null && normId(person.profile_space_id) === normId(personalSpaceId)),
    [currentUserId, personalSpaceId]
  );
  const isOpponent = React.useCallback(
    (person: Pick<DebatePerson, 'user_id' | 'profile_space_id'>) =>
      opposite.has(normId(person.profile_space_id)) &&
      !isViewer(person) &&
      !isExcludedFromPeopleTab(person.profile_space_id),
    [isViewer, opposite]
  );

  const online = React.useMemo(() => {
    const rank = (person: DebatePerson) => (isAskableNow(person) ? 0 : person.in_debate ? 2 : 1);
    return (peopleQuery.data?.people ?? [])
      .filter(person => person.online && isOpponent(person))
      .sort((left, right) => rank(left) - rank(right));
  }, [isOpponent, peopleQuery.data]);

  const slotsByUser = React.useMemo(
    () => (schedulableQuery.data ? freeSlotsByUser(schedulableQuery.data, now) : new Map<string, FreeSlot[]>()),
    [now, schedulableQuery.data]
  );
  const withFreeTime = React.useMemo(() => {
    const profiles = new Set<string>();
    for (const candidate of schedulableQuery.data?.people ?? []) {
      if (isOpponent(candidate.user) && slotsByUser.has(normId(candidate.user.user_id))) {
        profiles.add(normId(candidate.user.profile_space_id));
      }
    }
    return profiles;
  }, [isOpponent, schedulableQuery.data, slotsByUser]);

  if (!enabled || viewerPosition === undefined) return { status: 'loading', ...EMPTY };
  if (!authenticated || viewerPosition === null) return { status: 'none', ...EMPTY };
  const loading = respondersLoading || peopleQuery.isLoading || schedulableQuery.isLoading;
  if (loading) return { status: 'loading', ...EMPTY };

  return {
    status: 'ready',
    online,
    askableCount: online.filter(isAskableNow).length,
    withFreeTime,
    slotsByUser,
  };
}
