import { Effect, Either, Schema } from 'effect';

import { Environment } from '~/core/environment';
import { uuidToHex } from '~/core/id/normalize';

import {
  ApiError,
  type ApiProposalListItem,
  ApiProposalListResponseSchema,
  encodePathSegment,
  getSubspaceProposalDetails,
  restFetch,
  validateSpaceId,
} from '../rest';
import { AbortError } from './errors';
import { fetchTopicMetadata } from './fetch-topic-metadata';
import { PLACEHOLDER_TOPIC_NAME, type TopicUsage } from './topic-space-usage';

export interface PendingSubtopicProposal extends TopicUsage {
  spaceId: string;
  proposalId: string;
  topicId: string;
  topicDescription: string | null;
  topicImage: string;
  direction: 'add' | 'remove';
  yesCount: number;
  noCount: number;
  abstainCount: number;
  endTime: number;
  status: 'PROPOSED' | 'EXECUTABLE' | 'ACCEPTED' | 'REJECTED';
}

const SUBTOPIC_ACTION_TYPES = ['SubspaceTopicDeclared', 'SubspaceTopicRemoved'];

function actionTypeToDirection(actionType: string): 'add' | 'remove' | null {
  switch (actionType) {
    case 'SUBSPACE_TOPIC_DECLARED':
      return 'add';
    case 'SUBSPACE_TOPIC_REMOVED':
      return 'remove';
    default:
      return null;
  }
}

export async function fetchPendingSubtopicProposals(spaceId: string): Promise<PendingSubtopicProposal[]> {
  const validatedSpaceId = validateSpaceId(spaceId);
  if (!validatedSpaceId) {
    console.error(`Invalid space ID for pending subtopic proposals: ${spaceId}`);
    return [];
  }

  const encodedSpaceId = encodePathSegment(validatedSpaceId);
  const actionTypesParam = SUBTOPIC_ACTION_TYPES.join(',');
  const path = `/proposals/space/${encodedSpaceId}/status?actionTypes=${actionTypesParam}&status=PROPOSED&orderBy=end_time&orderDirection=asc`;

  const result = await Effect.runPromise(
    Effect.either(
      restFetch<unknown>({
        endpoint: Environment.getConfig().api,
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

    throw new Error(`Failed to fetch pending subtopic proposals for space ${spaceId}: ${String(error)}`);
  }

  const decoded = Schema.decodeUnknownEither(ApiProposalListResponseSchema)(result.right);

  if (Either.isLeft(decoded)) {
    throw new Error(`Failed to decode pending subtopic proposals for space ${spaceId}: ${String(decoded.left)}`);
  }

  const proposals = decoded.right.proposals
    .map(proposal => mapProposalToSubtopicProposal(proposal))
    .filter((proposal): proposal is PendingSubtopicProposal => proposal !== null);

  if (proposals.length === 0) {
    return [];
  }

  const metadataById = await fetchTopicMetadata([...new Set(proposals.map(proposal => proposal.topicId))]);

  return proposals.map(proposal => ({
    ...proposal,
    name: metadataById.get(proposal.topicId)?.name ?? PLACEHOLDER_TOPIC_NAME,
    topicDescription: metadataById.get(proposal.topicId)?.description ?? null,
    topicImage: metadataById.get(proposal.topicId)?.image ?? '',
    spaces: metadataById.get(proposal.topicId)?.spaces ?? [],
    spacesCount: metadataById.get(proposal.topicId)?.spacesCount ?? 0,
  }));
}

function mapProposalToSubtopicProposal(proposal: ApiProposalListItem): PendingSubtopicProposal | null {
  const details = getSubspaceProposalDetails(proposal.actions);

  if (!details || !('targetTopicId' in details)) {
    return null;
  }

  const direction = actionTypeToDirection(details.actionType);

  if (!direction) {
    return null;
  }

  const topicId = uuidToHex(details.targetTopicId);

  return {
    spaceId: proposal.spaceId,
    proposalId: proposal.proposalId,
    topicId,
    id: topicId,
    name: PLACEHOLDER_TOPIC_NAME,
    spaces: [],
    spacesCount: 0,
    topicDescription: null,
    topicImage: '',
    direction,
    yesCount: proposal.votes.yes,
    noCount: proposal.votes.no,
    abstainCount: proposal.votes.abstain,
    endTime: proposal.timing.endTime,
    status: proposal.status,
  };
}
