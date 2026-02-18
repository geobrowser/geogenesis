import { Effect, Either, Schema } from 'effect';

import { Environment } from '~/core/environment';
import { restFetch, ApiProposalStatusResponseSchema, encodePathSegment } from '~/core/io/rest';
import { defaultProfile, fetchProfileBySpaceId } from '~/core/io/subgraph/fetch-profile';
import { Profile } from '~/core/types';

export async function fetchProposedEditorForProposal(proposalId: string): Promise<Profile> {
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
    console.error(`Failed to fetch proposal ${proposalId} for proposed editor:`, result.left);
    return defaultProfile('');
  }

  const decoded = Schema.decodeUnknownEither(ApiProposalStatusResponseSchema)(result.right);

  if (Either.isLeft(decoded)) {
    console.error(`Failed to decode proposal ${proposalId} for proposed editor:`, decoded.left);
    return defaultProfile('');
  }

  const proposal = decoded.right;
  const editorAction = proposal.actions.find(a => a.actionType === 'ADD_EDITOR' || a.actionType === 'REMOVE_EDITOR');

  if (!editorAction?.targetId) {
    return defaultProfile('');
  }

  return await Effect.runPromise(fetchProfileBySpaceId(editorAction.targetId));
}
