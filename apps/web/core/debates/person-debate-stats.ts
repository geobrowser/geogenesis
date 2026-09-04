import type { TypedDocumentNode } from '@graphql-typed-document-node/core';

import { Effect } from 'effect';
import { parse } from 'graphql';

import type { WinnerShare } from '~/core/claims/browse/claim-debates';
import { equals as idEquals, uuidToHex } from '~/core/id/normalize';
import { graphql } from '~/core/io/graphql-client';

import { DEBATE_OPPOSED_BY_PROPERTY_ID, DEBATE_SUPPORTED_BY_PROPERTY_ID, DEBATE_TYPE_ID } from './ontology';
import type { ParticipantPosition } from './participant-positions';

export const PERSON_DEBATE_SIDE_TYPE_IDS = [DEBATE_SUPPORTED_BY_PROPERTY_ID, DEBATE_OPPOSED_BY_PROPERTY_ID];

export type PersonDebate = { debateId: string };

/**
 * The four figures on the strip.
 */
export type PersonDebateStats = {
  claims: number;
  debates: number;
  winRate: { percent: number; wins: number; judged: number } | null;
  spaceIds: string[];
};

const RELATIONS_PAGE_SIZE = 500;

type RelationNode = { fromEntityId?: string | null };
type PersonDebateRelationsConnection = {
  pageInfo: { hasNextPage: boolean; endCursor: string | null } | null;
  nodes: Array<RelationNode | null> | null;
} | null;
type PersonDebateRelationsResult = { relationsConnection: PersonDebateRelationsConnection };
type PersonDebateRelationsVariables = {
  person: string;
  sides: string[];
  debateTypes: string[];
  first: number;
  after?: string | null;
};

/**
 * Side relations → debate ids. Space for the Spaces figure is resolved later from the hydrated
 * debate entity via `resolveEntitySpaceId`
 */
const PERSON_DEBATE_RELATIONS_SOURCE = `
  query PersonDebateRelations($person: UUID!, $sides: [UUID!]!, $debateTypes: [UUID!]!, $first: Int!, $after: Cursor) {
    relationsConnection(
      first: $first
      after: $after
      filter: {
        typeId: { in: $sides }
        toEntityId: { is: $person }
        fromEntity: { typeIds: { overlaps: $debateTypes } }
      }
    ) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        fromEntityId
      }
    }
  }
`;

const personDebateRelationsDocument = parse(PERSON_DEBATE_RELATIONS_SOURCE) as TypedDocumentNode<
  PersonDebateRelationsResult,
  PersonDebateRelationsVariables
>;

/**
 * Every debate the person argued, de-duplicated by debate id.
 */
export async function fetchPersonDebates(personId: string, signal?: AbortSignal): Promise<PersonDebate[]> {
  const byDebateId = new Map<string, PersonDebate>();
  let after: string | null | undefined = undefined;

  while (true) {
    const connection: PersonDebateRelationsConnection = await Effect.runPromise(
      graphql({
        query: personDebateRelationsDocument,
        variables: {
          person: uuidToHex(personId),
          sides: PERSON_DEBATE_SIDE_TYPE_IDS,
          debateTypes: [DEBATE_TYPE_ID],
          first: RELATIONS_PAGE_SIZE,
          after,
        },
        decoder: data => data.relationsConnection,
        signal,
      })
    );

    for (const node of connection?.nodes ?? []) {
      if (!node?.fromEntityId) continue;
      // De-dup on the canonical id, but keep the raw one the indexer returned. Downstream it is fed
      // to `id in` (hydrating the debate entities) and to the winner-share vote lookup, both of which
      // compare id strings raw against the store — so they must get the id-form the store holds, which
      // is the indexer's, not a normalized one. This mirrors the People tab, which keeps the raw id too.
      const key = uuidToHex(node.fromEntityId);
      if (byDebateId.has(key)) continue;
      byDebateId.set(key, { debateId: node.fromEntityId });
    }

    if (!connection?.pageInfo?.hasNextPage || !connection.pageInfo.endCursor) break;
    after = connection.pageInfo.endCursor;
  }

  return [...byDebateId.values()];
}

/**
 * The four figures, derived once every input is settled.
 */
export function derivePersonDebateStats({
  personId,
  positions,
  debates,
  debateSpaceIds,
  winnerShares,
}: {
  personId: string;
  positions: ParticipantPosition[];
  debates: PersonDebate[];
  debateSpaceIds: string[];
  winnerShares: Map<string, WinnerShare>;
}): PersonDebateStats {
  const claimIds = new Set(positions.map(position => uuidToHex(position.claimId)));

  let wins = 0;
  let judged = 0;
  for (const { debateId } of debates) {
    const share = winnerShares.get(uuidToHex(debateId));
    if (!share || share.totalVotes === 0) continue;
    judged += 1;

    if (share.tied || idEquals(share.spaceId, personId)) wins += 1;
  }

  const spaceIds = [
    ...new Set([...positions.map(position => uuidToHex(position.spaceId)), ...debateSpaceIds.map(uuidToHex)]),
  ];

  return {
    claims: claimIds.size,
    debates: debates.length,
    winRate: judged > 0 ? { percent: Math.round((wins / judged) * 100), wins, judged } : null,
    spaceIds,
  };
}
