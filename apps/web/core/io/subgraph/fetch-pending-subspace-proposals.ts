import { Effect, Either } from 'effect';

import { Environment } from '~/core/environment';
import { validateSpaceId } from '~/core/utils/utils';

import { graphql } from './graphql';

/**
 * Pending subspace proposal — a governance proposal that adds or removes
 * a subspace relationship and hasn't been executed or expired yet.
 */
export interface PendingSubspaceProposal {
  proposalId: string;
  /** The child space being proposed for addition or removal */
  childSpaceId: string;
  childSpaceName: string;
  childSpaceImage: string;
  /** Which relation type is being proposed */
  relationType: 'verified' | 'related';
  /** Whether this is adding or removing the subspace */
  direction: 'add' | 'remove';
  /** Voting progress */
  yesCount: number;
  noCount: number;
  abstainCount: number;
  /** Unix timestamp (seconds) when voting ends */
  endTime: number;
  /** Proposal status */
  status: 'PROPOSED' | 'ACCEPTED' | 'REJECTED' | 'CANCELED' | 'EXECUTED';
}

/**
 * The 6 subspace action types from the GraphQL ProposalActionType enum.
 * We query for all of them to cover add + remove for verified/related.
 * (Topic actions are excluded — they're a different feature.)
 */
const SUBSPACE_ACTION_TYPES = [
  'SUBSPACE_VERIFIED',
  'SUBSPACE_UNVERIFIED',
  'SUBSPACE_RELATED',
  'SUBSPACE_UNRELATED',
] as const;

const ADD_ACTION_TYPES = new Set(['SUBSPACE_VERIFIED', 'SUBSPACE_RELATED']);
const REMOVE_ACTION_TYPES = new Set(['SUBSPACE_UNVERIFIED', 'SUBSPACE_UNRELATED']);

function actionTypeToRelationType(actionType: string): 'verified' | 'related' | null {
  switch (actionType) {
    case 'SUBSPACE_VERIFIED':
    case 'SUBSPACE_UNVERIFIED':
      return 'verified';
    case 'SUBSPACE_RELATED':
    case 'SUBSPACE_UNRELATED':
      return 'related';
    default:
      return null;
  }
}

function actionTypeToDirection(actionType: string): 'add' | 'remove' | null {
  if (ADD_ACTION_TYPES.has(actionType)) return 'add';
  if (REMOVE_ACTION_TYPES.has(actionType)) return 'remove';
  return null;
}

/**
 * Query pending (not yet executed) subspace proposals for a space.
 *
 * Uses proposalActionsConnection filter with the new SUBSPACE_* action types.
 * Filters to proposals that haven't been executed yet (executedAt is null).
 */
const pendingSubspaceProposalsQuery = (spaceId: string) => `
  {
    proposalsConnection(
      filter: {
        spaceId: { is: "${spaceId}" }
        executedAt: { isNull: true }
        proposalActionsConnection: {
          some: {
            actionType: {
              in: [${SUBSPACE_ACTION_TYPES.join(', ')}]
            }
          }
        }
      }
      orderBy: END_TIME_DESC
    ) {
      nodes {
        id
        startTime
        endTime
        yesCount
        noCount
        abstainCount
        proposalActions {
          actionType
          targetId
        }
        proposedSubspaces {
          nodes {
            subspace
            spaceBySubspace {
              id
              page {
                name
              }
            }
          }
        }
      }
    }
  }
`;

interface NetworkProposalAction {
  actionType: string;
  targetId: string | null;
}

interface NetworkProposedSubspaceNode {
  subspace: string;
  spaceBySubspace: {
    id: string;
    page: {
      name: string | null;
    } | null;
  } | null;
}

interface NetworkProposal {
  id: string;
  startTime: string;
  endTime: string;
  yesCount: string;
  noCount: string;
  abstainCount: string;
  proposalActions: NetworkProposalAction[];
  proposedSubspaces: {
    nodes: NetworkProposedSubspaceNode[];
  };
}

interface NetworkResult {
  proposalsConnection: {
    nodes: NetworkProposal[];
  };
}

export async function fetchPendingSubspaceProposals(spaceId: string): Promise<PendingSubspaceProposal[]> {
  if (!validateSpaceId(spaceId)) {
    throw new Error(`Invalid space ID for pending subspace proposals: ${spaceId}`);
  }

  const resultOrError = await Effect.runPromise(
    Effect.either(
      graphql<NetworkResult>({
        query: pendingSubspaceProposalsQuery(spaceId),
        endpoint: Environment.getConfig().api,
      })
    )
  );

  if (Either.isLeft(resultOrError)) {
    const error = resultOrError.left;

    switch (error._tag) {
      case 'AbortError':
        throw error;
      default:
        console.error(`${error._tag}: Unable to fetch pending subspace proposals for space ${spaceId}`);
        return [];
    }
  }

  const proposals = resultOrError.right.proposalsConnection.nodes;

  return proposals.flatMap(proposal => {
    const firstAction = proposal.proposalActions[0];
    if (!firstAction) return [];

    const relationType = actionTypeToRelationType(firstAction.actionType);
    const direction = actionTypeToDirection(firstAction.actionType);

    if (!relationType || !direction) return [];

    // Try to get the child space info from proposedSubspaces
    const proposedSubspace = proposal.proposedSubspaces.nodes[0];
    const childSpaceId = proposedSubspace?.spaceBySubspace?.id ?? proposedSubspace?.subspace ?? '';
    const childSpaceName = proposedSubspace?.spaceBySubspace?.page?.name ?? 'Unknown space';

    // If we can't determine a child space ID, skip this proposal
    if (!childSpaceId) return [];

    return [
      {
        proposalId: proposal.id,
        childSpaceId,
        childSpaceName,
        childSpaceImage: '', // We'll use the placeholder in the UI
        relationType,
        direction,
        yesCount: Number(proposal.yesCount),
        noCount: Number(proposal.noCount),
        abstainCount: Number(proposal.abstainCount),
        endTime: Number(proposal.endTime),
        status: 'PROPOSED' as const,
      },
    ];
  });
}
