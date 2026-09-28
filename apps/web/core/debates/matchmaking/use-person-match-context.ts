'use client';

import * as React from 'react';

import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { type SpaceLabel, useSpaceLabels } from '~/core/hooks/use-space-labels';
import { normId } from '~/core/utils/norm-id';

import { useClaimEntitiesByIds } from '../claim-picker-page';
import { useGeoChatAuth } from '../hooks';
import { useParticipantPositions } from '../participant-positions';
import { isSpaceDebatePublishable, useDebatePublishableSpaces } from '../use-debate-publishable-spaces';
import { type ClaimMatch, analyzeMatchingClaims } from './disagreement-counts';
import type { PersonRecord } from './person-record';
import { isPersonId } from './person-records-document';
import { usePersonRecords } from './use-person-records';

const EMPTY_MATCHES: ClaimMatch[] = [];
const EMPTY_SPACE_IDS: string[] = [];

export type PersonMatchContext = {
  record: (profileSpaceId: string) => PersonRecord | null;
  /** Distinct claims on which this person and the viewer hold opposite positions. */
  matches: (profileSpaceId: string) => ClaimMatch[];
  /** Absent until the comparison is known, so a space icon never claims zero matches early. */
  matchesBySpace: (profileSpaceId: string) => ReadonlyMap<string, number> | undefined;
  /** Debate-enabled spaces where this person has a position or a recorded debate. */
  activeSpaceIds: (profileSpaceId: string) => string[];
  claimNamesById: ReadonlyMap<string, string | null>;
  claimNamesLoading: boolean;
  labelsById: Map<string, SpaceLabel>;
};

/**
 * The People tab's per-person context (record, matches, active spaces) for any set of people, so a
 * row elsewhere in the hub can draw the same stats line for someone who is not on the roster.
 *
 * One batch for everybody passed in, the same as the People tab: a row never asks for its own.
 */
export function usePersonMatchContext(profileSpaceIds: string[]): PersonMatchContext {
  const { authenticated } = useGeoChatAuth();
  const { personalSpaceId } = usePersonalSpaceId();
  const viewerProfileSpaceId = authenticated && personalSpaceId && isPersonId(personalSpaceId) ? personalSpaceId : null;

  const personIds = React.useMemo(
    () => [...new Set(profileSpaceIds.filter(id => isPersonId(id)))].sort(),
    [profileSpaceIds]
  );
  const records = usePersonRecords(personIds);

  // The viewer rides along so the comparison has someone to compare against; signed out there is
  // nobody, and nothing is fetched.
  const positionParticipants = React.useMemo(
    () =>
      viewerProfileSpaceId && personIds.length > 0
        ? [{ profile_space_id: viewerProfileSpaceId }, ...personIds.map(id => ({ profile_space_id: id }))]
        : [],
    [personIds, viewerProfileSpaceId]
  );
  const {
    byClaim: positionsByClaim,
    isLoading: positionsLoading,
    isPlaceholderData: positionsArePlaceholderData,
    error: positionsError,
  } = useParticipantPositions(positionParticipants, viewerProfileSpaceId);
  const matchAnalysis = React.useMemo(
    () => analyzeMatchingClaims(positionsByClaim, viewerProfileSpaceId),
    [positionsByClaim, viewerProfileSpaceId]
  );
  const matchesKnown =
    viewerProfileSpaceId !== null && !positionsLoading && !positionsArePlaceholderData && positionsError === null;

  const matchingClaimIds = React.useMemo(
    () => [...new Set([...matchAnalysis.byProfile.values()].flatMap(items => items.map(item => item.claimId)))].sort(),
    [matchAnalysis]
  );
  const { entities: matchingClaims, isLoading: claimNamesLoading } = useClaimEntitiesByIds(matchingClaimIds);
  const claimNamesById = React.useMemo(
    () => new Map(matchingClaims.map(claim => [normId(claim.id), claim.name])),
    [matchingClaims]
  );

  // "Active in" means the same thing it does on People: evidence of activity in a space the claim
  // picker would accept, failing open once that lookup has settled without an answer.
  const { publishableSpaceIds, isLoading: publishableSpacesLoading } = useDebatePublishableSpaces();
  const publishablePending = publishableSpaceIds === null && publishableSpacesLoading;
  const activeSpacesByPerson = React.useMemo(() => {
    const byPerson = new Map<string, string[]>();
    if (publishablePending) return byPerson;
    for (const [personId, record] of records) {
      const ids = new Set<string>();
      for (const spaceId of record.activeSpaceIds) {
        if (isSpaceDebatePublishable(spaceId, publishableSpaceIds)) ids.add(normId(spaceId));
      }
      byPerson.set(personId, [...ids]);
    }
    return byPerson;
  }, [publishablePending, publishableSpaceIds, records]);

  const spaceIdsToLabel = React.useMemo(
    () => [
      ...new Set([
        ...[...activeSpacesByPerson.values()].flat(),
        ...[...matchAnalysis.byProfile.values()].flatMap(items => items.map(item => item.spaceId)),
      ]),
    ],
    [activeSpacesByPerson, matchAnalysis]
  );
  const { labelsById } = useSpaceLabels(spaceIdsToLabel);

  const isViewer = React.useCallback(
    (profileSpaceId: string) =>
      viewerProfileSpaceId !== null && normId(profileSpaceId) === normId(viewerProfileSpaceId),
    [viewerProfileSpaceId]
  );

  return React.useMemo(
    () => ({
      record: profileSpaceId => records.get(profileSpaceId) ?? null,
      matches: profileSpaceId =>
        isViewer(profileSpaceId)
          ? EMPTY_MATCHES
          : (matchAnalysis.byProfile.get(normId(profileSpaceId)) ?? EMPTY_MATCHES),
      matchesBySpace: profileSpaceId =>
        matchesKnown && !isViewer(profileSpaceId)
          ? (matchAnalysis.countsByProfileAndSpace.get(normId(profileSpaceId)) ?? new Map())
          : undefined,
      activeSpaceIds: profileSpaceId => activeSpacesByPerson.get(profileSpaceId) ?? EMPTY_SPACE_IDS,
      claimNamesById,
      claimNamesLoading,
      labelsById,
    }),
    [
      activeSpacesByPerson,
      claimNamesById,
      claimNamesLoading,
      isViewer,
      labelsById,
      matchAnalysis,
      matchesKnown,
      records,
    ]
  );
}
