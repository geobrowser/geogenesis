'use client';

import { useOnboardGuard } from '~/core/hooks/use-onboard-guard';
import { useRequestToBeEditor } from '~/core/hooks/use-request-to-be-editor';

import { Pending } from '~/design-system/pending';

type SpaceEditorsPopoverEditorRequestButtonProps = {
  spaceId: string;
  isMember: boolean;
  hasRequestedSpaceEditorship: boolean;
};

export function SpaceEditorsPopoverEditorRequestButton({
  spaceId,
  isMember,
  hasRequestedSpaceEditorship,
}: SpaceEditorsPopoverEditorRequestButtonProps) {
  const { requestToBeEditor, status } = useRequestToBeEditor({ spaceId });

  const { shouldShowElement } = useOnboardGuard();

  if (!shouldShowElement) {
    return null;
  }

  return (
    <Pending isPending={status === 'pending'} position="end">
      {!hasRequestedSpaceEditorship ? (
        <button type="button" disabled={!isMember || status !== 'idle'} onClick={() => requestToBeEditor()}>
          <RequestButtonText status={status} isMember={isMember} />
        </button>
      ) : (
        <span>
          <UnderVote />
        </span>
      )}
    </Pending>
  );
}

type RequestButtonTextProps = {
  status: 'error' | 'idle' | 'pending' | 'success';
  isMember: boolean;
};

const RequestButtonText = ({ status, isMember }: RequestButtonTextProps) => {
  if (!isMember) return 'Only members can request editorship';

  switch (status) {
    case 'success':
      return <UnderVote />;
    case 'pending':
    case 'idle':
      return 'Request editorship';
    case 'error':
      return 'Error';
    default:
      return null;
  }
};

const UnderVote = () => (
  <div className="inline-flex items-center gap-1">
    <span>Requested</span>
    <span>·</span>
    <span className="text-grey-04">Under vote</span>
  </div>
);
