import type { TypedDocumentNode } from '@graphql-typed-document-node/core';

import { Effect } from 'effect';
import { parse } from 'graphql';

import { ID } from '~/core/id';
import { graphql } from '~/core/io/graphql-client';
import {
  GRADE_PROPERTY_ID,
  RANK_VOTES_RELATION_TYPE_ID,
  VOTE_ORDINAL_VALUE_PROPERTY_ID,
} from '~/core/ranking-block-ids';
import { type CursorPage, collectCursorPages } from '~/core/sync/collect-cursor-pages';
import type { Entity } from '~/core/types';
import { normId } from '~/core/utils/norm-id';

import { type BallotGrades, type Grade, parseGrade } from './ranking-grades';

/**
 * The grades on a Best debates ballot (GEO-3729): the `Grade` value on each vote's entity, read in
 * the author's personal space only (anyone can write a value on a public entity in their own space).
 *
 * Every publish deletes and re-creates every vote, so a grade read that comes back short would make
 * the next publish wipe what it missed. The read is a full cursor walk (the API caps a page at
 * 1,000 rows and silently stops an unpaged list at 100), and it must line up with the ballot it
 * belongs to: every vote relation of `rankEntity` comes back, each with its ordinal value, and
 * nothing else. Anything else means the index is mid-update or a publish landed between the two
 * reads, so it is read again, and after that it throws `BallotGradesPendingError` rather than
 * answer "ungraded".
 */

export class BallotGradesPendingError extends Error {
  readonly _tag = 'BallotGradesPendingError';
  constructor(readonly rankId: string) {
    super('Your ranking is still updating. Try again in a moment.');
    this.name = 'BallotGradesPendingError';
  }
}

export function isBallotGradesPendingError(error: unknown): error is BallotGradesPendingError {
  return error instanceof BallotGradesPendingError;
}

const PAGE_SIZE = 1000;

const SOURCE = /* GraphQL */ `
  query BallotGrades(
    $rankId: UUID!
    $spaceId: UUID!
    $typeId: UUID!
    $propertyIds: [UUID!]!
    $first: Int!
    $after: Cursor
  ) {
    relationsConnection(
      first: $first
      after: $after
      filter: { fromEntityId: { is: $rankId }, spaceId: { is: $spaceId }, typeId: { is: $typeId } }
    ) {
      nodes {
        id
        toEntityId
        entity {
          valuesList(filter: { spaceId: { is: $spaceId }, propertyId: { in: $propertyIds } }) {
            propertyId
            text
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

type Node = {
  id: string | null;
  toEntityId: string | null;
  entity: { valuesList: Array<{ propertyId: string | null; text: string | null } | null> | null } | null;
};

type BallotGradesQuery = {
  relationsConnection: {
    nodes: Array<Node | null>;
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
  } | null;
};

type BallotGradesVariables = {
  rankId: string;
  spaceId: string;
  typeId: string;
  propertyIds: string[];
  first: number;
  after: string | null;
};

const document = parse(SOURCE) as TypedDocumentNode<BallotGradesQuery, BallotGradesVariables>;

export type BallotVoteRow = { relationId: string; entityId: string; hasOrdinal: boolean; grade: Grade | null };

export type BallotGradesPageFetcher = (
  rankId: string,
  spaceId: string,
  after: string | undefined
) => Promise<CursorPage<BallotVoteRow>>;

const ordinalKey = normId(VOTE_ORDINAL_VALUE_PROPERTY_ID);
const gradeKey = normId(GRADE_PROPERTY_ID);

export function decodeBallotVoteRow(node: Node): BallotVoteRow | null {
  if (!node.id || !node.toEntityId) return null;
  const values = (node.entity?.valuesList ?? []).flatMap(value => (value?.propertyId ? [value] : []));
  return {
    relationId: node.id,
    entityId: node.toEntityId,
    hasOrdinal: values.some(value => normId(value.propertyId!) === ordinalKey),
    grade: parseGrade(values.find(value => normId(value.propertyId!) === gradeKey)?.text),
  };
}

export const graphBallotGradesPage: BallotGradesPageFetcher = async (rankId, spaceId, after) => {
  const data = await Effect.runPromise(
    graphql({
      query: document,
      variables: {
        rankId,
        spaceId,
        typeId: RANK_VOTES_RELATION_TYPE_ID,
        propertyIds: [VOTE_ORDINAL_VALUE_PROPERTY_ID, GRADE_PROPERTY_ID],
        first: PAGE_SIZE,
        after: after ?? null,
      },
      decoder: (raw: BallotGradesQuery) => raw,
    })
  );
  const connection = data.relationsConnection;
  return {
    items: (connection?.nodes ?? []).flatMap(node => {
      const row = node ? decodeBallotVoteRow(node) : null;
      return row ? [row] : [];
    }),
    endCursor: connection?.pageInfo.endCursor ?? null,
    hasNextPage: connection?.pageInfo.hasNextPage ?? false,
  };
};

/** The vote relation ids of `rankEntity` in the author's space, as the ballot read holds them. */
function ballotRelationIds(rankEntity: Entity, authorSpaceId: string): Set<string> {
  return new Set(
    (rankEntity.relations ?? [])
      .filter(
        relation =>
          !relation.isDeleted &&
          ID.equals(relation.spaceId, authorSpaceId) &&
          ID.equals(relation.fromEntity.id, rankEntity.id) &&
          ID.equals(relation.type.id, RANK_VOTES_RELATION_TYPE_ID)
      )
      .map(relation => normId(relation.id))
  );
}

/**
 * The grades for the ballot `rankEntity` holds, or null when the rows don't line up with it (see
 * the module note).
 */
export function gradesForBallot(
  rows: readonly BallotVoteRow[],
  rankEntity: Entity,
  authorSpaceId: string
): BallotGrades | null {
  const expected = ballotRelationIds(rankEntity, authorSpaceId);
  const seen = new Set<string>();
  const grades = new Map<string, Grade>();
  for (const row of rows) {
    const key = normId(row.relationId);
    if (!expected.has(key) || !row.hasOrdinal) return null;
    seen.add(key);
    if (row.grade && !grades.has(normId(row.entityId))) grades.set(normId(row.entityId), row.grade);
  }
  return seen.size === expected.size ? grades : null;
}

export async function fetchBallotGrades(
  rankEntity: Entity,
  authorSpaceId: string,
  {
    fetchPage = graphBallotGradesPage,
    attempts = 3,
    retryDelayMs = 700,
  }: { fetchPage?: BallotGradesPageFetcher; attempts?: number; retryDelayMs?: number } = {}
): Promise<BallotGrades> {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const rows = await collectCursorPages(after => fetchPage(rankEntity.id, authorSpaceId, after));
    const grades = gradesForBallot(rows, rankEntity, authorSpaceId);
    if (grades) return grades;
    if (attempt < attempts) await new Promise(resolve => setTimeout(resolve, retryDelayMs));
  }
  throw new BallotGradesPendingError(rankEntity.id);
}
