'use client';

import { useRequestToBeEditor } from '~/core/hooks/use-request-to-be-editor';
import { type ActiveEditorRequest } from '~/core/io/subgraph/fetch-proposed-editors';

import { Pending } from '~/design-system/pending';

import { UnderVote } from './request-status-label';

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

  // A still-listed request whose vote has ended is busted: executed requests drop
  // off the list, so this one can no longer execute and the vote can't be revived.
  const isStuck = Boolean(editorRequest?.isVotingEnded);

  const canSubmit = isMember && status === 'idle';

  // Open vote, or just submitted (before the indexer catches up) — show the live
  // vote so we never flip back to "Request again".
  if (status === 'success' || (editorRequest && !isStuck)) {
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
