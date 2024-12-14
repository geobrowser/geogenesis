'use client';

import { useRequestToBeMember } from '~/core/hooks/use-request-to-be-member';

import { Pending } from '~/design-system/pending';

type SpaceMembersJoinButtonProps = {
  spaceId: string;
  votingPluginAddress: string | null;
  hasRequestedSpaceMembership: boolean;
};

export function SpaceMembersJoinButton({
  votingPluginAddress,
  hasRequestedSpaceMembership,
}: SpaceMembersJoinButtonProps) {
  const { requestToBeMember, status } = useRequestToBeMember(votingPluginAddress);

  const text = ['idle', 'pending'].includes(status) ? 'Join' : 'Requested';

  return (
    <Pending
      isPending={status === 'pending'}
      position="center"
      className="text-grey-04 transition-colors duration-75 hover:cursor-pointer hover:text-text"
    >
      {!hasRequestedSpaceMembership ? (
        <button onClick={() => requestToBeMember()} disabled={status !== 'idle'}>
          {text}
        </button>
      ) : (
        <span>Requested</span>
      )}
    </Pending>
  );
}
