import { Effect, Either, Schema } from 'effect';

import { Environment } from '~/core/environment';
import { uuidToHex } from '~/core/id/normalize';

import {
  ApiError,
  type ApiProposalListItem,
  ApiProposalListResponseSchema,
  encodePathSegment,
  getSpaceTopicProposalDetails,
  restFetch,
  validateSpaceId,
} from '../rest';
import { AbortError } from './errors';
import { fetchTopicMetadata } from './fetch-topic-metadata';
import { PLACEHOLDER_TOPIC_NAME, type TopicUsage } from './topic-space-usage';

export interface PendingSpaceTopicProposal extends TopicUsage {
  spaceId: string;
  proposalId: string;
  topicId: string;
  topicDescription: string | null;
  topicImage: string;
  direction: 'set' | 'remove';
  yesCount: number;
  noCount: number;
  abstainCount: number;
  endTime: number;
  status: 'PROPOSED' | 'EXECUTABLE' | 'ACCEPTED' | 'REJECTED';
}

const SPACE_TOPIC_ACTION_TYPES = ['SetTopic', 'UnsetTopic'];

function actionTypeToDirection(actionType: string): PendingSpaceTopicProposal['direction'] | null {
  switch (actionType) {
    case 'SET_TOPIC':
    case 'TOPIC_DECLARED':
      return 'set';
    case 'UNSET_TOPIC':
    case 'TOPIC_REMOVED':
      return 'remove';
    default:
      return null;
  }
}

export async function fetchPendingSpaceTopicProposals(spaceId: string): Promise<PendingSpaceTopicProposal[]> {
  const validatedSpaceId = validateSpaceId(spaceId);
  if (!validatedSpaceId) {
    console.error(`Invalid space ID for pending topic proposals: ${spaceId}`);
    return [];
  }

  const encodedSpaceId = encodePathSegment(validatedSpaceId);
  const actionTypesParam = SPACE_TOPIC_ACTION_TYPES.join(',');
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

    throw new Error(`Failed to fetch pending topic proposals for space ${spaceId}: ${String(error)}`);
  }

  const decoded = Schema.decodeUnknownEither(ApiProposalListResponseSchema)(result.right);

  if (Either.isLeft(decoded)) {
    throw new Error(`Failed to decode pending topic proposals for space ${spaceId}: ${String(decoded.left)}`);
  }

  const proposals = decoded.right.proposals
    .map(proposal => mapProposalToSpaceTopicProposal(proposal))
    .filter((proposal): proposal is PendingSpaceTopicProposal => proposal !== null);

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

function mapProposalToSpaceTopicProposal(proposal: ApiProposalListItem): PendingSpaceTopicProposal | null {
  const details = getSpaceTopicProposalDetails(proposal.actions);

  if (!details) {
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
