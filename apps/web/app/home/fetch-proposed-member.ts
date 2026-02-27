import { Effect, Either, Schema } from 'effect';

import { Environment } from '~/core/environment';
import { ApiProposalStatusResponseSchema, encodePathSegment, restFetch } from '~/core/io/rest';
import { fetchProfileBySpaceId } from '~/core/io/subgraph/fetch-profile';
import { Profile } from '~/core/types';

export async function fetchProposedMemberForProposal(proposalId: string): Promise<Profile | null> {
  const config = Environment.getConfig();
  const path = `/proposals/${encodePathSegment(proposalId)}/status`;

  const result = await Effect.runPromise(
    Effect.either(
      restFetch<unknown>({
        endpoint: config.api,
        path,
      })
    )
  );

  if (Either.isLeft(result)) {
    console.error(`Failed to fetch proposal ${proposalId} for proposed member:`, result.left);
    return null;
  }

  const decoded = Schema.decodeUnknownEither(ApiProposalStatusResponseSchema)(result.right);

  if (Either.isLeft(decoded)) {
    console.error(`Failed to decode proposal ${proposalId} for proposed member:`, decoded.left);
    return null;
  }

  const proposal = decoded.right;
  const memberAction = proposal.actions.find(a => a.actionType === 'ADD_MEMBER' || a.actionType === 'REMOVE_MEMBER');

  if (!memberAction?.targetId) {
    return null;
  }

  return await Effect.runPromise(fetchProfileBySpaceId(memberAction.targetId));
}
