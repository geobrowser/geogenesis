import type { TypedDocumentNode } from '@graphql-typed-document-node/core';

import { parse } from 'graphql';

import { uuidToHex } from '~/core/id/normalize';

import { DEBATE_OPPOSED_BY_PROPERTY_ID, DEBATE_SUPPORTED_BY_PROPERTY_ID } from '../ontology';
import { POSITION_VOTE_FILTER } from '../participant-positions';

/**
 * Ids reach this from the presence feed, which is not the service that writes them dashed, so both
 * forms are accepted and normalised on the way into the query.
 */
const ID_PATTERN = /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i;

/** Whether an id can be asked about at all. Shared with the hook so both agree on what is queryable. */
export function isPersonId(id: string): boolean {
  return ID_PATTERN.test(id);
}

/**
 * How many debate relations are read per person per side. A person's whole record is the point, so
 * a truncated page is reported rather than silently counted — see `PersonRecordRow.truncated`.
 * The graph holds 71 `Supported by` relations in total, so this is slack rather than a limit.
 */
export const DEBATE_RELATIONS_PER_SIDE = 100;

export type PersonRecordsQuery = Record<
  string,
  | { totalCount?: number | null; nodes?: Array<{ fromEntityId?: string | null } | null> | null }
  | { createdAt?: string | number | null }
  | null
  | undefined
>;

export type PersonRecordsVariables = Record<string, unknown>;

/** Aliases are positional because a hex id is not a valid GraphQL name — `0f…` cannot start one. */
export function personAlias(index: number, field: 'positions' | 'supported' | 'opposed' | 'joined') {
  return `p${index}_${field}`;
}

/**
 * Every listed person's record in one request.
 *
 * Not a lookup per row: `person.profile_space_id` is the same id that a debate's `Supported by` and
 * `Opposed by` relations point at *and* the same id in `userVotes.userId`, so one aliased request
 * answers for the whole visible list at once and does not grow with how many people are online.
 *
 * Built rather than written because the alias set depends on who is listed. Ids are checked against
 * `ID_PATTERN` and passed as variables, so nothing from the response is interpolated into a query.
 */
export function buildPersonRecordsDocument(personIds: string[]): {
  document: TypedDocumentNode<PersonRecordsQuery, PersonRecordsVariables>;
  variables: PersonRecordsVariables;
  /**
   * The ids this document actually asks about, in alias order. Returned rather than re-derived
   * because aliases are positional: dropping an unusable id compacts every index after it, so
   * decoding against the caller's original list would read one person's record onto another's row.
   */
  ids: string[];
} {
  const ids = personIds.filter(isPersonId);

  // With nobody to ask about there is nothing for the shared variables to filter, and a query that
  // declares a variable it never uses is rejected outright by `NoUnusedVariables` — so the empty
  // document declares none. The hook keeps this query disabled when there is nobody queryable;
  // this keeps the builder from being what breaks if it is ever called anyway.
  if (ids.length === 0) {
    return {
      document: parse('query PersonRecords { __typename }') as TypedDocumentNode<
        PersonRecordsQuery,
        PersonRecordsVariables
      >,
      variables: {},
      ids,
    };
  }

  const declarations = [
    '$supportedBy: UUID!',
    '$opposedBy: UUID!',
    '$positionFilter: UserVoteFilter!',
    '$first: Int!',
    ...ids.map((_, index) => `$p${index}: UUID!`),
  ].join(', ');

  const selections = ids
    .map((_, index) => {
      const person = `$p${index}`;
      return `
    ${personAlias(index, 'positions')}: userVotesConnection(
      filter: { and: [$positionFilter, { userId: { is: ${person} } }] }
    ) { totalCount }
    ${personAlias(index, 'supported')}: relationsConnection(
      first: $first
      filter: { typeId: { is: $supportedBy }, toEntityId: { is: ${person} } }
    ) { totalCount nodes { fromEntityId } }
    ${personAlias(index, 'opposed')}: relationsConnection(
      first: $first
      filter: { typeId: { is: $opposedBy }, toEntityId: { is: ${person} } }
    ) { totalCount nodes { fromEntityId } }
    ${personAlias(index, 'joined')}: entity(id: ${person}) { createdAt }`;
    })
    .join('\n');

  const source = `query PersonRecords(${declarations}) {${selections}\n  }`;

  const variables: PersonRecordsVariables = {
    supportedBy: DEBATE_SUPPORTED_BY_PROPERTY_ID,
    opposedBy: DEBATE_OPPOSED_BY_PROPERTY_ID,
    // The same rows `fetchParticipantPositions` reads, so the count on a row and the positions
    // listed anywhere else cannot mean different things.
    positionFilter: POSITION_VOTE_FILTER,
    first: DEBATE_RELATIONS_PER_SIDE,
  };
  // Normalised for the query, but `ids` keeps the caller's spelling so records can be looked up
  // with the id that was handed in.
  ids.forEach((id, index) => {
    variables[`p${index}`] = uuidToHex(id);
  });

  return {
    document: parse(source) as TypedDocumentNode<PersonRecordsQuery, PersonRecordsVariables>,
    variables,
    ids,
  };
}
