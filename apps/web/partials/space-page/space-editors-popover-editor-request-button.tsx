'use client';

import { useProposalExecutability } from '~/core/hooks/use-execute-proposal';
import { useRequestToBeEditor } from '~/core/hooks/use-request-to-be-editor';
import { type ActiveEditorRequest } from '~/core/io/subgraph/fetch-proposed-editors';

import { Pending } from '~/design-system/pending';

type SpaceEditorsPopoverEditorRequestButtonProps = {
  spaceId: string;
  isMember: boolean;
  editorRequest: ActiveEditorRequest | null;
};

export function SpaceEditorsPopoverEditorRequestButton({
  spaceId,
  isMember,
  editorRequest,
}: SpaceEditorsPopoverEditorRequestButtonProps) {
  const { requestToBeEditor, status } = useRequestToBeEditor({ spaceId });

  // Only an ended-but-unexecuted request is worth simulating — an open vote is
  // healthy and a missing request has nothing to check. The hook self-gates on
  // an empty proposalId, so this stays a no-op otherwise.
  const { state: executability } = useProposalExecutability({
    spaceId,
    proposalId: editorRequest?.isVotingEnded ? editorRequest.proposalId : '',
  });

  // A confirmed-dead (or otherwise unexecutable) prior request that the chain
  // will never complete. Let the user send a fresh, correct one in one click.
  const isStuck = Boolean(editorRequest?.isVotingEnded) && (executability === 'dead' || executability === 'blocked');

  const canSubmit = isMember && status === 'idle';

  // Just submitted (fresh request or re-apply) — optimistically show the vote is
  // live before the indexer catches up, so we never flip back to "Request again".
  if (status === 'success') {
    return (
      <span>
        <UnderVote />
      </span>
    );
  }

  if (editorRequest && !isStuck) {
    return (
      <span>
        <UnderVote />
      </span>
    );
  }

  return (
    <Pending isPending={status === 'pending'} position="end">
      <button
        type="button"
        disabled={!canSubmit}
        onClick={() => requestToBeEditor()}
        title={isStuck ? "Your previous request can't be completed and needs to be sent again." : undefined}
      >
        <RequestButtonText status={status} isMember={isMember} isStuck={isStuck} />
      </button>
    </Pending>
  );
}

type RequestButtonTextProps = {
  status: 'error' | 'idle' | 'pending' | 'success';
  isMember: boolean;
  isStuck: boolean;
};

const RequestButtonText = ({ status, isMember, isStuck }: RequestButtonTextProps) => {
  if (!isMember) return 'Only members can request editorship';
  if (status === 'error') return 'Error';

  if (isStuck) return 'Must request again';

  return 'Request editorship';
};

const UnderVote = () => (
  <div className="inline-flex items-center gap-1">
    <span>Requested</span>
    <span>·</span>
    <span className="text-grey-04">Under vote</span>
  </div>
);
