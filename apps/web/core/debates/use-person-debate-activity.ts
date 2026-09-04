'use client';

import type { TypedDocumentNode } from '@graphql-typed-document-node/core';
import { useQuery } from '@tanstack/react-query';

import { Effect } from 'effect';
import { parse } from 'graphql';

import { uuidToHex } from '~/core/id/normalize';
import { graphql } from '~/core/io/graphql-client';

import { DEBATE_TYPE_ID } from './ontology';
import { POSITION_VOTE_FILTER } from './participant-positions';
import { PERSON_DEBATE_SIDE_TYPE_IDS } from './person-debate-stats';

/**
 * Whether a person has anything to show on a Debates tab, as one cheap request.
 */
const PERSON_DEBATE_ACTIVITY_SOURCE = /* GraphQL */ `
  query PersonDebateActivity(
    $person: UUID!
    $positionFilter: UserVoteFilter!
    $sides: [UUID!]!
    $debateTypes: [UUID!]!
  ) {
    positions: userVotesConnection(first: 1, filter: { and: [$positionFilter, { userId: { is: $person } }] }) {
      totalCount
    }
    debates: relationsConnection(
      first: 1
      filter: {
        typeId: { in: $sides }
        toEntityId: { is: $person }
        fromEntity: { typeIds: { overlaps: $debateTypes } }
      }
    ) {
      totalCount
    }
  }
`;

type PersonDebateActivityResult = {
  positions: { totalCount?: number | null } | null;
  debates: { totalCount?: number | null } | null;
};
type PersonDebateActivityVariables = {
  person: string;
  positionFilter: typeof POSITION_VOTE_FILTER;
  sides: string[];
  debateTypes: string[];
};

const personDebateActivityDocument = parse(PERSON_DEBATE_ACTIVITY_SOURCE) as TypedDocumentNode<
  PersonDebateActivityResult,
  PersonDebateActivityVariables
>;

function fetchPersonHasDebateActivity(personId: string, signal?: AbortSignal): Promise<boolean> {
  return Effect.runPromise(
    graphql({
      query: personDebateActivityDocument,
      variables: {
        person: uuidToHex(personId),
        positionFilter: POSITION_VOTE_FILTER,
        sides: PERSON_DEBATE_SIDE_TYPE_IDS,
        debateTypes: [DEBATE_TYPE_ID],
      },
      decoder: data => (data.positions?.totalCount ?? 0) > 0 || (data.debates?.totalCount ?? 0) > 0,
      signal,
    })
  );
}

/**
 * Gates the Debates tab. Returns `false` until the check resolves, so the tab appears only once it is
 * known to have a page behind it
 */
export function usePersonHasDebateActivity(personId: string, enabled: boolean): boolean {
  const { data } = useQuery({
    queryKey: ['debates', 'person-has-activity', personId],
    enabled: enabled && Boolean(personId),
    staleTime: 5 * 60_000,
    queryFn: ({ signal }) => fetchPersonHasDebateActivity(personId, signal),
  });

  return data ?? false;
}
