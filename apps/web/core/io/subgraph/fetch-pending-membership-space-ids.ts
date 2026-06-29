import { Effect, Either } from 'effect';

import { Environment } from '~/core/environment';
import { normId } from '~/core/utils/norm-id';

import { fetchActiveEditorRequest } from './fetch-proposed-editors';
import { hasActiveMemberProposal } from './fetch-proposed-members';
import { graphql } from './graphql';

// "Pending request" = the space page's exact definition: a proposal whose status
// is PROPOSED or EXECUTABLE (active), as decided by the REST `/active` endpoint.
//
// GraphQL alone can't express that — `ProposalFilter` exposes neither the
// proposal's actions nor its status. So we use GraphQL only to *enumerate*
// candidate spaces (any not-yet-executed proposal with an ADD_MEMBER/ADD_EDITOR
// action targeting the member), then confirm each candidate through the same
// REST endpoint the space page uses. That confirmation step is what drops
// rejected/voting-ended proposals (executedAt is null but status is REJECTED),
// giving exact parity with the per-space "Requested" state.

type ProposalActionType = 'ADD_MEMBER' | 'ADD_EDITOR';

type ActionsResult = {
  proposalActionsConnection: { nodes: { proposalId: string }[] };
};

type ProposalsResult = {
  proposalsConnection: { nodes: { id: string; spaceId: string }[] };
};

function actionsQuery(memberSpaceId: string, actionType: ProposalActionType): string {
  return `{
    proposalActionsConnection(
      first: 500
      filter: { actionType: { is: ${actionType} }, targetId: { is: ${JSON.stringify(memberSpaceId)} } }
    ) {
      nodes { proposalId }
    }
  }`;
}

function proposalsByIdQuery(proposalIds: string[]): string {
  return `{
    proposalsConnection(
      first: ${proposalIds.length}
      filter: { id: { in: ${JSON.stringify(proposalIds)} }, executedAt: { isNull: true } }
    ) {
      nodes { id spaceId }
    }
  }`;
}

async function runQuery<T>(query: string, label: string): Promise<T | null> {
  const resultOrError = await Effect.runPromise(
    Effect.either(graphql<T>({ query, endpoint: Environment.getConfig().api }))
  );

  if (Either.isLeft(resultOrError)) {
    const error = resultOrError.left;
    if (error._tag === 'AbortError') throw error;
    console.error(`${error._tag}: Unable to fetch ${label}`);
    return null;
  }

  return resultOrError.right;
}

/**
 * Distinct, normalized space ids that have a not-yet-executed proposal of the
 * given action type targeting the member. These are *candidates* — REST
 * confirmation narrows them to the truly-active set.
 */
async function fetchCandidateSpaceIds(memberSpaceId: string, actionType: ProposalActionType): Promise<string[]> {
  const actions = await runQuery<ActionsResult>(actionsQuery(memberSpaceId, actionType), `${actionType} actions`);
  const proposalIds = [...new Set((actions?.proposalActionsConnection?.nodes ?? []).map(n => n.proposalId))];
  if (proposalIds.length === 0) return [];

  const proposals = await runQuery<ProposalsResult>(proposalsByIdQuery(proposalIds), `${actionType} proposals`);
  const nodes = proposals?.proposalsConnection?.nodes ?? [];
  return [...new Set(nodes.map(n => normId(n.spaceId)))];
}

/**
 * All spaces where the member has an active (PROPOSED/EXECUTABLE) membership
 * request — exact parity with the space page's `hasActiveMemberProposal` check.
 */
export async function fetchPendingMembershipSpaceIds(memberSpaceId: string): Promise<string[]> {
  const candidates = await fetchCandidateSpaceIds(memberSpaceId, 'ADD_MEMBER');
  if (candidates.length === 0) return [];

  const confirmed = await Promise.all(
    candidates.map(async spaceId => {
      const active = await hasActiveMemberProposal(spaceId, memberSpaceId).catch(() => false);
      return active ? spaceId : null;
    })
  );
  return confirmed.filter((id): id is string => id !== null);
}

/**
 * All spaces where the member has an active (PROPOSED/EXECUTABLE) editorship
 * request — exact parity with the space page's editor-request check.
 */
export async function fetchPendingEditorshipSpaceIds(memberSpaceId: string): Promise<string[]> {
  const candidates = await fetchCandidateSpaceIds(memberSpaceId, 'ADD_EDITOR');
  if (candidates.length === 0) return [];

  const confirmed = await Promise.all(
    candidates.map(async spaceId => {
      const request = await fetchActiveEditorRequest(spaceId, memberSpaceId).catch(() => null);
      return request ? spaceId : null;
    })
  );
  return confirmed.filter((id): id is string => id !== null);
}
