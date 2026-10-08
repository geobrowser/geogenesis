'use client';

import * as React from 'react';

import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { normId } from '~/core/utils/norm-id';

import type { DebatePerson } from '../api';
import { useClaimEntitiesByIds } from '../claim-picker-page';
import { useParticipantPositions } from '../participant-positions';
import { isSpaceDebatePublishable, useDebatePublishableSpaces } from '../use-debate-publishable-spaces';
import { analyzeMatchingClaims } from './disagreement-counts';
import type { PersonRecord } from './person-record';
import { isPersonId } from './person-records-document';
import { usePersonRecords } from './use-person-records';

/**
 * Whether the records batch has answered for everybody queryable on the current roster.
 *
 * `usePersonRecords` keeps the previous roster's map while a new one lands. Checking the current ids
 * rather than `records.size` keeps that placeholder from reconciling a selection against people who
 * have already left, or clearing it before a newly arrived person's activity has loaded.
 */
function recordsPending(personIds: string[], records: Map<string, PersonRecord>): boolean {
  return personIds.some(personId => isPersonId(personId) && !records.has(personId));
}

/**
 * Everything a person row says about someone beyond presence: matches with the viewer, their record,
 * and the debate spaces they are active in. Shared by the People tab and the calendar (GEO-3152), so
 * the same person reads the same in both, and ranks the same: most matches first.
 *
 * `rosterUnavailable`: the caller's list has not answered yet. An empty list then is a fallback, not
 * an answer, so space activity is reported unavailable rather than settled on nobody.
 */
export function usePersonFacts(
  allPeople: DebatePerson[],
  {
    authenticated,
    rosterUnavailable,
    anchorProfileSpaceId,
  }: {
    authenticated: boolean;
    rosterUnavailable: boolean;
    /**
     * Whose matches to count, when it is not the viewer's: admin New match (GEO-2942) ranks everyone
     * by matches with the debater already picked. `null` counts no matches at all; left out, the
     * viewer. "Viewer" below means this person.
     */
    anchorProfileSpaceId?: string | null;
  }
) {
  const { personalSpaceId, isLoading: personalSpaceLoading } = usePersonalSpaceId();
  const anchor = anchorProfileSpaceId === undefined ? personalSpaceId : anchorProfileSpaceId;
  const viewerProfileSpaceId = authenticated && anchor && isPersonId(anchor) ? anchor : null;
  // The signed-in viewer's own space is still being looked up: who "the viewer" is is not known yet.
  // Settled with no usable space is an answer — such a viewer holds no positions (GEO-3220 review).
  const viewerPending = authenticated && anchorProfileSpaceId === undefined && personalSpaceLoading;
  // One graph read for the viewer and the whole roster. Signed-out visitors have no viewer to
  // compare against, so they do not spend a public query fetching everybody else's positions.
  // The presence service can hand us a malformed profile-space id; keep those out of the graph's
  // UUID filter so one bad roster entry cannot discard every valid person's match data.
  const positionParticipants = React.useMemo(
    () =>
      viewerProfileSpaceId
        ? [
            { profile_space_id: viewerProfileSpaceId },
            ...allPeople.flatMap(person =>
              isPersonId(person.profile_space_id) ? [{ profile_space_id: person.profile_space_id }] : []
            ),
          ]
        : [],
    [allPeople, viewerProfileSpaceId]
  );
  const {
    byClaim: positionsByClaim,
    isLoading: positionsLoading,
    isPlaceholderData: positionsArePlaceholderData,
    error: positionsError,
    hasFetchedData: positionsHaveFetchedData,
  } = useParticipantPositions(positionParticipants, viewerProfileSpaceId, { onlyViewerClaims: true });
  const matchAnalysis = React.useMemo(
    () => analyzeMatchingClaims(positionsByClaim, viewerProfileSpaceId),
    [positionsByClaim, viewerProfileSpaceId]
  );
  // A key-changing roster update retains the previous batch. It is useful placeholder UI for
  // people already present, but an absent entry for somebody new means "unknown", not zero. A
  // same-key background poll is not placeholder data, so settled counts stay visible while polling.
  const matchesKnown =
    viewerProfileSpaceId !== null && !positionsLoading && !positionsArePlaceholderData && positionsError === null;
  /**
   * No answer at all yet, as opposed to `matchesKnown`'s "an answer for this exact roster". For a
   * surface that waits on matches before drawing (the calendar's Matches only), which would
   * otherwise wait again each time the polled roster changes and the held answer stands in.
   */
  const matchesLoading = viewerPending || (viewerProfileSpaceId !== null && positionsLoading);
  /**
   * The read failed with nothing to show for it, as opposed to an answer of no matches. A surface
   * that narrows on matches must not read this as "nobody matches", and should say so; the read's
   * own poll keeps retrying.
   */
  const matchesUnavailable =
    viewerProfileSpaceId !== null && !positionsLoading && positionsError !== null && !positionsHaveFetchedData;
  // Whether the viewer holds any position at all: without one, Matches only can never match (GEO-3220).
  // The scoped read always carries the viewer's own rows. `null` while that is not known.
  const viewerHasPositions = React.useMemo(() => {
    if (!viewerProfileSpaceId) return authenticated && !viewerPending ? false : null;
    if (positionsLoading || positionsError !== null) return null;
    const viewerId = normId(viewerProfileSpaceId);
    for (const rows of positionsByClaim.values()) {
      if (rows.some(row => normId(row.profileSpaceId) === viewerId)) return true;
    }
    return false;
  }, [authenticated, positionsByClaim, positionsError, positionsLoading, viewerPending, viewerProfileSpaceId]);
  const matchingClaimIds = React.useMemo(
    () => [...new Set([...matchAnalysis.byProfile.values()].flatMap(items => items.map(item => item.claimId)))].sort(),
    [matchAnalysis]
  );
  const matchingSpaceIds = React.useMemo(
    () => [...new Set([...matchAnalysis.byProfile.values()].flatMap(items => items.map(item => item.spaceId)))],
    [matchAnalysis]
  );
  const { entities: matchingClaims, isLoading: matchingClaimsLoading } = useClaimEntitiesByIds(matchingClaimIds);
  const matchingClaimNamesById = React.useMemo(
    () => new Map(matchingClaims.map(claim => [normId(claim.id), claim.name])),
    [matchingClaims]
  );

  // Keyed on everyone available rather than on the filtered list, so narrowing re-slices a batch
  // that is already cached instead of firing a request per keystroke.
  const personIds = React.useMemo(() => allPeople.map(person => person.profile_space_id), [allPeople]);
  const records = usePersonRecords(personIds);
  const personRecordsPending = recordsPending(personIds, records);

  const { publishableSpaceIds, isLoading: publishableSpacesLoading } = useDebatePublishableSpaces();
  const publishableSpacesPending = publishableSpaceIds === null && publishableSpacesLoading;
  const spaceActivityUnavailable = rosterUnavailable || publishableSpacesPending || personRecordsPending;

  // "Active in" means evidence of activity, not membership: at least one distinct claim answered
  // or one recorded debate in that space. The same map drives both the row and the filter so a
  // membership-only space cannot appear in one surface but not the other. The publishable-space
  // gate is still the claim picker's authoritative acceptor-editor set. A settled lookup with no
  // answer deliberately fails open, matching `isSpaceDebatePublishable` elsewhere; an in-flight
  // lookup is different, because drawing its unverified spaces would briefly make them selectable.
  // The roster and person records get the same treatment: an absent roster or partial batch must
  // not erase a remembered selection or filter out people whose row has not landed yet.
  const debateSpacesByPerson = React.useMemo(() => {
    const byPerson = new Map<string, string[]>();
    if (spaceActivityUnavailable) return byPerson;

    for (const [personId, record] of records) {
      const activeIds = new Set<string>();
      for (const spaceId of record.activeSpaceIds) {
        if (isSpaceDebatePublishable(spaceId, publishableSpaceIds)) {
          activeIds.add(normId(spaceId));
        }
      }
      byPerson.set(personId, [...activeIds]);
    }
    return byPerson;
  }, [publishableSpaceIds, records, spaceActivityUnavailable]);

  const activeSpaceIds = React.useMemo(() => {
    return new Set(allPeople.flatMap(person => debateSpacesByPerson.get(person.profile_space_id) ?? []));
  }, [allPeople, debateSpacesByPerson]);

  return {
    matchAnalysis,
    matchesKnown,
    viewerHasPositions,
    matchesLoading,
    matchesUnavailable,
    matchingSpaceIds,
    matchingClaimNamesById,
    matchingClaimsLoading,
    records,
    personRecordsPending,
    publishableSpacesPending,
    spaceActivityUnavailable,
    debateSpacesByPerson,
    activeSpaceIds,
  };
}
