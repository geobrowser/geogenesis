import { Effect, Either, Schema } from 'effect';

import { SUBTOPIC_RELATION_TYPE_ID } from '~/core/constants';
import { Environment } from '~/core/environment';

import {
  ApiError,
  type ApiProposalListItem,
  ApiProposalListResponseSchema,
  encodePathSegment,
  restFetch,
  spaceIdToGraphqlUuid,
  validateSpaceId,
} from '../rest';
import { AbortError } from './errors';
import { fetchProposalDiffs } from './fetch-proposal-diffs';
import { fetchSubtopicAncestorPath, formatSubtopicPath } from './fetch-subtopic-ancestor-path';
import { fetchTopicMetadata } from './fetch-topic-metadata';
import { PLACEHOLDER_TOPIC_NAME } from './topic-space-usage';

export interface PendingSubtopicProposal {
  spaceId: string;
  proposalId: string;
  direction: 'add' | 'remove';
  parentEntityId: string;
  childEntityId: string;
  name: string;
  path: string;
  yesCount: number;
  noCount: number;
  abstainCount: number;
  endTime: number;
  status: 'PROPOSED' | 'EXECUTABLE' | 'ACCEPTED' | 'REJECTED';
}

const MAX_PROPOSALS_TO_SCAN = 30;

async function fetchPublishProposals(spaceId: string): Promise<readonly ApiProposalListItem[]> {
  const encodedSpaceId = encodePathSegment(spaceId);
  const path = `/proposals/space/${encodedSpaceId}/status?actionTypes=Publish&status=PROPOSED&orderBy=end_time&orderDirection=asc&limit=${MAX_PROPOSALS_TO_SCAN}`;

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

  return decoded.right.proposals;
}

export async function fetchPendingSubtopicProposals(
  spaceId: string,
  rootEntityId: string
): Promise<PendingSubtopicProposal[]> {
  const validatedSpaceId = validateSpaceId(spaceId);
  if (!validatedSpaceId) {
    console.error(`Invalid space ID for pending subtopic proposals: ${spaceId}`);
    return [];
  }

  const proposals = await fetchPublishProposals(validatedSpaceId);
  const pending: PendingSubtopicProposal[] = [];
  const resolvedSpaceId = spaceIdToGraphqlUuid(validatedSpaceId);

  for (const proposal of proposals) {
    const diffResult = await fetchProposalDiffs(proposal.proposalId, validatedSpaceId);

    if (diffResult.status !== 'success') {
      continue;
    }

    for (const entityDiff of diffResult.entities) {
      for (const relation of entityDiff.relations) {
        if (
          relation.typeId !== SUBTOPIC_RELATION_TYPE_ID ||
          validateSpaceId(relation.spaceId) !== validatedSpaceId
        ) {
          continue;
        }

        if (relation.changeType === 'ADD' && relation.after?.toEntityId) {
          pending.push({
            spaceId: resolvedSpaceId,
            proposalId: proposal.proposalId,
            direction: 'add',
            parentEntityId: entityDiff.entityId,
            childEntityId: relation.after.toEntityId,
            name: relation.after.toEntityName ?? PLACEHOLDER_TOPIC_NAME,
            path: '',
            yesCount: proposal.votes.yes,
            noCount: proposal.votes.no,
            abstainCount: proposal.votes.abstain,
            endTime: proposal.timing.endTime,
            status: proposal.status,
          });
        }

        if (relation.changeType === 'REMOVE' && relation.before?.toEntityId) {
          pending.push({
            spaceId: resolvedSpaceId,
            proposalId: proposal.proposalId,
            direction: 'remove',
            parentEntityId: entityDiff.entityId,
            childEntityId: relation.before.toEntityId,
            name: relation.before.toEntityName ?? PLACEHOLDER_TOPIC_NAME,
            path: '',
            yesCount: proposal.votes.yes,
            noCount: proposal.votes.no,
            abstainCount: proposal.votes.abstain,
            endTime: proposal.timing.endTime,
            status: proposal.status,
          });
        }
      }
    }
  }

  if (pending.length === 0) {
    return [];
  }

  const pathByParent = new Map<string, string>();

  for (const parentId of new Set(pending.map(item => item.parentEntityId))) {
    const segments = await fetchSubtopicAncestorPath(parentId, rootEntityId, validatedSpaceId);
    pathByParent.set(parentId, formatSubtopicPath(segments));
  }

  const metadataById = await fetchTopicMetadata([...new Set(pending.map(item => item.childEntityId))]);

  return pending.map(item => ({
    ...item,
    path: pathByParent.get(item.parentEntityId) ?? '',
    name: metadataById.get(item.childEntityId)?.name ?? item.name,
  }));
}
