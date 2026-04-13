import * as Effect from 'effect/Effect';
import * as Either from 'effect/Either';

import { Environment } from '~/core/environment';
import { graphql } from '~/core/io/subgraph/graphql';

import {
  type GovernanceHomeReviewCategory,
  type GovernanceHomeStatusFilter,
  matchesGovernanceCategory,
} from './fetch-active-proposals-in-editor-spaces';

const PAGE_SIZE = 50;

type NetworkProposal = {
  id: string;
  name: string | null;
  spaceId: string;
  proposalActions: { actionType: string }[];
};

type NetworkResult = {
  proposalsConnection: { nodes: NetworkProposal[] };
};

function buildQuery(opts: {
  memberSpaceId: string;
  spaceIds: string[];
  status: GovernanceHomeStatusFilter;
  nowSec: string;
  offset: number;
}): string {
  const { memberSpaceId, spaceIds, status, nowSec, offset } = opts;

  const spaceClause =
    spaceIds.length === 1
      ? `spaceId: { is: "${spaceIds[0]}" }`
      : `spaceId: { in: [${spaceIds.map(id => `"${id}"`).join(', ')}] }`;

  const statusClause =
    status === 'pending'
      ? `executedAt: { isNull: true } endTime: { greaterThanOrEqualTo: "${nowSec}" }`
      : status === 'accepted'
        ? `executedAt: { isNull: false }`
        : `executedAt: { isNull: true } endTime: { lessThan: "${nowSec}" }`;

  const filterInner = [`proposedBy: { is: "${memberSpaceId}" }`, spaceClause, statusClause]
    .filter(Boolean)
    .join('\n        ');

  return `query {
    proposalsConnection(
      first: ${PAGE_SIZE}
      offset: ${offset}
      orderBy: END_TIME_DESC
      filter: {
        ${filterInner}
      }
    ) {
      nodes {
        id
        name
        spaceId
        proposalActions {
          actionType
        }
      }
    }
  }`;
}

export type MyGovernanceProposalRow = {
  id: string;
  spaceId: string;
  name: string;
  actionType: string;
};

export async function getMyGovernanceProposals(opts: {
  memberSpaceId: string;
  spaceIds: string[];
  spaceFilter?: string;
  category: GovernanceHomeReviewCategory;
  status: GovernanceHomeStatusFilter;
  page?: number;
}): Promise<{ proposals: MyGovernanceProposalRow[]; hasMore: boolean }> {
  const { memberSpaceId, spaceIds, spaceFilter, category, status, page = 0 } = opts;

  const effectiveSpaceIds =
    spaceFilter && spaceFilter !== 'all'
      ? spaceIds.includes(spaceFilter)
        ? [spaceFilter]
        : []
      : spaceIds;

  if (effectiveSpaceIds.length === 0) {
    return { proposals: [], hasMore: false };
  }

  const nowSec = String(Math.floor(Date.now() / 1000));
  const offset = page * PAGE_SIZE;

  const result = await Effect.runPromise(
    Effect.either(
      graphql<NetworkResult>({
        endpoint: Environment.getConfig().api,
        query: buildQuery({
          memberSpaceId,
          spaceIds: effectiveSpaceIds,
          status,
          nowSec,
          offset,
        }),
      })
    )
  );

  if (Either.isLeft(result)) {
    console.error('getMyGovernanceProposals graphql error', result.left);
    return { proposals: [], hasMore: false };
  }

  const nodes = result.right.proposalsConnection?.nodes ?? [];
  const filtered = nodes.filter(n =>
    matchesGovernanceCategory(n.proposalActions[0]?.actionType, category)
  );

  return {
    proposals: filtered.map(n => ({
      id: n.id,
      spaceId: n.spaceId,
      name: n.name?.trim() || 'Proposal',
      actionType: n.proposalActions[0]?.actionType ?? 'UNKNOWN',
    })),
    hasMore: nodes.length === PAGE_SIZE,
  };
}
