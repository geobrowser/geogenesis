import { Effect, Either, Schema } from 'effect';

import { Environment } from '~/core/environment';

import { getSpaces } from '../queries';
import {
  ApiError,
  type ApiProposalListItem,
  ApiProposalListResponseSchema,
  encodePathSegment,
  restFetch,
  validateSpaceId,
} from '../rest';
import { AbortError } from './errors';

/**
 * Pending subspace proposal — a governance proposal that adds or removes
 * a subspace relationship and hasn't been executed or expired yet.
 */
export interface PendingSubspaceProposal {
  proposalId: string;
  /** Human-readable proposal name from the API (e.g., "Add Verified Subspace") */
  name: string;
  /** The child space being proposed for addition or removal */
  childSpaceId: string;
  /** Display name of the child space, resolved from the spaces index */
  childSpaceName: string;
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
 * The 4 subspace edge action types (PascalCase for REST API query params).
 * Topic actions are excluded — they're a different feature.
 */
const SUBSPACE_ACTION_TYPES = ['SubspaceVerified', 'SubspaceUnverified', 'SubspaceRelated', 'SubspaceUnrelated'];

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
 * Fetch pending subspace proposals for a space using the REST API.
 *
 * Uses GET /proposals/space/:spaceId/status with:
 * - actionTypes filter for SUBSPACE_* types
 * - status=PROPOSED to only get pending proposals
 * - orderBy=end_time to show soonest-expiring first
 */
export async function fetchPendingSubspaceProposals(spaceId: string): Promise<PendingSubspaceProposal[]> {
  const validatedSpaceId = validateSpaceId(spaceId);
  if (!validatedSpaceId) {
    console.error(`Invalid space ID for pending subspace proposals: ${spaceId}`);
    return [];
  }

  const config = Environment.getConfig();
  const encodedSpaceId = encodePathSegment(validatedSpaceId);
  const actionTypesParam = SUBSPACE_ACTION_TYPES.join(',');
  const path = `/proposals/space/${encodedSpaceId}/status?actionTypes=${actionTypesParam}&status=PROPOSED&orderBy=end_time&orderDirection=asc`;

  const result = await Effect.runPromise(
    Effect.either(
      restFetch<unknown>({
        endpoint: config.api,
        path,
      })
    )
  );

  if (Either.isLeft(result)) {
    const error = result.left;

    if (error instanceof AbortError) {
      throw error;
    }

    if (error instanceof ApiError && error.status === 404) {
      return [];
    }

    console.error(`Failed to fetch pending subspace proposals for space ${spaceId}:`, error);
    return [];
  }

  const decoded = Schema.decodeUnknownEither(ApiProposalListResponseSchema)(result.right);

  if (Either.isLeft(decoded)) {
    console.error(`Failed to decode pending subspace proposals for space ${spaceId}:`, decoded.left);
    return [];
  }

  const proposals = decoded.right.proposals.flatMap(proposal => mapProposalToSubspaceProposal(proposal));

  if (proposals.length === 0) return [];

  // Batch-resolve child space names in a single query
  const childSpaceIds = [...new Set(proposals.map(p => p.childSpaceId))];
  const spaces = await Effect.runPromise(getSpaces({ spaceIds: childSpaceIds }));
  const nameById = new Map(spaces.map(s => [s.id, s.entity.name]));

  return proposals.map(p => ({
    ...p,
    childSpaceName: nameById.get(p.childSpaceId) ?? p.name,
  }));
}

function mapProposalToSubspaceProposal(proposal: ApiProposalListItem): PendingSubspaceProposal[] {
  const subspaceAction = proposal.actions.find(a => {
    const direction = actionTypeToDirection(a.actionType);
    return direction !== null;
  });

  if (!subspaceAction) return [];

  const relationType = actionTypeToRelationType(subspaceAction.actionType);
  const direction = actionTypeToDirection(subspaceAction.actionType);

  if (!relationType || !direction) return [];

  // targetSpaceId is set by the gaia API for subspace edge actions
  const childSpaceId = subspaceAction.targetSpaceId ?? '';
  if (!childSpaceId) return [];

  return [
    {
      proposalId: proposal.proposalId,
      name: proposal.name ?? 'Subspace proposal',
      childSpaceId,
      childSpaceName: '', // Resolved after batch fetch
      relationType,
      direction,
      yesCount: proposal.votes.yes,
      noCount: proposal.votes.no,
      abstainCount: proposal.votes.abstain,
      endTime: proposal.timing.endTime,
      status: 'PROPOSED',
    },
  ];
}
