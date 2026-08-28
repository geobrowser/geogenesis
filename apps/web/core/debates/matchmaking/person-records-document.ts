import type { TypedDocumentNode } from '@graphql-typed-document-node/core';

import { parse } from 'graphql';

import { responseKindToVoteKind } from '~/core/responses/entity-response';

import { DEBATE_OPPOSED_BY_PROPERTY_ID, DEBATE_SUPPORTED_BY_PROPERTY_ID } from '../ontology';

/**
 * The vote kinds that count as a position someone has taken.
 *
 * Kind 0 is curation — an upvote or downvote on someone else's entity — and the votes table is
 * mostly that: 4,218 curation votes against 812 positions when this was measured. Counting the
 * table unfiltered would label a curation total "positions" and be wrong at any volume, so the
 * kinds are named through the same map the response surfaces use rather than written as 1 and 2.
 */
export const POSITION_VOTE_KINDS = [responseKindToVoteKind('stance'), responseKindToVoteKind('veracity')];

/** Guards the alias builder against ids that would produce invalid GraphQL. */
const ID_PATTERN = /^[0-9a-f]{32}$/i;

/**
 * How many debate relations are read per person per side. A person's whole record is the point, so
 * a truncated page is reported rather than silently counted — see `PersonRecordRow.truncated`.
 * The graph holds 71 `Supported by` relations in total, so this is slack rather than a limit.
 */
export const DEBATE_RELATIONS_PER_SIDE = 100;

export type PersonRecordsQuery = Record<
  string,
  | { totalCount?: number | null; nodes?: Array<{ fromEntityId?: string | null } | null> | null }
  | { createdAt?: string | null }
  | null
  | undefined
>;

export type PersonRecordsVariables = Record<string, string | number[] | number>;

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
} {
  const ids = personIds.filter(id => ID_PATTERN.test(id));

  const declarations = [
    '$supportedBy: UUID!',
    '$opposedBy: UUID!',
    '$positionKinds: [Int!]',
    '$first: Int!',
    ...ids.map((_, index) => `$p${index}: UUID!`),
  ].join(', ');

  const selections = ids
    .map((_, index) => {
      const person = `$p${index}`;
      return `
    ${personAlias(index, 'positions')}: userVotesConnection(
      filter: { userId: { is: ${person} }, voteKind: { in: $positionKinds } }
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

  // An empty selection set is a syntax error, so an empty list still has to produce a valid
  // document. The hook keeps this query disabled with nobody listed; this keeps the builder from
  // being the thing that throws if it is ever called anyway.
  const source = `query PersonRecords(${declarations}) {${selections || '\n    __typename'}\n  }`;

  const variables: PersonRecordsVariables = {
    supportedBy: DEBATE_SUPPORTED_BY_PROPERTY_ID,
    opposedBy: DEBATE_OPPOSED_BY_PROPERTY_ID,
    positionKinds: POSITION_VOTE_KINDS,
    first: DEBATE_RELATIONS_PER_SIDE,
  };
  ids.forEach((id, index) => {
    variables[`p${index}`] = id;
  });

  return {
    document: parse(source) as TypedDocumentNode<PersonRecordsQuery, PersonRecordsVariables>,
    variables,
  };
}
