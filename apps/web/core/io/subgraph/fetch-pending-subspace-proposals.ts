import { Effect, Either, Schema } from 'effect';

import { Environment } from '~/core/environment';
import { uuidToHex } from '~/core/id/normalize';

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
  spaceId: string;
  proposalId: string;
  /** Human-readable proposal name from the API (e.g., "Add Verified Subspace") */
  name: string;
  /** The child space being proposed for addition or removal */
  childSpaceId: string;
  /** Display name of the child space, resolved from the spaces index */
  childSpaceName: string;
  childSpaceDescription: string | null;
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
 * The 4 subspace edge action types (PascalCase for REST API query params).
 * Topic actions are excluded — they're a different feature.
 */
const SUBSPACE_ACTION_TYPES = ['SubspaceVerified', 'SubspaceUnverified', 'SubspaceRelated', 'SubspaceUnrelated'];

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
  switch (actionType) {
    case 'SUBSPACE_VERIFIED':
    case 'SUBSPACE_RELATED':
      return 'add';
    case 'SUBSPACE_UNVERIFIED':
    case 'SUBSPACE_UNRELATED':
      return 'remove';
    default:
      return null;
  }
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

    throw new Error(`Failed to fetch pending subspace proposals for space ${spaceId}: ${String(error)}`);
  }

  const decoded = Schema.decodeUnknownEither(ApiProposalListResponseSchema)(result.right);

  if (Either.isLeft(decoded)) {
    throw new Error(`Failed to decode pending subspace proposals for space ${spaceId}: ${String(decoded.left)}`);
  }

  const proposals = decoded.right.proposals
    .map(proposal => mapProposalToSubspaceProposal(proposal))
    .filter((p): p is PendingSubspaceProposal => p !== null);

  if (proposals.length === 0) return [];

  // Batch-resolve child space names in a single query.
  // Failure is non-fatal — fall back to the proposal name from the API.
  const childSpaceIds = [...new Set(proposals.map(p => p.childSpaceId))];
  const spacesResult = await Effect.runPromise(Effect.either(getSpaces({ spaceIds: childSpaceIds })));

  let metadataById: Map<string, { name: string | null; description: string | null; image: string }>;
  if (Either.isRight(spacesResult)) {
    metadataById = new Map(
      spacesResult.right.map(s => [
        uuidToHex(s.id),
        {
          name: s.entity.name,
          description: s.entity.description,
          image: s.entity.image,
        },
      ])
    );
  } else {
    console.warn(
      'Failed to resolve child space metadata for pending proposals, using fallback names',
      spacesResult.left
    );
    metadataById = new Map();
  }

  return proposals.map(p => ({
    ...p,
    childSpaceName: metadataById.get(uuidToHex(p.childSpaceId))?.name ?? p.name,
    childSpaceDescription: metadataById.get(uuidToHex(p.childSpaceId))?.description ?? null,
    childSpaceImage: metadataById.get(uuidToHex(p.childSpaceId))?.image ?? '',
  }));
}

function mapProposalToSubspaceProposal(proposal: ApiProposalListItem): PendingSubspaceProposal | null {
  const subspaceAction = proposal.actions.find(a => actionTypeToDirection(a.actionType) !== null);
  if (!subspaceAction) return null;

  const relationType = actionTypeToRelationType(subspaceAction.actionType);
  const direction = actionTypeToDirection(subspaceAction.actionType);
  if (!relationType || !direction) return null;

  // targetSpaceId is set by the gaia API for subspace edge actions
  const childSpaceId = subspaceAction.targetSpaceId;
  if (!childSpaceId) return null;

  return {
    spaceId: proposal.spaceId,
    proposalId: proposal.proposalId,
    name: proposal.name ?? 'Space proposal',
    childSpaceId,
    childSpaceName: '', // Resolved after batch fetch
    childSpaceDescription: null,
    childSpaceImage: '',
    relationType,
    direction,
    yesCount: proposal.votes.yes,
    noCount: proposal.votes.no,
    abstainCount: proposal.votes.abstain,
    endTime: proposal.timing.endTime,
    status: 'PROPOSED',
  };
}
